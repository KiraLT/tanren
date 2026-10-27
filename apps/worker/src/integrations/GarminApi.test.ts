import { describe, expect, it } from "@effect/vitest"
import { LocalDate } from "@tanren/shared"
import { DateTime, Effect, Fiber, Layer, Logger, Option, Redacted, Ref } from "effect"
import { Base64Url } from "effect/encoding"
import {
  Headers,
  HttpClient,
  HttpClientError,
  type HttpClientRequest,
  HttpClientResponse,
  UrlParams,
} from "effect/http"
import { TestClock } from "effect/testing"
import { WorkerConfig } from "../Config"
import type { EnvVars } from "../Env"
import { envVars as localEnv } from "../testing/fixtures"
import {
  GARMIN_ACTIVITIES_PATH,
  GARMIN_DAILY_PATH,
  GARMIN_EXCHANGE_PATH,
  GARMIN_PAGE_SIZE,
  GARMIN_PROFILE_PATH,
  GarminApi,
  GarminApiError,
} from "./GarminApi"

const BASE = "https://garmin.example.test"
const KEY_TEXT = "SECRET-GARMIN-KEY-0123456789"
const JWT_TEXT_PAYLOAD = Base64Url.encode(
  JSON.stringify({ exp: 1_792_000_000, iat: 1_791_913_600 }),
)
const JWT_TEXT = `SECRETHEADER.${JWT_TEXT_PAYLOAD}.SECRETSIG`
const KEY = Redacted.make(KEY_TEXT)
const JWT = Redacted.make(JWT_TEXT)
const SECRETS = [KEY_TEXT, "SECRETHEADER", "SECRETSIG", JWT_TEXT_PAYLOAD]
const window = {
  startDate: LocalDate.make("2026-09-27"),
  endDate: LocalDate.make("2026-10-27"),
}
const DAY = LocalDate.make("2026-10-27")

const providerEnv: EnvVars = {
  ...localEnv,
  GARMIN_MODE: "provider",
  GARMIN_BASE_URL: BASE,
}

type Reply =
  | { readonly _tag: "Status"; readonly status: number; readonly body: string }
  | { readonly _tag: "Transport" }

const ok = (body: unknown): Reply => ({ _tag: "Status", status: 200, body: JSON.stringify(body) })
const text = (body: string): Reply => ({ _tag: "Status", status: 200, body })
const status = (code: number): Reply => ({ _tag: "Status", status: code, body: "" })

const headerOf = (request: HttpClientRequest.HttpClientRequest, name: string) =>
  Option.getOrElse(Headers.get(request.headers, name), () => "")

const paramsOf = (request: HttpClientRequest.HttpClientRequest) =>
  UrlParams.toRecord(request.urlParams)

/** A `GarminApi.layerHttp` over a fake `HttpClient` that records requests and answers `reply`. */
const stubbed = (reply: Reply) =>
  Effect.gen(function* () {
    const seen = yield* Ref.make<ReadonlyArray<HttpClientRequest.HttpClientRequest>>([])
    const client = HttpClient.make((request) =>
      Ref.update(seen, (all) => [...all, request]).pipe(
        Effect.andThen(
          reply._tag === "Transport"
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
    const layer = GarminApi.layerHttp.pipe(
      Layer.provide(
        Layer.merge(
          Layer.orDie(WorkerConfig.layerFromEnv(providerEnv)),
          Layer.succeed(HttpClient.HttpClient, client),
        ),
      ),
    )
    const run = <A, E>(f: (api: GarminApi["Service"]) => Effect.Effect<A, E>) =>
      Effect.gen(function* () {
        return yield* f(yield* GarminApi)
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

const listItem = {
  activityId: 987654321,
  activityName: "  Evening run  ",
  activityType: { typeId: 1, typeKey: "running", parentTypeId: 17 },
  startTimeGMT: "2026-10-26 17:30:05",
  startTimeLocal: "2026-10-26 20:30:05",
  duration: 1800.6,
  distance: 5234.5,
  calories: 410.4,
  averageHR: 152.2,
  maxHR: 174,
}

describe("GarminApi.layerHttp exchange", () => {
  it.effect("exchanges the key: POST, ApiKey header, JWT text, expiry from exp", () =>
    Effect.gen(function* () {
      const { run, requests } = yield* stubbed(text(`${JWT_TEXT}\n`))
      const grant = yield* run((api) => api.exchange(KEY))
      const [request, ...rest] = yield* requests
      expect(rest).toEqual([])
      expect(request?.method).toBe("POST")
      expect(request?.url).toBe(`${BASE}${GARMIN_EXCHANGE_PATH}`)
      expect(request === undefined ? "" : headerOf(request, "authorization")).toBe(
        `ApiKey ${KEY_TEXT}`,
      )
      expect(Redacted.value(grant.jwt)).toBe(JWT_TEXT)
      expect(DateTime.toEpochMillis(grant.expiresAt)).toBe(1_792_000_000_000)
      expect(String(grant.jwt)).not.toContain("SECRETSIG")
    }),
  )

  it.effect("falls back to now + 23 h when the JWT payload cannot be read", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.UTC(2026, 9, 27, 12))
      const { run } = yield* stubbed(text("not-a-jwt"))
      const grant = yield* run((api) => api.exchange(KEY))
      expect(DateTime.toEpochMillis(grant.expiresAt)).toBe(Date.UTC(2026, 9, 28, 11))
    }),
  )

  it.effect("an empty 200 body is a provider error", () =>
    Effect.gen(function* () {
      const { run } = yield* stubbed(text("  "))
      const error = yield* Effect.flip(run((api) => api.exchange(KEY)))
      expect(error.reason).toBe("provider_error")
    }),
  )

  const failureCases = [
    [401, "token_rejected"],
    [403, "token_rejected"],
    [429, "rate_limited"],
    [503, "provider_error"],
    [400, "rejected"],
  ] as const
  failureCases.forEach(([code, reason]) => {
    it.effect(`maps HTTP ${code} to ${reason}`, () =>
      Effect.gen(function* () {
        const { run } = yield* stubbed(status(code))
        const error = yield* Effect.flip(run((api) => api.exchange(KEY)))
        expect(error).toBeInstanceOf(GarminApiError)
        expect({ reason: error.reason, status: error.status }).toEqual({
          reason,
          status: Option.some(code),
        })
      }),
    )
  })

  it.effect("maps a lost connection to transport with no status", () =>
    Effect.gen(function* () {
      const { run } = yield* stubbed({ _tag: "Transport" })
      const error = yield* Effect.flip(run((api) => api.exchange(KEY)))
      expect({ reason: error.reason, status: error.status }).toEqual({
        reason: "transport",
        status: Option.none(),
      })
    }),
  )
})

describe("GarminApi.layerHttp data calls", () => {
  it.effect("reads the display name with the bearer JWT", () =>
    Effect.gen(function* () {
      const { run, requests } = yield* stubbed(ok({ displayName: " Lukas K. ", other: 1 }))
      const profile = yield* run((api) => api.profile(JWT))
      const [request] = yield* requests
      expect(request?.method).toBe("GET")
      expect(request?.url).toBe(`${BASE}${GARMIN_PROFILE_PATH}`)
      expect(request === undefined ? "" : headerOf(request, "authorization")).toBe(
        `Bearer ${JWT_TEXT}`,
      )
      expect(profile.displayName).toEqual(Option.some("Lukas K."))
    }),
  )

  it.effect("a profile without a usable name is None", () =>
    Effect.gen(function* () {
      const { run } = yield* stubbed(ok({ displayName: "   " }))
      expect((yield* run((api) => api.profile(JWT))).displayName).toEqual(Option.none())
    }),
  )

  it.effect("maps one list item to an ImportedActivityInsert and sends the query", () =>
    Effect.gen(function* () {
      const { run, requests } = yield* stubbed(ok([listItem]))
      const page = yield* run((api) => api.activities(JWT, window, 50))
      const [request] = yield* requests
      expect(request?.url).toBe(`${BASE}${GARMIN_ACTIVITIES_PATH}`)
      expect(request === undefined ? {} : paramsOf(request)).toEqual({
        limit: "50",
        start: "50",
        startDate: "2026-09-27",
        endDate: "2026-10-27",
      })
      expect(request === undefined ? "" : headerOf(request, "authorization")).toBe(
        `Bearer ${JWT_TEXT}`,
      )
      expect(page.more).toBe(false)
      expect(page.items).toHaveLength(1)
      const [item] = page.items
      expect(item).toMatchObject({
        provider: "garmin",
        externalId: "987654321",
        sport: "running",
        title: "Evening run",
        durationSeconds: 1801,
        distanceMeters: Option.some(5234.5),
        calories: Option.some(410),
        avgHeartRate: Option.some(152),
        maxHeartRate: Option.some(174),
      })
      expect(item === undefined ? 0 : DateTime.toEpochMillis(item.startedAt)).toBe(
        Date.UTC(2026, 9, 26, 17, 30, 5),
      )
    }),
  )

  it.effect("optional fields become None, a blank name falls back to the sport", () =>
    Effect.gen(function* () {
      const { run } = yield* stubbed(
        ok([
          {
            activityId: 5,
            activityName: " ",
            activityType: { typeKey: "strength_training" },
            startTimeGMT: "2026-10-25 08:00:00",
            duration: 3000,
            distance: null,
            averageHR: 5,
          },
        ]),
      )
      const [item] = (yield* run((api) => api.activities(JWT, window, 0))).items
      expect(item).toMatchObject({
        sport: "strength",
        title: "Strength",
        distanceMeters: Option.none(),
        calories: Option.none(),
        avgHeartRate: Option.none(),
        maxHeartRate: Option.none(),
      })
    }),
  )

  it.effect("a full page of 50 reports more; an item that does not decode is skipped", () =>
    Effect.gen(function* () {
      expect(GARMIN_PAGE_SIZE).toBe(50)
      const full = [
        { activityId: "bad" },
        ...Array.from({ length: 49 }, (_, index) => ({ ...listItem, activityId: index + 1 })),
      ]
      const { run } = yield* stubbed(ok(full))
      const page = yield* run((api) => api.activities(JWT, window, 0))
      expect(page.more).toBe(true)
      expect(page.items).toHaveLength(49)
    }),
  )

  it.effect("ignores every Garmin key the mapper does not read (lean decode)", () =>
    Effect.gen(function* () {
      const noisy = {
        ...listItem,
        summaryDTO: { splits: Array.from({ length: 50 }, (_, lap) => ({ lap, hr: 140 })) },
        ownerDisplayName: "someone",
        deviceId: 3_456_789,
        description: "x".repeat(2_000),
      }
      const lean = yield* (yield* stubbed(ok([listItem]))).run((api) =>
        api.activities(JWT, window, 0),
      )
      const page = yield* (yield* stubbed(ok([noisy]))).run((api) => api.activities(JWT, window, 0))
      expect(page.items).toEqual(lean.items)
    }),
  )

  it.effect("an empty page is not more", () =>
    Effect.gen(function* () {
      const { run } = yield* stubbed(ok([]))
      expect(yield* run((api) => api.activities(JWT, window, 0))).toEqual({
        items: [],
        more: false,
      })
    }),
  )

  it.effect("a body that is not a list is a provider error", () =>
    Effect.gen(function* () {
      const { run } = yield* stubbed(ok({ message: "nope" }))
      const error = yield* Effect.flip(run((api) => api.activities(JWT, window, 0)))
      expect(error.reason).toBe("provider_error")
    }),
  )

  it.effect("daily: totalCalories = active + bmr, steps from totalSteps", () =>
    Effect.gen(function* () {
      const { run, requests } = yield* stubbed(
        ok({
          calendarDate: "2026-10-27",
          activeKilocalories: 612.4,
          bmrKilocalories: 1801.2,
          totalSteps: 9876,
          restingHeartRate: 54,
        }),
      )
      const day = yield* run((api) => api.daily(JWT, DAY))
      const [request] = yield* requests
      expect(request?.url).toBe(`${BASE}${GARMIN_DAILY_PATH}`)
      expect(request === undefined ? {} : paramsOf(request)).toEqual({
        calendarDate: "2026-10-27",
      })
      expect(day).toEqual(
        Option.some(
          expect.objectContaining({
            provider: "garmin",
            date: "2026-10-27",
            totalCalories: Option.some(2413),
            activeCalories: Option.some(612),
            steps: Option.some(9876),
            restingHeartRate: Option.some(54),
          }),
        ),
      )
    }),
  )

  it.effect("daily: totalCalories is None when bmr is missing; an empty day is None", () =>
    Effect.gen(function* () {
      const partial = yield* stubbed(ok({ activeKilocalories: 100, totalSteps: 10 }))
      const day = yield* partial.run((api) => api.daily(JWT, DAY))
      expect(day).toEqual(
        Option.some(
          expect.objectContaining({ totalCalories: Option.none(), steps: Option.some(10) }),
        ),
      )
      const empty = yield* stubbed(ok({ calendarDate: "2026-10-27" }))
      expect(yield* empty.run((api) => api.daily(JWT, DAY))).toEqual(Option.none())
    }),
  )

  it.effect("daily: a 404 is no summary for that day (None), not a failure", () =>
    Effect.gen(function* () {
      const missing = yield* stubbed(status(404))
      expect(yield* missing.run((api) => api.daily(JWT, DAY))).toEqual(Option.none())
      // Only `daily` reads 404 as empty: on the activity list it is still `rejected`.
      expect(
        (yield* Effect.flip(missing.run((api) => api.activities(JWT, window, 0)))).reason,
      ).toBe("rejected")
    }),
  )

  it.effect("data calls map 401 to token_rejected and 429 to rate_limited", () =>
    Effect.gen(function* () {
      const dead = yield* stubbed(status(401))
      expect((yield* Effect.flip(dead.run((api) => api.activities(JWT, window, 0)))).reason).toBe(
        "token_rejected",
      )
      const limited = yield* stubbed(status(429))
      expect((yield* Effect.flip(limited.run((api) => api.daily(JWT, DAY)))).reason).toBe(
        "rate_limited",
      )
    }),
  )

  it.effect("logs method, path and status only: no key, JWT, header or query", () =>
    Effect.gen(function* () {
      const { lines, layer } = capturedLogs()
      const ok200 = yield* stubbed(text(JWT_TEXT))
      yield* ok200.run((api) => api.exchange(KEY)).pipe(Effect.provide(layer))
      const page = yield* stubbed(ok([listItem]))
      yield* page.run((api) => api.activities(JWT, window, 0)).pipe(Effect.provide(layer))
      const dead = yield* stubbed(status(401))
      yield* Effect.flip(dead.run((api) => api.exchange(KEY))).pipe(Effect.provide(layer))
      const lost = yield* stubbed({ _tag: "Transport" })
      yield* Effect.flip(lost.run((api) => api.profile(JWT))).pipe(Effect.provide(layer))
      const logged = (yield* lines).join("\n")
      expect(logged).toContain(`POST ${GARMIN_EXCHANGE_PATH} status=200`)
      expect(logged).toContain(`GET ${GARMIN_ACTIVITIES_PATH} status=200`)
      expect(logged).toContain(`POST ${GARMIN_EXCHANGE_PATH} status=401`)
      expect(logged).toContain(`GET ${GARMIN_PROFILE_PATH} transport`)
      ;[...SECRETS, "ApiKey", "Bearer", "startDate", "limit="].forEach((secret) => {
        expect(logged).not.toContain(secret)
      })
    }),
  )
})

describe("GarminApi console layer", () => {
  const consoleRun = <A, E>(
    fail: Option.Option<"rejected">,
    f: (api: GarminApi["Service"]) => Effect.Effect<A, E>,
  ) =>
    Effect.gen(function* () {
      return yield* f(yield* GarminApi)
    }).pipe(Effect.provide(GarminApi.layerConsoleWith(fail)))

  const NOW = Date.UTC(2026, 9, 27, 9, 30)

  it.effect("serves 2 activities: a run with distance and a strength session without", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const first = yield* consoleRun(Option.none(), (api) => api.activities(JWT, window, 0))
      const second = yield* consoleRun(Option.none(), (api) => api.activities(JWT, window, 0))
      expect(second).toEqual(first)
      expect(first.more).toBe(false)
      expect(first.items.map((item) => [item.sport, Option.isSome(item.distanceMeters)])).toEqual([
        ["running", true],
        ["strength", false],
      ])
      expect(first.items.every((item) => DateTime.toEpochMillis(item.startedAt) < NOW)).toBe(true)
      const next = yield* consoleRun(Option.none(), (api) =>
        api.activities(JWT, window, GARMIN_PAGE_SIZE),
      )
      expect(next.items).toEqual([])
    }),
  )

  it.effect("serves 7 days ending today, deterministically, and nothing older", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const days = [
        "2026-10-21",
        "2026-10-22",
        "2026-10-23",
        "2026-10-24",
        "2026-10-25",
        "2026-10-26",
        "2026-10-27",
      ]
      const rows = yield* Effect.forEach(days, (day) =>
        consoleRun(Option.none(), (api) => api.daily(JWT, LocalDate.make(day))),
      )
      expect(rows.every(Option.isSome)).toBe(true)
      expect(rows.map(Option.map((row) => row.date))).toEqual(days.map(Option.some))
      const again = yield* consoleRun(Option.none(), (api) =>
        api.daily(JWT, LocalDate.make("2026-10-27")),
      )
      expect(again).toEqual(rows[6])
      const older = yield* consoleRun(Option.none(), (api) =>
        api.daily(JWT, LocalDate.make("2026-10-20")),
      )
      expect(Option.isNone(older)).toBe(true)
    }),
  )

  it.effect("exchange succeeds, and GARMIN_CONSOLE_FAIL=rejected makes it token_rejected", () =>
    Effect.gen(function* () {
      const grant = yield* consoleRun(Option.none(), (api) => api.exchange(KEY))
      expect(Redacted.value(grant.jwt)).toBe("console-garmin-jwt")
      const error = yield* Effect.flip(
        consoleRun(Option.some("rejected"), (api) => api.exchange(KEY)),
      )
      expect({ reason: error.reason, status: error.status }).toEqual({
        reason: "token_rejected",
        status: Option.some(401),
      })
      const profile = yield* consoleRun(Option.none(), (api) => api.profile(JWT))
      expect(profile.displayName).toEqual(Option.some("Console Garmin"))
    }),
  )

  it.effect("GarminApi.layer follows GARMIN_MODE and GARMIN_CONSOLE_FAIL", () =>
    Effect.gen(function* () {
      const failing = GarminApi.layer.pipe(
        Layer.provide(
          Layer.orDie(WorkerConfig.layerFromEnv({ ...localEnv, GARMIN_CONSOLE_FAIL: "rejected" })),
        ),
      )
      const error = yield* Effect.flip(
        Effect.gen(function* () {
          return yield* (yield* GarminApi).exchange(KEY)
        }).pipe(Effect.provide(failing)),
      )
      expect(error.reason).toBe("token_rejected")
    }),
  )
})

describe("GarminApi.layerHttp timeout", () => {
  it.effect("a call that never answers fails transport with no status after 10 seconds", () =>
    Effect.gen(function* () {
      const silent = GarminApi.layerHttp.pipe(
        Layer.provide(
          Layer.merge(
            Layer.orDie(WorkerConfig.layerFromEnv(providerEnv)),
            Layer.succeed(
              HttpClient.HttpClient,
              HttpClient.make(() => Effect.never),
            ),
          ),
        ),
      )
      const fiber = yield* Effect.forkChild(
        Effect.flip(
          Effect.gen(function* () {
            return yield* (yield* GarminApi).daily(JWT, DAY)
          }).pipe(Effect.provide(silent)),
        ),
      )
      yield* TestClock.adjust("10 seconds")
      const error = yield* Fiber.join(fiber)
      expect(error).toMatchObject({ _tag: "GarminApiError", reason: "transport" })
      expect(error.status).toEqual(Option.none())
    }),
  )
})
