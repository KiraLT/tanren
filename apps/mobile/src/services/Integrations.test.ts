import { describe, expect, it } from "@effect/vitest"
import { ActivityExportId } from "@tanren/shared"
import { DateTime, Effect, Layer, Option, Predicate, Ref, Result } from "effect"
import { FetchHttpClient } from "effect/http"
import {
  Integrations,
  type IntegrationsRequestFailed,
  type IntegrationsShape,
  returnToFor,
} from "./Integrations"
import { NativeSession } from "./NativeSession"

interface Call {
  readonly method: string
  readonly url: string
  readonly body: string
  readonly authorization: Option.Option<string>
}

type Respond = (call: Call) => Promise<Response>

const json = (body: unknown, status = 200): Promise<Response> =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  )

const unreachable: Respond = () => Promise.reject(new TypeError("Failed to fetch"))

const SESSION_ENTRY = {
  "tanren.access": "tok-123",
  "tanren.refresh": "ref-123",
  "tanren.expiresAt": "2099-01-01T00:00:00.000Z",
}

/** Runs `use` against `Integrations` and a stand-in worker; returns the outcome and the calls. */
const scenario = <A, E>(
  use: (integrations: IntegrationsShape) => Effect.Effect<A, E>,
  respond: Respond,
  entries: Readonly<Record<string, string>> = {},
) =>
  Effect.gen(function* () {
    const kv = yield* Ref.make(entries)
    const calls = yield* Ref.make<ReadonlyArray<Call>>([])
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      const call: Call = {
        method: request.method,
        url: request.url,
        body: await request.text(),
        authorization: Option.fromNullishOr(request.headers.get("authorization")),
      }
      Effect.runSync(Ref.update(calls, (all) => [...all, call]))
      return respond(call)
    }
    const layer = Integrations.layerWith(Effect.succeed("http://api.test")).pipe(
      Layer.provide(Layer.mergeAll(NativeSession.layerMemory(kv), FetchHttpClient.layer)),
    )
    const result = yield* Integrations.use(use).pipe(
      Effect.result,
      Effect.provide(layer),
      Effect.provideService(FetchHttpClient.Fetch, fetch),
    )
    return { result, calls: yield* Ref.get(calls) }
  })

const CONNECTED = {
  providers: [
    {
      provider: "strava",
      state: "connected",
      account: { displayName: "Lukas K." },
      connectedAt: "2026-10-26T19:00:00.000Z",
      lastExportAt: "2026-10-26T19:40:12.000Z",
      pendingExports: 0,
      failedExports: 1,
      blockedExports: 0,
    },
  ],
}

const DISCONNECTED = {
  providers: [
    {
      provider: "strava",
      state: "disconnected",
      account: null,
      connectedAt: null,
      lastExportAt: null,
      pendingExports: 0,
      failedExports: 0,
      blockedExports: 0,
    },
  ],
}

const BLOCKED = {
  providers: [{ ...CONNECTED.providers[0], failedExports: 0, blockedExports: 2 }],
}

const EXPORT_ID = "00000000-0000-4000-8000-0000000000e1"

const EXPORT_ROW = {
  id: EXPORT_ID,
  provider: "strava",
  sessionId: "00000000-0000-4000-8000-0000000000c1",
  status: "sent",
  attempts: 1,
  externalActivityId: "12345678",
  lastError: null,
  createdAt: "2026-10-26T19:00:00.000Z",
  updatedAt: "2026-10-26T19:40:12.000Z",
}

const reasonOf = <A>(result: Result.Result<A, IntegrationsRequestFailed>) =>
  Result.isFailure(result) && Predicate.isTagged(result.failure, "IntegrationsRequestFailed")
    ? result.failure.reason
    : "none"

describe("Integrations.status", () => {
  it.effect("decodes the connected wire example and sends the Bearer token", () =>
    Effect.gen(function* () {
      const { result, calls } = yield* scenario(
        (service) => service.status,
        () => json(CONNECTED),
        SESSION_ENTRY,
      )
      const status = Result.getOrThrow(result)
      const strava = status.providers[0]
      expect(strava?.state).toBe("connected")
      expect(strava?.account).toEqual(Option.some({ displayName: "Lukas K." }))
      expect(Option.map(strava?.lastExportAt ?? Option.none(), DateTime.formatIso)).toEqual(
        Option.some("2026-10-26T19:40:12.000Z"),
      )
      expect(strava?.failedExports).toBe(1)
      expect(calls.map(({ method, url }) => `${method} ${url}`)).toEqual([
        "GET http://api.test/integrations",
      ])
      expect(calls[0]?.authorization).toEqual(Option.some("Bearer tok-123"))
    }),
  )

  it.effect("decodes the disconnected wire example", () =>
    Effect.gen(function* () {
      const { result } = yield* scenario(
        (service) => service.status,
        () => json(DISCONNECTED),
      )
      const strava = Result.getOrThrow(result).providers[0]
      expect(strava?.state).toBe("disconnected")
      expect(strava?.account).toEqual(Option.none())
      expect(strava?.connectedAt).toEqual(Option.none())
    }),
  )

  it.effect("decodes blocked exports", () =>
    Effect.gen(function* () {
      const { result } = yield* scenario(
        (service) => service.status,
        () => json(BLOCKED),
      )
      expect(Result.getOrThrow(result).providers[0]?.blockedExports).toBe(2)
    }),
  )

  it.effect("maps a 500 to server", () =>
    Effect.gen(function* () {
      const { result } = yield* scenario(
        (service) => service.status,
        () => json({ _tag: "Internal" }, 500),
      )
      expect(reasonOf(result)).toBe("server")
    }),
  )

  it.effect("maps a transport error to offline", () =>
    Effect.gen(function* () {
      const { result } = yield* scenario((service) => service.status, unreachable)
      expect(reasonOf(result)).toBe("offline")
    }),
  )

  it.effect("maps a 409 to not-connected", () =>
    Effect.gen(function* () {
      const { result } = yield* scenario(
        (service) => service.status,
        () => json({ _tag: "IntegrationNotConnected", provider: "strava" }, 409),
      )
      expect(reasonOf(result)).toBe("not-connected")
    }),
  )

  it.effect("maps an undecodable body to server", () =>
    Effect.gen(function* () {
      const { result } = yield* scenario(
        (service) => service.status,
        () => json({ providers: [{ provider: "garmin" }] }),
      )
      expect(reasonOf(result)).toBe("server")
    }),
  )
})

describe("Integrations.connect", () => {
  it.effect("posts returnTo and returns the authorize url", () =>
    Effect.gen(function* () {
      const { result, calls } = yield* scenario(
        (service) => service.connect("http://localhost:8790/settings/integrations"),
        () => json({ url: "https://www.strava.com/oauth/authorize?client_id=1" }),
      )
      expect(Result.getOrThrow(result)).toBe("https://www.strava.com/oauth/authorize?client_id=1")
      expect(calls.map(({ method, url }) => `${method} ${url}`)).toEqual([
        "POST http://api.test/integrations/strava/connect",
      ])
      expect(JSON.parse(calls[0]?.body ?? "")).toEqual({
        returnTo: "http://localhost:8790/settings/integrations",
      })
    }),
  )

  it.effect("maps a 400 ConnectRejected not-configured to not-configured", () =>
    Effect.gen(function* () {
      const { result } = yield* scenario(
        (service) => service.connect("http://localhost:8790/settings/integrations"),
        () => json({ _tag: "ConnectRejected", reason: "not-configured" }, 400),
      )
      expect(reasonOf(result)).toBe("not-configured")
    }),
  )

  it.effect("maps an undecodable 400 to server", () =>
    Effect.gen(function* () {
      const { result } = yield* scenario(
        (service) => service.connect("http://localhost:8790/settings/integrations"),
        () => json({ message: "bad request" }, 400),
      )
      expect(reasonOf(result)).toBe("server")
    }),
  )

  it.effect("maps a 400 ConnectRejected return-to to server", () =>
    Effect.gen(function* () {
      const { result } = yield* scenario(
        (service) => service.connect("https://evil.test/settings/integrations"),
        () => json({ _tag: "ConnectRejected", reason: "return-to" }, 400),
      )
      expect(reasonOf(result)).toBe("server")
    }),
  )
})

describe("Integrations.disconnect", () => {
  it.effect("sends DELETE and succeeds on 204", () =>
    Effect.gen(function* () {
      const { result, calls } = yield* scenario(
        (service) => service.disconnect,
        () => Promise.resolve(new Response(null, { status: 204 })),
      )
      expect(Result.isSuccess(result)).toBe(true)
      expect(calls.map(({ method, url }) => `${method} ${url}`)).toEqual([
        "DELETE http://api.test/integrations/strava",
      ])
    }),
  )

  it.effect("maps a 409 to not-connected", () =>
    Effect.gen(function* () {
      const { result } = yield* scenario(
        (service) => service.disconnect,
        () => json({ _tag: "IntegrationNotConnected", provider: "strava" }, 409),
      )
      expect(reasonOf(result)).toBe("not-connected")
    }),
  )
})

describe("Integrations.exports", () => {
  it.effect("asks for the limit and decodes the rows", () =>
    Effect.gen(function* () {
      const { result, calls } = yield* scenario(
        (service) => service.exports(20),
        () => json([EXPORT_ROW, { ...EXPORT_ROW, status: "blocked", externalActivityId: null }]),
      )
      const rows = Result.getOrThrow(result)
      expect(rows.map((row) => row.status)).toEqual(["sent", "blocked"])
      expect(rows[0]?.externalActivityId).toEqual(Option.some("12345678"))
      expect(calls[0]?.url).toBe("http://api.test/integrations/strava/exports?limit=20")
    }),
  )

  it.effect("maps an unknown status to server", () =>
    Effect.gen(function* () {
      const { result } = yield* scenario(
        (service) => service.exports(20),
        () => json([{ ...EXPORT_ROW, status: "lost" }]),
      )
      expect(reasonOf(result)).toBe("server")
    }),
  )
})

describe("Integrations.retry", () => {
  const id = ActivityExportId.make(EXPORT_ID)

  it.effect("posts the id and decodes the row after the attempt", () =>
    Effect.gen(function* () {
      const { result, calls } = yield* scenario(
        (service) => service.retry(id),
        () => json({ ...EXPORT_ROW, status: "pending", externalActivityId: null }),
      )
      expect(Result.getOrThrow(result).status).toBe("pending")
      expect(calls[0]?.url).toBe("http://api.test/integrations/strava/exports/retry")
      expect(JSON.parse(calls[0]?.body ?? "")).toEqual({ id: EXPORT_ID })
    }),
  )

  it.effect("maps a 404 NotFound to server", () =>
    Effect.gen(function* () {
      const { result } = yield* scenario(
        (service) => service.retry(id),
        () => json({ _tag: "NotFound", entity: "activityExport", id: EXPORT_ID }, 404),
      )
      expect(reasonOf(result)).toBe("server")
    }),
  )

  it.effect("maps a transport error to offline", () =>
    Effect.gen(function* () {
      const { result } = yield* scenario((service) => service.retry(id), unreachable)
      expect(reasonOf(result)).toBe("offline")
    }),
  )
})

describe("returnToFor", () => {
  it("builds the web return URL from the origin", () => {
    expect(returnToFor({ _tag: "web", origin: "http://localhost:8790" })).toBe(
      "http://localhost:8790/settings/integrations",
    )
  })

  it("asks expo-linking for the native deep link without a leading slash", () => {
    expect(
      returnToFor({ _tag: "native", createURL: (path) => `exp://192.168.1.5:8081/--/${path}` }),
    ).toBe("exp://192.168.1.5:8081/--/settings/integrations")
  })
})
