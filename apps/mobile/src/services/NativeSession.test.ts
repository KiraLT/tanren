import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Ref } from "effect"
import { FetchHttpClient, HttpClientRequest } from "effect/http"
import { TestClock } from "effect/testing"
import {
  base64Url,
  callbackFailure,
  NativeSession,
  nativeSignInFailureMessage,
  PENDING_KEY,
  SESSION_KEY,
  withSession,
} from "./NativeSession"

// RFC 7636 appendix B: these 32 bytes encode to the verifier, whose S256 challenge is below.
const RFC_BYTES = Uint8Array.from([
  116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105,
  214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121,
])
const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
const RETURN_TO = "exp://192.168.1.5:8081/--/auth/callback"
const CODE = `${"a".repeat(32)}.${"B".repeat(43)}`
const USER = "00000000-0000-4000-8000-0000000000aa"
const TOKEN = "tok-123"
const FAR_FUTURE = "2099-01-01T00:00:00.000Z"

type Store = Ref.Ref<Readonly<Record<string, string>>>

const sessionJson = (expiresAt: string) => JSON.stringify({ token: TOKEN, userId: USER, expiresAt })
const pendingJson = JSON.stringify({
  verifier: RFC_VERIFIER,
  createdAt: "1970-01-01T00:00:00.000Z",
})

const failIfCalled: typeof globalThis.fetch = () => Promise.reject(new Error("no request expected"))

const respond =
  (status: number, body: unknown): typeof globalThis.fetch =>
  () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    )

/** Runs `effect` with the memory session over `entries` and a stand-in `fetch`. */
const withMemory = <A, E>(
  entries: Readonly<Record<string, string>>,
  effect: (store: Store) => Effect.Effect<A, E, NativeSession>,
  fetch: typeof globalThis.fetch = failIfCalled,
) =>
  Effect.gen(function* () {
    const store: Store = yield* Ref.make(entries)
    return yield* effect(store).pipe(
      Effect.provide(NativeSession.layerMemory(store, { randomBytes: () => RFC_BYTES })),
      Effect.provideService(FetchHttpClient.Fetch, fetch),
    )
  })

const failureReason = <A, R>(effect: Effect.Effect<A, { readonly reason: string }, R>) =>
  Effect.flip(effect).pipe(Effect.map((error) => error.reason))

describe("base64Url", () => {
  it("encodes the RFC 7636 verifier bytes without padding", () => {
    expect(base64Url(RFC_BYTES)).toBe(RFC_VERIFIER)
    expect(base64Url(Uint8Array.from([251, 255]))).toBe("-_8")
    expect(base64Url(new Uint8Array(0))).toBe("")
  })
})

describe("NativeSession.begin", () => {
  it.effect("stores the pending verifier and returns the worker callbackURL", () =>
    withMemory({}, (store) =>
      Effect.gen(function* () {
        const callbackUrl = yield* NativeSession.use((session) => session.begin)
        const url = new URL(callbackUrl, "http://api.test")
        expect(url.pathname).toBe("/auth/native/complete")
        expect(url.searchParams.get("challenge")).toBe(RFC_CHALLENGE)
        expect(url.searchParams.get("returnTo")).toBe(RETURN_TO)
        const pending = JSON.parse((yield* Ref.get(store))[PENDING_KEY] ?? "{}")
        expect(pending.verifier).toBe(RFC_VERIFIER)
      }),
    ),
  )
})

describe("NativeSession.complete", () => {
  it.effect("fails with no-pending when begin never ran", () =>
    withMemory({}, () =>
      Effect.gen(function* () {
        const reason = yield* failureReason(NativeSession.use((s) => s.complete(CODE)))
        expect(reason).toBe("no-pending")
      }),
    ),
  )

  it.effect("ignores a pending sign-in older than 15 minutes", () =>
    withMemory({ [PENDING_KEY]: pendingJson }, () =>
      Effect.gen(function* () {
        yield* TestClock.adjust("16 minutes")
        const reason = yield* failureReason(NativeSession.use((s) => s.complete(CODE)))
        expect(reason).toBe("no-pending")
      }),
    ),
  )

  it.effect("exchanges the code, stores the session, deletes pending and returns the user", () => {
    const seen: Array<{ readonly url: string; readonly method: string; readonly body: string }> = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      // biome-ignore lint/plugin/noMutation: test spy collecting what the fake server saw
      seen.push({ url: request.url, method: request.method, body: await request.text() })
      return new Response(JSON.stringify({ token: TOKEN, userId: USER, expiresAt: FAR_FUTURE }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    return withMemory(
      { [PENDING_KEY]: pendingJson },
      (store) =>
        Effect.gen(function* () {
          const userId = yield* NativeSession.use((s) => s.complete(CODE))
          expect(userId).toBe(USER)
          expect(seen).toEqual([
            {
              url: "http://api.test/api/native/session",
              method: "POST",
              body: JSON.stringify({ code: CODE, verifier: RFC_VERIFIER }),
            },
          ])
          const stored = yield* Ref.get(store)
          expect(Object.keys(stored)).toEqual([SESSION_KEY])
          expect(JSON.parse(stored[SESSION_KEY] ?? "{}")).toEqual({
            token: TOKEN,
            userId: USER,
            expiresAt: FAR_FUTURE,
          })
          expect(yield* NativeSession.use((s) => s.token)).toEqual(Option.some(TOKEN))
        }),
      fetch,
    )
  })

  it.effect("maps a 400 to rejected and keeps the pending verifier", () =>
    withMemory(
      { [PENDING_KEY]: pendingJson },
      (store) =>
        Effect.gen(function* () {
          const reason = yield* failureReason(NativeSession.use((s) => s.complete(CODE)))
          expect(reason).toBe("rejected")
          expect(Object.keys(yield* Ref.get(store))).toEqual([PENDING_KEY])
        }),
      respond(400, { _tag: "NativeCodeRejected", reason: "invalid" }),
    ),
  )

  it.effect("maps a network failure and a 503 to unreachable", () =>
    Effect.gen(function* () {
      const offline = yield* withMemory(
        { [PENDING_KEY]: pendingJson },
        () => failureReason(NativeSession.use((s) => s.complete(CODE))),
        () => Promise.reject(new TypeError("offline")),
      )
      const down = yield* withMemory(
        { [PENDING_KEY]: pendingJson },
        () => failureReason(NativeSession.use((s) => s.complete(CODE))),
        respond(503, {}),
      )
      expect([offline, down]).toEqual(["unreachable", "unreachable"])
    }),
  )

  it.effect("rejects a malformed code without sending a request", () =>
    withMemory({ [PENDING_KEY]: pendingJson }, () =>
      Effect.gen(function* () {
        const reason = yield* failureReason(NativeSession.use((s) => s.complete("not-a-code")))
        expect(reason).toBe("rejected")
      }),
    ),
  )
})

describe("NativeSession.token and clear", () => {
  it.effect("is None without a stored session and after expiresAt", () =>
    Effect.gen(function* () {
      const empty = yield* withMemory({}, () => NativeSession.use((s) => s.token))
      const expired = yield* withMemory(
        { [SESSION_KEY]: sessionJson("1969-12-31T00:00:00.000Z") },
        () => NativeSession.use((s) => s.token),
      )
      const garbage = yield* withMemory({ [SESSION_KEY]: "{" }, () =>
        NativeSession.use((s) => s.token),
      )
      expect([empty, expired, garbage]).toEqual([Option.none(), Option.none(), Option.none()])
    }),
  )

  it.effect("is the stored token before expiresAt", () =>
    withMemory({ [SESSION_KEY]: sessionJson(FAR_FUTURE) }, () =>
      Effect.gen(function* () {
        expect(yield* NativeSession.use((s) => s.token)).toEqual(Option.some(TOKEN))
      }),
    ),
  )

  it.effect("clear deletes the session and the pending sign-in", () =>
    withMemory({ [SESSION_KEY]: sessionJson(FAR_FUTURE), [PENDING_KEY]: pendingJson }, (store) =>
      Effect.gen(function* () {
        yield* NativeSession.use((s) => s.clear)
        expect(yield* Ref.get(store)).toEqual({})
      }),
    ),
  )

  it.effect("layerNone has no token and cannot sign in", () =>
    Effect.gen(function* () {
      const session = yield* NativeSession
      expect(yield* session.token).toEqual(Option.none())
      expect(yield* failureReason(session.begin)).toBe("no-pending")
      yield* session.clear
    }).pipe(Effect.provide(NativeSession.layerNone)),
  )
})

describe("withSession", () => {
  const request = HttpClientRequest.get("http://api.test/sync/pull")

  it.effect("adds the Bearer header only when a token is stored", () =>
    Effect.gen(function* () {
      const signedIn = yield* withMemory({ [SESSION_KEY]: sessionJson(FAR_FUTURE) }, () =>
        withSession(request),
      )
      const signedOut = yield* withMemory({}, () => withSession(request))
      expect(signedIn.headers.authorization).toBe(`Bearer ${TOKEN}`)
      expect(signedOut.headers.authorization).toBeUndefined()
    }),
  )
})

describe("callbackFailure and copy", () => {
  it("reads error= as link-invalid and a missing code as rejected", () => {
    expect(callbackFailure({ error: "link_invalid" })).toEqual(Option.some("link-invalid"))
    expect(callbackFailure({ code: CODE, error: "link_invalid" })).toEqual(
      Option.some("link-invalid"),
    )
    expect(callbackFailure({})).toEqual(Option.some("rejected"))
    expect(callbackFailure({ code: "" })).toEqual(Option.some("rejected"))
    expect(callbackFailure({ code: CODE })).toEqual(Option.none())
  })

  it("explains each failure", () => {
    expect(nativeSignInFailureMessage("link-invalid")).toBe("That link expired. Request a new one.")
    expect(
      (["no-pending", "rejected", "unreachable", "storage"] as const).every(
        (reason) => nativeSignInFailureMessage(reason).length > 0,
      ),
    ).toBe(true)
  })
})
