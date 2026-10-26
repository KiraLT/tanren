import { describe, expect, it } from "@effect/vitest"
import { SessionId } from "@tanren/shared"
import { DateTime, Effect, Fiber, Layer, Logger, Option, Redacted, Ref } from "effect"
import {
  Headers,
  HttpClient,
  HttpClientError,
  type HttpClientRequest,
  HttpClientResponse,
} from "effect/http"
import { TestClock } from "effect/testing"
import { WorkerConfig } from "../Config"
import type { EnvVars } from "../Env"
import { envVars as localEnv } from "../testing/fixtures"
import {
  type NewActivity,
  STRAVA_ACTIVITIES_URL,
  STRAVA_REQUEST_TIMEOUT,
  STRAVA_REVOKE_URL,
  STRAVA_TOKEN_URL,
  StravaApi,
  StravaRequestFailed,
} from "./StravaApi"

const CLIENT_SECRET = "test-only-strava-client-secret"
const ACCESS = Redacted.make("SECRET-ACCESS-TOKEN-1")
const REFRESH = Redacted.make("SECRET-REFRESH-TOKEN-1")
const CODE = "SECRET-AUTH-CODE-1"
const SECRETS = [CLIENT_SECRET, "SECRET-ACCESS-TOKEN", "SECRET-REFRESH-TOKEN", CODE, "AQEBAQEB"]

const providerEnv: EnvVars = {
  ...localEnv,
  ENVIRONMENT: "production",
  BETTER_AUTH_URL: "https://api.tanren.me",
  ALLOWED_ORIGINS: "https://tanren.me",
  EMAIL_MODE: "provider",
  EMAIL_FROM: "Tanren <login@tanren.me>",
  RESEND_API_KEY: "re_test_only_not_a_key",
  MCP_RESOURCE_URL: "https://mcp.tanren.me/mcp",
  STRAVA_MODE: "provider",
  STRAVA_CLIENT_ID: "12345",
  STRAVA_CLIENT_SECRET: CLIENT_SECRET,
  INTEGRATION_TOKEN_KEY: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
}

const activity: NewActivity = {
  sessionId: SessionId.make("12345678-1234-4234-8234-123456789abc"),
  name: "Push day",
  sportType: "WeightTraining",
  trainer: true,
  startDateLocal: "2026-10-26T18:30:00",
  elapsedTime: 2880,
  description: "Bench Press — 4 × 8 @ 60 kg\n\nLogged with Tanren",
}

const TOKEN_BODY = {
  token_type: "Bearer",
  access_token: "NEW-ACCESS",
  refresh_token: "NEW-REFRESH",
  expires_at: 1_792_000_000,
  expires_in: 21_600,
  athlete: { id: 4242, firstname: "Lukas", lastname: "K." },
}

type Reply =
  | { readonly _tag: "Status"; readonly status: number; readonly body: string }
  | { readonly _tag: "Transport" }
  | { readonly _tag: "Hang" }
  | { readonly _tag: "HangBody" }

const ok = (body: unknown): Reply => ({ _tag: "Status", status: 200, body: JSON.stringify(body) })
const status = (code: number): Reply => ({ _tag: "Status", status: code, body: "" })

const formOf = (request: HttpClientRequest.HttpClientRequest): URLSearchParams =>
  new URLSearchParams(
    request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : "",
  )

const headerOf = (request: HttpClientRequest.HttpClientRequest, name: string) =>
  Option.getOrElse(Headers.get(request.headers, name), () => "")

/** A `StravaApi.layerHttp` over a fake `HttpClient` that records requests and answers `reply`. */
const stubbed = (reply: Reply) =>
  Effect.gen(function* () {
    const seen = yield* Ref.make<ReadonlyArray<HttpClientRequest.HttpClientRequest>>([])
    const client = HttpClient.make((request) =>
      Ref.update(seen, (all) => [...all, request]).pipe(
        Effect.andThen(
          reply._tag === "Hang"
            ? Effect.never
            : reply._tag === "HangBody"
              ? // 200 headers at once, then a body stream that never ends.
                Effect.succeed(
                  HttpClientResponse.fromWeb(
                    request,
                    new Response(new ReadableStream({ start: () => undefined }), { status: 200 }),
                  ),
                )
              : reply._tag === "Transport"
                ? Effect.fail(
                    new HttpClientError.HttpClientError({
                      reason: new HttpClientError.TransportError({
                        request,
                        description: "connection reset",
                      }),
                    }),
                  )
                : Effect.succeed(
                    HttpClientResponse.fromWeb(
                      request,
                      new Response(reply.body, { status: reply.status }),
                    ),
                  ),
        ),
      ),
    )
    const layer = StravaApi.layerHttp.pipe(
      Layer.provide(
        Layer.merge(
          Layer.orDie(WorkerConfig.layerFromEnv(providerEnv)),
          Layer.succeed(HttpClient.HttpClient, client),
        ),
      ),
    )
    const run = <A, E>(f: (api: StravaApi["Service"]) => Effect.Effect<A, E>) =>
      Effect.gen(function* () {
        return yield* f(yield* StravaApi)
      }).pipe(Effect.provide(layer))
    return { run, requests: Ref.get(seen) }
  })

/** A logger that records every line, so tests can prove no secret reaches the log. */
const capturedLogs = () => {
  const lines = Ref.makeUnsafe<ReadonlyArray<string>>([])
  const logger = Logger.make((options) => {
    Effect.runSync(
      Ref.update(lines, (all) => [...all, JSON.stringify([options.message, options.cause])]),
    )
  })
  return { lines: Ref.get(lines), layer: Logger.layer([logger]) }
}

describe("StravaApi.layerHttp", () => {
  it.effect("exchanges a code: form body, headers, decoded grant", () =>
    Effect.gen(function* () {
      const { run, requests } = yield* stubbed(ok(TOKEN_BODY))
      const grant = yield* run((api) => api.exchangeCode(CODE))
      const [request, ...rest] = yield* requests
      expect(rest).toEqual([])
      expect(request?.method).toBe("POST")
      expect(request?.url).toBe(STRAVA_TOKEN_URL)
      expect(request === undefined ? "" : headerOf(request, "user-agent")).toBe("tanren/1")
      expect(request === undefined ? "" : headerOf(request, "content-type")).toBe(
        "application/x-www-form-urlencoded",
      )
      const form = request === undefined ? new URLSearchParams() : formOf(request)
      expect(Object.fromEntries(form)).toEqual({
        client_id: "12345",
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code: CODE,
      })
      expect(Redacted.value(grant.accessToken)).toBe("NEW-ACCESS")
      expect(Redacted.value(grant.refreshToken)).toBe("NEW-REFRESH")
      expect(DateTime.toEpochMillis(grant.expiresAt)).toBe(1_792_000_000_000)
      expect(grant.scope).toBe("")
      expect(grant.athlete).toEqual({ id: "4242", displayName: "Lukas K." })
      expect(String(grant.accessToken)).not.toContain("NEW-ACCESS")
    }),
  )

  it.effect("reports the scope when the token response carries it", () =>
    Effect.gen(function* () {
      const { run } = yield* stubbed(ok({ ...TOKEN_BODY, scope: "read,activity:write" }))
      expect((yield* run((api) => api.exchangeCode(CODE))).scope).toBe("read,activity:write")
    }),
  )

  it.effect("refreshes a token: rotated pair, no athlete needed", () =>
    Effect.gen(function* () {
      const { athlete: _omitted, ...refreshBody } = TOKEN_BODY
      const { run, requests } = yield* stubbed(ok(refreshBody))
      const tokens = yield* run((api) => api.refresh(REFRESH))
      const [request] = yield* requests
      expect(request?.url).toBe(STRAVA_TOKEN_URL)
      expect(
        Object.fromEntries(request === undefined ? new URLSearchParams() : formOf(request)),
      ).toEqual({
        client_id: "12345",
        client_secret: CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: "SECRET-REFRESH-TOKEN-1",
      })
      expect(Redacted.value(tokens.accessToken)).toBe("NEW-ACCESS")
      expect(Redacted.value(tokens.refreshToken)).toBe("NEW-REFRESH")
      expect(DateTime.toEpochMillis(tokens.expiresAt)).toBe(1_792_000_000_000)
    }),
  )

  it.effect("creates an activity: bearer header, form fields, string id", () =>
    Effect.gen(function* () {
      const { run, requests } = yield* stubbed(ok({ id: 987654321012 }))
      const created = yield* run((api) => api.createActivity(ACCESS, activity))
      const [request] = yield* requests
      expect(created).toEqual({ id: "987654321012" })
      expect(request?.method).toBe("POST")
      expect(request?.url).toBe(STRAVA_ACTIVITIES_URL)
      expect(request === undefined ? "" : headerOf(request, "authorization")).toBe(
        "Bearer SECRET-ACCESS-TOKEN-1",
      )
      expect(request === undefined ? "" : headerOf(request, "user-agent")).toBe("tanren/1")
      expect(
        Object.fromEntries(request === undefined ? new URLSearchParams() : formOf(request)),
      ).toEqual({
        name: "Push day",
        sport_type: "WeightTraining",
        start_date_local: "2026-10-26T18:30:00",
        elapsed_time: "2880",
        description: "Bench Press — 4 × 8 @ 60 kg\n\nLogged with Tanren",
        trainer: "1",
      })
    }),
  )

  it.effect("revokes with basic auth and the token in the body", () =>
    Effect.gen(function* () {
      const { run, requests } = yield* stubbed(ok({}))
      yield* run((api) => api.revoke(ACCESS))
      const [request] = yield* requests
      expect(request?.method).toBe("POST")
      expect(request?.url).toBe(STRAVA_REVOKE_URL)
      expect(request === undefined ? "" : headerOf(request, "authorization")).toBe(
        `Basic ${btoa(`12345:${CLIENT_SECRET}`)}`,
      )
      expect(
        Object.fromEntries(request === undefined ? new URLSearchParams() : formOf(request)),
      ).toEqual({
        token: "SECRET-ACCESS-TOKEN-1",
      })
    }),
  )

  it.effect("maps HTTP statuses to failure reasons", () =>
    Effect.gen(function* () {
      const cases = [
        [401, "unauthorized"],
        [429, "rate_limited"],
        [400, "rejected"],
        [422, "rejected"],
        [500, "provider_error"],
        [503, "provider_error"],
      ] as const
      const errors = yield* Effect.forEach(cases, ([code]) =>
        Effect.gen(function* () {
          const { run } = yield* stubbed(status(code))
          return yield* Effect.flip(run((api) => api.createActivity(ACCESS, activity)))
        }),
      )
      expect(errors.every((error) => error instanceof StravaRequestFailed)).toBe(true)
      expect(errors.map(({ reason, status }) => [reason, status])).toEqual(
        cases.map(([code, reason]) => [reason, Option.some(code)]),
      )
    }),
  )

  it.effect("maps 403 to app_inactive and logs the refusal with Strava's body, never a token", () =>
    Effect.gen(function* () {
      const { lines, layer } = capturedLogs()
      const { run, requests } = yield* stubbed({
        _tag: "Status",
        status: 403,
        body: "Application is inactive",
      })
      const error = yield* Effect.flip(run((api) => api.createActivity(ACCESS, activity))).pipe(
        Effect.provide(layer),
      )
      expect(error).toBeInstanceOf(StravaRequestFailed)
      expect({ reason: error.reason, status: error.status }).toEqual({
        reason: "app_inactive",
        status: Option.some(403),
      })
      // The request did carry the bearer token; the log must not.
      const sent = yield* requests
      expect(sent.map((request) => headerOf(request, "authorization")).join()).toContain(
        "SECRET-ACCESS-TOKEN",
      )
      const logged = yield* lines
      expect(logged.filter((line) => line.includes("[strava] application refused"))).toHaveLength(1)
      expect(logged.join("\n")).toContain(
        "[strava] application refused status=403 body=Application is inactive",
      )
      expect(SECRETS.filter((secret) => logged.join("\n").includes(secret))).toEqual([])
    }),
  )

  it.effect("maps a 400 whose body says the application is inactive to app_inactive", () =>
    Effect.gen(function* () {
      const { run } = yield* stubbed({
        _tag: "Status",
        status: 400,
        body: '{"message":"Application is inactive"}',
      })
      const error = yield* Effect.flip(run((api) => api.createActivity(ACCESS, activity)))
      expect({ reason: error.reason, status: error.status }).toEqual({
        reason: "app_inactive",
        status: Option.some(400),
      })
    }),
  )

  it.effect("keeps a 422 with an unrelated body as rejected and logs nothing", () =>
    Effect.gen(function* () {
      const { lines, layer } = capturedLogs()
      const { run } = yield* stubbed({
        _tag: "Status",
        status: 422,
        body: '{"message":"Bad Request","errors":[{"field":"name","code":"invalid"}]}',
      })
      const error = yield* Effect.flip(run((api) => api.createActivity(ACCESS, activity))).pipe(
        Effect.provide(layer),
      )
      expect({ reason: error.reason, status: error.status }).toEqual({
        reason: "rejected",
        status: Option.some(422),
      })
      expect(yield* lines).toEqual([])
    }),
  )

  it.effect("keeps Strava's invalid-client 400 (resource Application) as rejected", () =>
    Effect.gen(function* () {
      const { run } = yield* stubbed({
        _tag: "Status",
        status: 400,
        body: '{"message":"Bad Request","errors":[{"resource":"Application","code":"invalid"}]}',
      })
      const error = yield* Effect.flip(run((api) => api.createActivity(ACCESS, activity)))
      expect({ reason: error.reason, status: error.status }).toEqual({
        reason: "rejected",
        status: Option.some(400),
      })
    }),
  )

  it.effect("ends a request that hangs past 10 s as transport", () =>
    Effect.gen(function* () {
      const { run } = yield* stubbed({ _tag: "Hang" })
      const fiber = yield* Effect.forkChild(
        Effect.flip(run((api) => api.createActivity(ACCESS, activity))),
      )
      yield* TestClock.adjust(STRAVA_REQUEST_TIMEOUT)
      const error = yield* Fiber.join(fiber)
      expect({ reason: error.reason, status: error.status }).toEqual({
        reason: "transport",
        status: Option.none(),
      })
    }),
  )

  it.effect("ends a call whose body read hangs as transport within the same 10 s", () =>
    Effect.gen(function* () {
      const { run } = yield* stubbed({ _tag: "HangBody" })
      const fiber = yield* Effect.forkChild(
        Effect.flip(run((api) => api.createActivity(ACCESS, activity))),
      )
      yield* TestClock.adjust(STRAVA_REQUEST_TIMEOUT)
      const error = yield* Fiber.join(fiber)
      expect({ reason: error.reason, status: error.status }).toEqual({
        reason: "transport",
        status: Option.none(),
      })
    }),
  )

  it.effect("keeps 401 unauthorized even when the body mentions the application", () =>
    Effect.gen(function* () {
      const { run } = yield* stubbed({
        _tag: "Status",
        status: 401,
        body: '{"message":"Authorization Error: application"}',
      })
      const error = yield* Effect.flip(run((api) => api.createActivity(ACCESS, activity)))
      expect(error.reason).toBe("unauthorized")
    }),
  )

  it.effect("truncates the logged body to 500 characters", () =>
    Effect.gen(function* () {
      const { lines, layer } = capturedLogs()
      const { run } = yield* stubbed({ _tag: "Status", status: 403, body: "x".repeat(900) })
      yield* Effect.flip(run((api) => api.createActivity(ACCESS, activity))).pipe(
        Effect.provide(layer),
      )
      const logged = (yield* lines).join("\n")
      expect(logged).toContain(`body=${"x".repeat(500)}`)
      expect(logged).not.toContain("x".repeat(501))
    }),
  )

  it.effect("fails with transport and no status when there is no response", () =>
    Effect.gen(function* () {
      const { run } = yield* stubbed({ _tag: "Transport" })
      const error = yield* Effect.flip(run((api) => api.refresh(REFRESH)))
      expect({ reason: error.reason, status: error.status }).toEqual({
        reason: "transport",
        status: Option.none(),
      })
    }),
  )

  it.effect("treats an unreadable 200 body as provider_error", () =>
    Effect.gen(function* () {
      const bodies = [
        ok({ unexpected: true }),
        { _tag: "Status", status: 200, body: "<html>maintenance</html>" } as const,
      ]
      const errors = yield* Effect.forEach(bodies, (reply) =>
        Effect.gen(function* () {
          const { run } = yield* stubbed(reply)
          return yield* Effect.flip(run((api) => api.createActivity(ACCESS, activity)))
        }),
      )
      expect(errors.map((error) => error.reason)).toEqual(["provider_error", "provider_error"])
    }),
  )

  it.effect("refuses an exchange response without an athlete", () =>
    Effect.gen(function* () {
      const { athlete: _omitted, ...noAthlete } = TOKEN_BODY
      const { run } = yield* stubbed(ok(noAthlete))
      expect((yield* Effect.flip(run((api) => api.exchangeCode(CODE)))).reason).toBe(
        "provider_error",
      )
    }),
  )

  it.effect("falls back to a generic athlete name when Strava sends none that fits", () =>
    Effect.gen(function* () {
      const { run } = yield* stubbed(ok({ ...TOKEN_BODY, athlete: { id: 7, firstname: null } }))
      expect((yield* run((api) => api.exchangeCode(CODE))).athlete).toEqual({
        id: "7",
        displayName: "Strava athlete",
      })
    }),
  )

  it.effect("logs no token, code or secret, on success or failure", () =>
    Effect.gen(function* () {
      const { lines, layer } = capturedLogs()
      const okApi = yield* stubbed(ok(TOKEN_BODY))
      const failApi = yield* stubbed(status(401))
      yield* Effect.gen(function* () {
        yield* okApi.run((api) => api.exchangeCode(CODE))
        yield* okApi.run((api) => api.refresh(REFRESH))
        const error = yield* Effect.flip(failApi.run((api) => api.createActivity(ACCESS, activity)))
        yield* Effect.logWarning("export failed", error)
        yield* Effect.logError(error)
      }).pipe(Effect.provide(layer))
      const logged = (yield* lines).join("\n")
      expect(logged).toContain("unauthorized")
      expect(SECRETS.filter((secret) => logged.includes(secret))).toEqual([])
      expect(SECRETS.filter((secret) => String(Redacted.make(secret)).includes(secret))).toEqual([])
    }),
  )
})

describe("StravaApi.layerConsole", () => {
  const consoleApi = <A, E>(f: (api: StravaApi["Service"]) => Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      return yield* f(yield* StravaApi)
    }).pipe(Effect.provide(StravaApi.layerConsole))

  it.effect("creates a console activity id from the session id and logs the line", () =>
    Effect.gen(function* () {
      const { lines, layer } = capturedLogs()
      const created = yield* consoleApi((api) => api.createActivity(ACCESS, activity)).pipe(
        Effect.provide(layer),
      )
      expect(created).toEqual({ id: "console-12345678" })
      expect((yield* lines).join("\n")).toContain(
        "[strava:console] create activity Push day 2026-10-26T18:30:00 2880s",
      )
    }),
  )

  it.effect("exchanges any code for the Console Athlete with a six hour token", () =>
    Effect.gen(function* () {
      const grant = yield* consoleApi((api) => api.exchangeCode(CODE))
      expect(grant.athlete).toEqual({ id: "console-athlete", displayName: "Console Athlete" })
      expect(DateTime.toEpochMillis(grant.expiresAt)).toBe(6 * 60 * 60 * 1000) // TestClock at 0
      expect(grant.scope).toContain("activity:write")
    }),
  )

  it.effect("refreshes and revokes without failing", () =>
    Effect.gen(function* () {
      const tokens = yield* consoleApi((api) => api.refresh(REFRESH))
      expect(DateTime.toEpochMillis(tokens.expiresAt)).toBe(6 * 60 * 60 * 1000)
      yield* consoleApi((api) => api.revoke(ACCESS))
    }),
  )

  it.effect("with the inactive simulation createActivity fails and logs, the rest succeed", () =>
    Effect.gen(function* () {
      const { lines, layer } = capturedLogs()
      const inactive = <A, E>(f: (api: StravaApi["Service"]) => Effect.Effect<A, E>) =>
        Effect.gen(function* () {
          return yield* f(yield* StravaApi)
        }).pipe(Effect.provide(StravaApi.layerConsoleWith(Option.some("inactive"))))
      const error = yield* Effect.flip(
        inactive((api) => api.createActivity(ACCESS, activity)),
      ).pipe(Effect.provide(layer))
      expect({ reason: error.reason, status: error.status }).toEqual({
        reason: "app_inactive",
        status: Option.some(403),
      })
      expect((yield* lines).join("\n")).toContain("[strava] application refused status=403 body=")
      yield* inactive((api) => api.exchangeCode(CODE))
      yield* inactive((api) => api.refresh(REFRESH))
      yield* inactive((api) => api.revoke(ACCESS))
    }),
  )

  it.effect("logs no token, code or secret", () =>
    Effect.gen(function* () {
      const { lines, layer } = capturedLogs()
      yield* Effect.gen(function* () {
        yield* consoleApi((api) => api.exchangeCode(CODE))
        yield* consoleApi((api) => api.refresh(REFRESH))
        yield* consoleApi((api) => api.createActivity(ACCESS, activity))
        yield* consoleApi((api) => api.revoke(ACCESS))
      }).pipe(Effect.provide(layer))
      const logged = (yield* lines).join("\n")
      expect(logged).toContain("[strava:console]")
      expect(SECRETS.filter((secret) => logged.includes(secret))).toEqual([])
      expect(logged).not.toContain("console-access-token")
      expect(logged).not.toContain("console-refresh-token")
    }),
  )
})

describe("StravaApi.layer", () => {
  it.effect("picks the console layer from a local config", () =>
    Effect.gen(function* () {
      const grant = yield* Effect.gen(function* () {
        return yield* (yield* StravaApi).exchangeCode(CODE)
      }).pipe(
        Effect.provide(
          StravaApi.layer.pipe(Layer.provide(Layer.orDie(WorkerConfig.layerFromEnv(localEnv)))),
        ),
      )
      expect(grant.athlete.displayName).toBe("Console Athlete")
    }),
  )

  it.effect("passes STRAVA_CONSOLE_FAIL from the config to the console layer", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        Effect.gen(function* () {
          return yield* (yield* StravaApi).createActivity(ACCESS, activity)
        }).pipe(
          Effect.provide(
            StravaApi.layer.pipe(
              Layer.provide(
                Layer.orDie(
                  WorkerConfig.layerFromEnv({ ...localEnv, STRAVA_CONSOLE_FAIL: "inactive" }),
                ),
              ),
            ),
          ),
        ),
      )
      expect(error.reason).toBe("app_inactive")
    }),
  )
})
