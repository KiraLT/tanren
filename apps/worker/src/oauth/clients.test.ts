import { describe, expect, it } from "@effect/vitest"
import { Array as Arr, Effect, Fiber, Layer, Option, Redacted, Ref } from "effect"
import { TestClock } from "effect/testing"
import { Tokens } from "../auth/Tokens"
import {
  CIMD_MAX_BYTES,
  ClientResolver,
  type ClientRuntime,
  isAcceptableRedirectUri,
  isMetadataDocumentUrl,
  MAX_REDIRECT_URI_LENGTH,
  MAX_REDIRECT_URIS,
  register,
} from "./clients"
import { clientTrust } from "./knownClients"

const CONFIG = {
  betterAuthUrl: "http://localhost:8787",
  betterAuthSecret: Redacted.make("test-secret-0000000000000000000000000000"), // test only
  mcpResourceUrl: "http://localhost:8787/mcp",
}
const DOC_URL = "https://claude.ai/oauth/claude-code-client-metadata"
const document = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    client_id: DOC_URL,
    client_name: "Claude Code",
    redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"],
    ...overrides,
  })

/** A fake fetch answering `response()` and counting calls; no cache. */
const runtimeWith = (response: () => Response, calls: Ref.Ref<number>): ClientRuntime => ({
  fetch: (_url, init) => {
    expect(init.redirect).toBe("manual")
    Effect.runSync(Ref.update(calls, (n) => n + 1))
    return Promise.resolve(response())
  },
  cache: Effect.succeed(Option.none()),
})

const jsonResponse = (body: string, init: ResponseInit = {}) =>
  new Response(body, { status: 200, headers: { "content-type": "application/json" }, ...init })

const resolveIn = (clientId: string) =>
  Effect.gen(function* () {
    return yield* (yield* ClientResolver).resolve(clientId)
  })

const resolveWith = (response: () => Response, clientId: string) =>
  Effect.gen(function* () {
    const calls = yield* Ref.make(0)
    const layer = ClientResolver.layerWith(runtimeWith(response, calls)).pipe(
      Layer.provideMerge(Tokens.layerWith(CONFIG)),
    )
    const result = yield* Effect.result(resolveIn(clientId).pipe(Effect.provide(layer)))
    return { result, calls: yield* Ref.get(calls) }
  })

const rejected = (clientId: string, response: () => Response = () => jsonResponse(document())) =>
  Effect.gen(function* () {
    const { result } = yield* resolveWith(response, clientId)
    expect(result._tag).toBe("Failure")
  })

describe("client_id shape (design §7 bypass list)", () => {
  // Rejected outright: not canonical, userinfo, bad port, or not https.
  it.effect.each([
    "https://claude.ai/../x",
    "https://claude.ai/%2e%2e/x",
    "https://claude.ai@evil.com/c.json",
    "https://claude.ai:abc/c.json",
    "http://claude.ai/c.json",
  ])("rejects %s as invalid_client", (clientId) => rejected(clientId))

  it("only canonical https URLs with a path are documents", () => {
    expect(isMetadataDocumentUrl(DOC_URL)).toBe(true)
    expect(isMetadataDocumentUrl("https://claude.ai/../x")).toBe(false)
    expect(isMetadataDocumentUrl("https://claude.ai@evil.com/c.json")).toBe(false)
    expect(isMetadataDocumentUrl("https://claude.ai")).toBe(false)
    expect(isMetadataDocumentUrl("http://claude.ai/c.json")).toBe(false)
  })

  // Look-alike hosts resolve (their own document) but are never trusted as claude.ai.
  it.effect.each(["https://claude.ai.evil.com/c.json", "https://evil.com/claude.ai"])(
    "%s resolves under its own domain and stays Unknown",
    (clientId) =>
      Effect.gen(function* () {
        const { result } = yield* resolveWith(
          () =>
            jsonResponse(
              document({ client_id: clientId, redirect_uris: ["https://claude.ai/cb"] }),
            ),
          clientId,
        )
        expect(result._tag).toBe("Success")
        if (result._tag === "Success") {
          expect(Option.getOrNull(result.success.clientDomain)).not.toBe("claude.ai")
          const trust = clientTrust({
            clientId,
            clientDomain: result.success.clientDomain,
            redirectHost: "claude.ai",
            redirectIsLoopback: false,
          })
          expect(trust._tag).toBe("Unknown")
        }
      }),
  )
})

describe("redirect_uri shape", () => {
  it.each([
    ["https://claude.ai/api/mcp/auth_callback", true],
    ["http://localhost:3000/callback", true],
    ["http://127.0.0.1/callback", true],
    ["http://[::1]:8080/cb", true],
    ["https://claude.ai/cb#frag", false],
    ["https://user:pw@claude.ai/cb", false],
    ["http://evil.com/cb", false],
    ["https://CLAUDE.ai/cb", false],
    ["https://claude.ai/a/../cb", false],
    ["https://claude.ai:443/cb", false],
    ["not a url", false],
  ])("%s → %s", (uri, ok) => {
    expect(isAcceptableRedirectUri(uri)).toBe(ok)
  })
})

describe("CIMD resolution", () => {
  it.effect("a valid document resolves with clientDomain = its hostname", () =>
    Effect.gen(function* () {
      const { result, calls } = yield* resolveWith(() => jsonResponse(document()), DOC_URL)
      expect(calls).toBe(1)
      expect(result._tag).toBe("Success")
      if (result._tag === "Success") {
        expect(result.success).toMatchObject({ clientId: DOC_URL, clientName: "Claude Code" })
        expect(Option.getOrNull(result.success.clientDomain)).toBe("claude.ai")
      }
    }),
  )

  it.effect("document client_id mismatch → invalid_client", () =>
    rejected(DOC_URL, () => jsonResponse(document({ client_id: `${DOC_URL}x` }))),
  )
  it.effect("non-JSON content-type → invalid_client", () =>
    rejected(DOC_URL, () => jsonResponse(document(), { headers: { "content-type": "text/html" } })),
  )
  it.effect("malformed JSON → invalid_client", () =>
    rejected(DOC_URL, () => jsonResponse("{not json")),
  )
  it.effect("body over 5 KiB → invalid_client", () =>
    rejected(DOC_URL, () => jsonResponse(document({ pad: "x".repeat(CIMD_MAX_BYTES) }))),
  )
  it.effect("3xx is not followed → invalid_client", () =>
    rejected(
      DOC_URL,
      () => new Response(null, { status: 302, headers: { location: "https://evil.com/c.json" } }),
    ),
  )
  it.effect("unsafe redirect_uri in the document → invalid_client", () =>
    rejected(DOC_URL, () => jsonResponse(document({ redirect_uris: ["http://evil.com/cb"] }))),
  )
  it.effect("a client_secret in the document → invalid_client", () =>
    rejected(DOC_URL, () => jsonResponse(document({ client_secret: "s" }))),
  )
  it.effect("a fetch that throws → invalid_client", () =>
    Effect.gen(function* () {
      const layer = ClientResolver.layerWith({
        fetch: () => Promise.reject(new Error("boom")),
        cache: Effect.succeed(Option.none()),
      }).pipe(Layer.provideMerge(Tokens.layerWith(CONFIG)))
      const error = yield* Effect.flip(resolveIn(DOC_URL).pipe(Effect.provide(layer)))
      expect(error._tag).toBe("InvalidClient")
    }),
  )
  it.effect("an unknown opaque client_id → invalid_client", () => rejected("some-client"))
})

describe("CIMD fetch limits (§7: 5 s over the whole read, 5 KiB streamed)", () => {
  const encoder = new TextEncoder()
  /** A body stream that enqueues `chunks` and, unless `close`, never ends; records cancel(). */
  const streamOf = (chunks: ReadonlyArray<string>, close: boolean, cancelled: Ref.Ref<boolean>) =>
    new ReadableStream<Uint8Array>({
      start: (controller) => {
        Arr.forEach(chunks, (chunk) => controller.enqueue(encoder.encode(chunk)))
        if (close) controller.close()
      },
      cancel: () => Effect.runSync(Ref.set(cancelled, true)),
    })
  const layerFor = (fetch: ClientRuntime["fetch"], cache: Option.Option<Cache> = Option.none()) =>
    ClientResolver.layerWith({ fetch, cache: Effect.succeed(cache) }).pipe(
      Layer.provideMerge(Tokens.layerWith(CONFIG)),
    )
  const streamed = (stream: ReadableStream<Uint8Array>) =>
    new Response(stream, { status: 200, headers: { "content-type": "application/json" } })
  /** Forks the resolve, moves the TestClock past the timeout, returns the failure. */
  const afterTimeout = (fetch: ClientRuntime["fetch"]) =>
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(
        Effect.flip(resolveIn(DOC_URL).pipe(Effect.provide(layerFor(fetch)))),
      )
      yield* Effect.yieldNow
      yield* TestClock.adjust("5 seconds")
      return yield* Fiber.join(fiber)
    })

  it.effect(
    "a chunked body with no content-length over 5 KiB → invalid_client, reader cancelled",
    () =>
      Effect.gen(function* () {
        const cancelled = yield* Ref.make(false)
        const chunk = "x".repeat(1024)
        const response = streamed(streamOf(Arr.replicate(chunk, 8), false, cancelled))
        expect(response.headers.get("content-length")).toBeNull()
        const error = yield* Effect.flip(
          resolveIn(DOC_URL).pipe(Effect.provide(layerFor(() => Promise.resolve(response)))),
        )
        expect(error).toMatchObject({
          _tag: "InvalidClient",
          reason: "metadata document too large",
        })
        expect(yield* Ref.get(cancelled)).toBe(true)
      }),
  )

  it.effect("a streamed body under 5 KiB with no content-length resolves", () =>
    Effect.gen(function* () {
      const cancelled = yield* Ref.make(false)
      const body = document()
      const response = streamed(streamOf([body.slice(0, 20), body.slice(20)], true, cancelled))
      const client = yield* resolveIn(DOC_URL).pipe(
        Effect.provide(layerFor(() => Promise.resolve(response))),
      )
      expect(client.clientName).toBe("Claude Code")
    }),
  )

  it.effect("a body stream that never finishes → invalid_client after 5 s", () =>
    Effect.gen(function* () {
      const cancelled = yield* Ref.make(false)
      const error = yield* afterTimeout(() =>
        Promise.resolve(streamed(streamOf(['{"client_id":'], false, cancelled))),
      )
      expect(error).toMatchObject({
        _tag: "InvalidClient",
        reason: "metadata document fetch timed out",
      })
      expect(yield* Ref.get(cancelled)).toBe(true)
    }),
  )

  it.effect("a fetch that never resolves → invalid_client after 5 s, request aborted", () =>
    Effect.gen(function* () {
      const aborted = yield* Ref.make(false)
      const error = yield* afterTimeout(
        (_url, init) =>
          new Promise<Response>(() => {
            init.signal?.addEventListener("abort", () => Effect.runSync(Ref.set(aborted, true)))
          }),
      )
      expect(error).toMatchObject({
        _tag: "InvalidClient",
        reason: "metadata document fetch timed out",
      })
      expect(yield* Ref.get(aborted)).toBe(true)
    }),
  )

  it.effect("a document served with max-age=86400 is cached with max-age=3600", () =>
    Effect.gen(function* () {
      const stored = yield* Ref.make<ReadonlyArray<string>>([])
      const cache: Cache = {
        match: () => Promise.resolve(undefined),
        delete: () => Promise.resolve(false),
        add: () => Promise.resolve(),
        addAll: () => Promise.resolve(),
        keys: () => Promise.resolve([]),
        matchAll: () => Promise.resolve([]),
        put: (_request, response) => {
          const header = response.headers.get("cache-control") ?? ""
          Effect.runSync(Ref.update(stored, (all) => [...all, header]))
          return Promise.resolve()
        },
      }
      const response = jsonResponse(document(), {
        headers: { "content-type": "application/json", "cache-control": "max-age=86400" },
      })
      yield* resolveIn(DOC_URL).pipe(
        Effect.provide(layerFor(() => Promise.resolve(response), Option.some(cache))),
      )
      expect(yield* Ref.get(stored)).toEqual(["max-age=3600"])
    }),
  )
})

describe("stateless DCR", () => {
  const post = (body: unknown) =>
    new Request("http://localhost:8787/oauth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  const run = <A, E>(effect: Effect.Effect<A, E, Tokens | ClientResolver>) =>
    effect.pipe(
      Effect.provide(
        ClientResolver.layerWith({
          fetch: () => Promise.reject(new Error("no fetch")),
          cache: Effect.succeed(Option.none()),
        }).pipe(Layer.provideMerge(Tokens.layerWith(CONFIG))),
      ),
    )

  it.effect("register → resolve round trip", () =>
    run(
      Effect.gen(function* () {
        const response = yield* register(
          post({ redirect_uris: ["http://localhost:4000/cb"], client_name: "My CLI" }),
        )
        expect(response.status).toBe(201)
        expect(response.headers.get("cache-control")).toBe("no-store")
        const body = (yield* Effect.promise(() => response.json())) as {
          // test-only narrowing of our own JSON body
          readonly client_id: string
        }
        expect(body).toMatchObject({
          token_endpoint_auth_method: "none",
          redirect_uris: ["http://localhost:4000/cb"],
          client_name: "My CLI",
        })
        const client = yield* (yield* ClientResolver).resolve(body.client_id)
        expect(client.redirectUris).toEqual(["http://localhost:4000/cb"])
        expect(Option.isNone(client.clientDomain)).toBe(true)
      }),
    ),
  )

  it.effect.each([
    [{ redirect_uris: ["http://evil.com/cb"] }, "invalid_redirect_uri"],
    [{ redirect_uris: ["https://a.example/cb#x"] }, "invalid_redirect_uri"],
    [{ redirect_uris: ["https://u@a.example/cb"] }, "invalid_redirect_uri"],
    [{ redirect_uris: ["https://a.example/./cb"] }, "invalid_redirect_uri"],
    [{ redirect_uris: [] }, "invalid_client_metadata"],
    [
      {
        redirect_uris: Arr.makeBy(MAX_REDIRECT_URIS + 1, (i) => `https://a.example/cb${i}`),
      },
      "invalid_client_metadata",
    ],
    [
      { redirect_uris: [`https://a.example/${"p".repeat(MAX_REDIRECT_URI_LENGTH)}`] },
      "invalid_client_metadata",
    ],
    [
      { redirect_uris: ["https://a.example/cb"], client_name: "x".repeat(65) },
      "invalid_client_metadata",
    ],
    [
      {
        redirect_uris: ["https://a.example/cb"],
        token_endpoint_auth_method: "client_secret_basic",
      },
      "invalid_client_metadata",
    ],
  ])("rejects %j with %s", ([body, error]) =>
    run(
      Effect.gen(function* () {
        const response = yield* register(post(body))
        expect(response.status).toBe(400)
        expect(yield* Effect.promise(() => response.json())).toMatchObject({ error })
      }),
    ),
  )
})
