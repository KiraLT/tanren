import {
  DailyHealthInsert,
  type ExportFailureReason,
  ImportedActivityInsert,
  type ImportedSport,
  Label,
  type LocalDate,
  sportOf,
  type Timestamp,
} from "@tanren/shared"
import {
  Array as Arr,
  Context,
  Data,
  DateTime,
  Effect,
  Layer,
  Match,
  Option,
  Redacted,
  Result,
  Schema,
} from "effect"
import { Base64Url } from "effect/encoding"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http"
import { WorkerConfig } from "../Config"

/**
 * The only Garmin Personal API calls Tanren makes (docs/design/garmin.md §0; spike G1). The owner
 * pastes a long-lived key; `exchange` trades it for a 24 h JWT; the three data calls use the JWT.
 */
export const GARMIN_EXCHANGE_PATH = "/personalapitoken-service/personal-api/personal-api-key/token"
export const GARMIN_PROFILE_PATH = "/userprofile-service/userprofile/settings"
export const GARMIN_ACTIVITIES_PATH = "/activitylist-service/activities/search/activities"
export const GARMIN_DAILY_PATH = "/usersummary-service/usersummary/daily"
export const GARMIN_USER_AGENT = "tanren/1"
/** The longest one Garmin call (request and body together) may take; past it the attempt is `transport`. */
export const GARMIN_REQUEST_TIMEOUT = "10 seconds"
/** One page of the activity list; a page of exactly this length means there may be more. */
export const GARMIN_PAGE_SIZE = 200
/** A JWT whose `exp` cannot be read is re-exchanged one hour before the 24 h Garmin gives. */
const FALLBACK_JWT_LIFETIME = { hours: 23 } as const

/**
 * One Garmin call failed. Internal (`GarminPull` and the connect handler map it); never carries
 * Garmin's response text, a key, a JWT or a header.
 */
export class GarminApiError extends Data.TaggedError("GarminApiError")<{
  readonly reason: ExportFailureReason
  readonly status: Option.Option<number>
}> {}

export interface GarminActivityWindow {
  readonly startDate: LocalDate
  readonly endDate: LocalDate
}

export interface GarminApiShape {
  /** Trades the pasted key for a JWT; 401/403 is `token_rejected`. */
  readonly exchange: (
    key: Redacted.Redacted<string>,
  ) => Effect.Effect<
    { readonly jwt: Redacted.Redacted<string>; readonly expiresAt: Timestamp },
    GarminApiError
  >
  readonly profile: (
    jwt: Redacted.Redacted<string>,
  ) => Effect.Effect<{ readonly displayName: Option.Option<Label> }, GarminApiError>
  /** One page (limit 200) from offset `start`; `more` is true when the page is full. */
  readonly activities: (
    jwt: Redacted.Redacted<string>,
    window: GarminActivityWindow,
    start: number,
  ) => Effect.Effect<
    { readonly items: ReadonlyArray<ImportedActivityInsert>; readonly more: boolean },
    GarminApiError
  >
  readonly daily: (
    jwt: Redacted.Redacted<string>,
    date: LocalDate,
  ) => Effect.Effect<Option.Option<DailyHealthInsert>, GarminApiError>
}

const failed = (reason: ExportFailureReason, status: Option.Option<number>) =>
  new GarminApiError({ reason, status })

/** 401/403 mean the key or JWT is dead; 429 is the rate limit; 5xx is Garmin's; other 4xx is ours. */
const reasonForStatus = (status: number): ExportFailureReason =>
  status === 401 || status === 403
    ? "token_rejected"
    : status === 429
      ? "rate_limited"
      : status >= 500
        ? "provider_error"
        : "rejected"

// --- mapping (field names read from the extracted OpenAPI spec, 2026-10-27) -------------------
//
// `SummarizedActivityDTO` (list item): `activityId` int64, `activityName`, `activityType.typeKey`
// (`ActivityTypeDTO`: typeId, typeKey, parentTypeId), `startTimeGMT` ("yyyy-MM-dd HH:mm:ss", UTC, no
// offset), `duration` (s, double), `distance` (m), `calories`, `averageHR`, `maxHR` (all double).
// `UserDailySummaryDto`: `activeKilocalories`, `bmrKilocalories`, `totalSteps` (int32; there is no
// `steps` key), `restingHeartRate` (int32), `calendarDate`. The spec also has `totalKilocalories`;
// the design pins `totalCalories = active + bmr`, so that field is not read.

const MaybeNumber = Schema.optionalKey(Schema.NullOr(Schema.Number))

const ActivityItem = Schema.Struct({
  activityId: Schema.Number.check(Schema.isInt()),
  activityName: Schema.optionalKey(Schema.NullOr(Schema.String)),
  activityType: Schema.optionalKey(
    Schema.NullOr(Schema.Struct({ typeKey: Schema.optionalKey(Schema.NullOr(Schema.String)) })),
  ),
  startTimeGMT: Schema.String,
  duration: MaybeNumber,
  distance: MaybeNumber,
  calories: MaybeNumber,
  averageHR: MaybeNumber,
  maxHR: MaybeNumber,
})

const DailyBody = Schema.Struct({
  activeKilocalories: MaybeNumber,
  bmrKilocalories: MaybeNumber,
  totalSteps: MaybeNumber,
  restingHeartRate: MaybeNumber,
})

const ProfileBody = Schema.Struct({
  displayName: Schema.optionalKey(Schema.NullOr(Schema.String)),
})

const JwtPayload = Schema.fromJsonString(
  Schema.Struct({ exp: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)) }),
)

/** A non-negative whole number, or `None` for anything missing, negative or not finite. */
const wholeNumber = (value: number | null | undefined): Option.Option<number> =>
  Option.filter(
    Option.map(Option.fromNullishOr(value), Math.round),
    (n) => Number.isFinite(n) && n >= 0,
  )

const heartRate = (value: number | null | undefined): Option.Option<number> =>
  Option.filter(wholeNumber(value), (n) => n >= 20 && n <= 260)

const titleCase = (sport: ImportedSport) => `${sport.charAt(0).toUpperCase()}${sport.slice(1)}`

/** `activityName` trimmed to a `Label`; blank or too long falls back to the sport, title-cased. */
const titleOf = (name: string | null | undefined, sport: ImportedSport): Label =>
  Option.getOrElse(
    Option.flatMap(Option.fromNullishOr(name), (raw) =>
      Schema.decodeUnknownOption(Label)(raw.trim().slice(0, 80).trim()),
    ),
    () => Label.make(titleCase(sport)),
  )

const GMT_LOCAL = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/

/** Garmin's `startTimeGMT` has no offset: read it as UTC. */
const startedAtOf = (raw: string): Option.Option<Timestamp> =>
  Schema.decodeUnknownOption(Schema.DateTimeUtcFromString)(raw.trim().replace(GMT_LOCAL, "$1T$2Z"))

const toActivity = (item: typeof ActivityItem.Type) => {
  const sport = sportOf(item.activityType?.typeKey ?? "")
  return Option.match(startedAtOf(item.startTimeGMT), {
    onNone: () => Effect.succeed(Option.none<ImportedActivityInsert>()),
    onSome: (startedAt) =>
      ImportedActivityInsert.makeEffect({
        provider: "garmin",
        externalId: String(item.activityId),
        sport,
        title: titleOf(item.activityName, sport),
        startedAt,
        durationSeconds: Option.getOrElse(wholeNumber(item.duration), () => 0),
        distanceMeters: Option.filter(
          Option.fromNullishOr(item.distance),
          (n) => Number.isFinite(n) && n >= 0,
        ),
        calories: wholeNumber(item.calories),
        avgHeartRate: heartRate(item.averageHR),
        maxHeartRate: heartRate(item.maxHR),
      }).pipe(Effect.option),
  })
}

const toDaily = (date: LocalDate, body: typeof DailyBody.Type) => {
  const active = wholeNumber(body.activeKilocalories)
  const bmr = wholeNumber(body.bmrKilocalories)
  const steps = wholeNumber(body.totalSteps)
  const resting = heartRate(body.restingHeartRate)
  // Nothing known for the day (the watch was off): no row rather than a row of Nones.
  if (
    Option.isNone(active) &&
    Option.isNone(bmr) &&
    Option.isNone(steps) &&
    Option.isNone(resting)
  ) {
    return Effect.succeed(Option.none<DailyHealthInsert>())
  }
  return DailyHealthInsert.makeEffect({
    provider: "garmin",
    date,
    totalCalories: Option.zipWith(active, bmr, (a, b) => a + b),
    activeCalories: active,
    steps,
    restingHeartRate: resting,
  }).pipe(Effect.option)
}

/** The JWT's `exp` claim (base64url JSON, signature not checked: only schedules the re-exchange). */
const expiryOf = (jwt: string): Option.Option<Timestamp> =>
  Option.flatMap(Option.fromNullishOr(jwt.split(".")[1]), (payload) =>
    Result.match(Base64Url.decodeString(payload), {
      onFailure: () => Option.none<Timestamp>(),
      onSuccess: (json) =>
        Option.flatMap(Schema.decodeUnknownOption(JwtPayload)(json), ({ exp }) =>
          DateTime.make(exp * 1000),
        ),
    }),
  )

// --- real Garmin ------------------------------------------------------------------------------

const makeHttp = Effect.gen(function* () {
  const config = yield* WorkerConfig
  const client = yield* HttpClient.HttpClient
  const origin = config.garminBaseUrl

  const url = (path: string) => `${origin}${path}`

  const withJwt = (request: HttpClientRequest.HttpClientRequest, jwt: Redacted.Redacted<string>) =>
    request.pipe(
      HttpClientRequest.bearerToken(jwt),
      HttpClientRequest.setHeader("user-agent", GARMIN_USER_AGENT),
      HttpClientRequest.acceptJson,
    )

  /** ONE timeout around a whole call, request and body read together. */
  const bounded = <A>(call: Effect.Effect<A, GarminApiError>) =>
    call.pipe(
      Effect.timeoutOrElse({
        duration: GARMIN_REQUEST_TIMEOUT,
        orElse: () => Effect.fail(failed("transport", Option.none())),
      }),
    )

  /**
   * Runs a request; a non-2xx status becomes `GarminApiError`, a lost connection `transport`.
   * The log line is method, path and status: never a header, a body or the query.
   */
  const send = (path: string, request: HttpClientRequest.HttpClientRequest) =>
    client.execute(request).pipe(
      Effect.tapError(() => Effect.logWarning(`[garmin] ${request.method} ${path} transport`)),
      Effect.mapError(() => failed("transport", Option.none())),
      Effect.tap((response) =>
        Effect.log(`[garmin] ${request.method} ${path} status=${response.status}`),
      ),
      Effect.flatMap((response) =>
        response.status >= 200 && response.status < 300
          ? Effect.succeed(response)
          : Effect.fail(failed(reasonForStatus(response.status), Option.some(response.status))),
      ),
    )

  const providerError = (status: number) => failed("provider_error", Option.some(status))

  const exchange = Effect.fn("GarminApi.exchange")(function* (key: Redacted.Redacted<string>) {
    const response = yield* send(
      GARMIN_EXCHANGE_PATH,
      HttpClientRequest.post(url(GARMIN_EXCHANGE_PATH)).pipe(
        HttpClientRequest.setHeader("authorization", `ApiKey ${Redacted.value(key)}`),
        HttpClientRequest.setHeader("user-agent", GARMIN_USER_AGENT),
      ),
    )
    const text = yield* response.text.pipe(Effect.mapError(() => providerError(response.status)))
    const jwt = text.trim()
    if (jwt.length === 0) {
      return yield* providerError(response.status)
    }
    const now = yield* DateTime.now
    return {
      jwt: Redacted.make(jwt),
      expiresAt: Option.getOrElse(expiryOf(jwt), () => DateTime.add(now, FALLBACK_JWT_LIFETIME)),
    }
  }, bounded)

  const profile = Effect.fn("GarminApi.profile")(function* (jwt: Redacted.Redacted<string>) {
    const response = yield* send(
      GARMIN_PROFILE_PATH,
      withJwt(HttpClientRequest.get(url(GARMIN_PROFILE_PATH)), jwt),
    )
    const body = yield* response.json.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(ProfileBody)),
      Effect.mapError(() => providerError(response.status)),
    )
    return {
      displayName: Option.flatMap(Option.fromNullishOr(body.displayName), (name) =>
        Schema.decodeUnknownOption(Label)(name.trim().slice(0, 80).trim()),
      ),
    }
  }, bounded)

  const activities = Effect.fn("GarminApi.activities")(function* (
    jwt: Redacted.Redacted<string>,
    window: GarminActivityWindow,
    start: number,
  ) {
    const response = yield* send(
      GARMIN_ACTIVITIES_PATH,
      withJwt(HttpClientRequest.get(url(GARMIN_ACTIVITIES_PATH)), jwt).pipe(
        HttpClientRequest.setUrlParams({
          limit: String(GARMIN_PAGE_SIZE),
          start: String(start),
          startDate: window.startDate,
          endDate: window.endDate,
        }),
      ),
    )
    const rows = yield* response.json.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Schema.Unknown))),
      Effect.mapError(() => providerError(response.status)),
    )
    // An item that does not decode is skipped, not fatal: one odd activity must not stall the page.
    const decoded = Arr.getSomes(rows.map((row) => Schema.decodeUnknownOption(ActivityItem)(row)))
    const items = Arr.getSomes(yield* Effect.forEach(decoded, toActivity))
    return { items, more: rows.length === GARMIN_PAGE_SIZE }
  }, bounded)

  const daily = Effect.fn("GarminApi.daily")(function* (
    jwt: Redacted.Redacted<string>,
    date: LocalDate,
  ) {
    const sent = yield* send(
      GARMIN_DAILY_PATH,
      withJwt(HttpClientRequest.get(url(GARMIN_DAILY_PATH)), jwt).pipe(
        HttpClientRequest.setUrlParams({ calendarDate: date }),
      ),
    ).pipe(
      Effect.map(Option.some),
      // 404 = Garmin has no summary for that day (watch off, before the account existed): no row.
      Effect.catchIf(
        (error) => Option.getOrElse(error.status, () => 0) === 404,
        () => Effect.succeed(Option.none()),
      ),
    )
    if (Option.isNone(sent)) {
      return Option.none<DailyHealthInsert>()
    }
    const response = sent.value
    const body = yield* response.json.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(DailyBody)),
      Effect.mapError(() => providerError(response.status)),
    )
    return yield* toDaily(date, body)
  }, bounded)

  return { exchange, profile, activities, daily } satisfies GarminApiShape
})

// --- console (no network) ---------------------------------------------------------------------

const CONSOLE = "[garmin:console]"
const CONSOLE_DAYS = 7
const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

/** Deterministic day values from the calendar day, so a re-run shows the same strip. */
const consoleDay = (date: LocalDate, dayOfMonth: number) =>
  DailyHealthInsert.makeEffect({
    provider: "garmin",
    date,
    totalCalories: Option.some(2300 + dayOfMonth * 10 + 450),
    activeCalories: Option.some(450 + dayOfMonth * 10),
    steps: Option.some(6000 + ((dayOfMonth * 377) % 5000)),
    restingHeartRate: Option.some(52 + (dayOfMonth % 6)),
  }).pipe(Effect.option)

/**
 * `GARMIN_MODE=console`: no network. 2 activities (a run with a distance, a strength session without
 * one) dated yesterday and the day before, and 7 daily summaries ending today (UTC). Nothing is logged
 * but the call name. `fail = Some("rejected")` makes `exchange` fail like a revoked key.
 */
const makeConsole = (fail: Option.Option<"rejected">) =>
  Effect.sync(() => {
    const exchange = Effect.fn("GarminApi.console.exchange")(function* (
      _key: Redacted.Redacted<string>,
    ) {
      yield* Effect.log(`${CONSOLE} exchange`)
      if (Option.isSome(fail)) {
        return yield* failed("token_rejected", Option.some(401))
      }
      const now = yield* DateTime.now
      return {
        jwt: Redacted.make("console-garmin-jwt"),
        expiresAt: DateTime.add(now, FALLBACK_JWT_LIFETIME),
      }
    })
    const profile = Effect.fn("GarminApi.console.profile")(function* (
      _jwt: Redacted.Redacted<string>,
    ) {
      yield* Effect.log(`${CONSOLE} profile`)
      return { displayName: Option.some(Label.make("Console Garmin")) }
    })
    const activities = Effect.fn("GarminApi.console.activities")(function* (
      _jwt: Redacted.Redacted<string>,
      _window: GarminActivityWindow,
      start: number,
    ) {
      yield* Effect.log(`${CONSOLE} activities`)
      if (start > 0) {
        return { items: [], more: false }
      }
      const dayStart = DateTime.toEpochMillis(DateTime.startOf(yield* DateTime.now, "day"))
      const run = yield* ImportedActivityInsert.makeEffect({
        provider: "garmin",
        externalId: "console-run",
        sport: "running",
        title: Label.make("Morning run"),
        startedAt: DateTime.makeUnsafe(dayStart - DAY_MS + 6.5 * HOUR_MS),
        durationSeconds: 1800,
        distanceMeters: Option.some(5200),
        calories: Option.some(410),
        avgHeartRate: Option.some(152),
        maxHeartRate: Option.some(174),
      }).pipe(Effect.orDie)
      const strength = yield* ImportedActivityInsert.makeEffect({
        provider: "garmin",
        externalId: "console-strength",
        sport: "strength",
        title: Label.make("Strength"),
        startedAt: DateTime.makeUnsafe(dayStart - 2 * DAY_MS + 17.75 * HOUR_MS),
        durationSeconds: 3000,
        distanceMeters: Option.none(),
        calories: Option.some(280),
        avgHeartRate: Option.some(118),
        maxHeartRate: Option.some(151),
      }).pipe(Effect.orDie)
      return { items: [run, strength], more: false }
    })
    const daily = Effect.fn("GarminApi.console.daily")(function* (
      _jwt: Redacted.Redacted<string>,
      date: LocalDate,
    ) {
      yield* Effect.log(`${CONSOLE} daily`)
      const now = yield* DateTime.now
      const window = Arr.makeBy(CONSOLE_DAYS, (back) =>
        DateTime.formatIsoDateUtc(DateTime.subtract(now, { days: back })),
      )
      return window.includes(date)
        ? yield* consoleDay(date, Number(date.slice(8, 10)))
        : Option.none()
    })
    return { exchange, profile, activities, daily } satisfies GarminApiShape
  })

export class GarminApi extends Context.Service<GarminApi, GarminApiShape>()(
  "@tanren/worker/GarminApi",
) {
  /** Real Garmin through whatever `HttpClient` is provided (tests stub it). Needs `WorkerConfig`. */
  static readonly layerHttp = Layer.effect(this, makeHttp)
  /** `layerHttp` over the Workers `fetch`. Needs `WorkerConfig`. */
  static readonly layerLive = this.layerHttp.pipe(Layer.provide(FetchHttpClient.layer))
  /** Fixture data, no network; with `Some("rejected")` `exchange` fails like a revoked key. */
  static readonly layerConsoleWith = (fail: Option.Option<"rejected">) =>
    Layer.effect(this, makeConsole(fail))
  /** `layerConsoleWith(None)`: every call succeeds. */
  static readonly layerConsole = this.layerConsoleWith(Option.none())
  /** `GARMIN_MODE` picks the layer, like `StravaApi.layer`. Needs `WorkerConfig`. */
  static readonly layer = Layer.unwrap(
    Effect.gen(function* () {
      const config = yield* WorkerConfig
      return Match.value(config.garminMode).pipe(
        Match.when("console", () => GarminApi.layerConsoleWith(config.garminConsoleFail)),
        Match.when("provider", () => GarminApi.layerLive),
        Match.exhaustive,
      )
    }),
  )
}
