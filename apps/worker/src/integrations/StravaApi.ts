import { type ExportFailureReason, Label, type SessionId, type Timestamp } from "@tanren/shared"
import { Context, Data, DateTime, Effect, Layer, Match, Option, Redacted, Schema } from "effect"
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  type HttpClientResponse,
} from "effect/http"
import { WorkerConfig } from "../Config"

/**
 * The only Strava endpoints Tanren calls (research 2026-10-26 §1-2). Tanren never reads anything
 * else from Strava (API Policy 5.3): no activity, no feed, no athlete lookup beyond the token grant.
 */
export const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
export const STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/activities"
export const STRAVA_REVOKE_URL = "https://www.strava.com/oauth/revoke"
export const STRAVA_USER_AGENT = "tanren/1"

/**
 * One Strava call failed. Internal (the export queue maps it to `ExportFailureReason` and a retry
 * decision); never carries the provider's response text, a token, a code or a secret.
 */
export class StravaRequestFailed extends Data.TaggedError("StravaRequestFailed")<{
  readonly reason: ExportFailureReason
  readonly status: Option.Option<number>
}> {}

/** The result of `exchangeCode`: both tokens, the athlete to show in Settings, the granted scope. */
export interface TokenGrant {
  readonly accessToken: Redacted.Redacted<string>
  readonly refreshToken: Redacted.Redacted<string>
  readonly expiresAt: Timestamp
  /**
   * Comma-separated scopes as the token response reports them; `""` when Strava omits the field
   * (it documents `scope` on the redirect). The callback's `scope` query parameter is the source.
   */
  readonly scope: string
  readonly athlete: { readonly id: string; readonly displayName: Label }
}

/**
 * The result of `refresh`: Strava answers a refresh with tokens only (no athlete, no scope), and
 * the refresh token rotates: persist both before using the access token (design §7).
 */
export type RefreshedTokens = Pick<TokenGrant, "accessToken" | "refreshToken" | "expiresAt">

export interface NewActivity {
  readonly sessionId: SessionId
  readonly name: string
  readonly sportType: "WeightTraining"
  readonly trainer: true
  /** `YYYY-MM-DDTHH:mm:ss` in the athlete's timezone (design §6). */
  readonly startDateLocal: string
  /** Seconds. */
  readonly elapsedTime: number
  readonly description: string
}

export interface StravaApiShape {
  readonly exchangeCode: (code: string) => Effect.Effect<TokenGrant, StravaRequestFailed>
  readonly refresh: (
    refreshToken: Redacted.Redacted<string>,
  ) => Effect.Effect<RefreshedTokens, StravaRequestFailed>
  readonly createActivity: (
    accessToken: Redacted.Redacted<string>,
    activity: NewActivity,
  ) => Effect.Effect<{ readonly id: string }, StravaRequestFailed>
  readonly revoke: (
    accessToken: Redacted.Redacted<string>,
  ) => Effect.Effect<void, StravaRequestFailed>
}

/**
 * Strava answers 401 for a dead token, 429 over the rate limit; other 4xx are the caller's fault.
 * An inactive app (403, or a 4xx whose body says so) becomes `app_inactive` in `failureOf`.
 */
const reasonForStatus = (status: number): ExportFailureReason =>
  status === 401
    ? "unauthorized"
    : status === 429
      ? "rate_limited"
      : status >= 400 && status < 500
        ? "rejected"
        : "provider_error"

const failed = (reason: ExportFailureReason, status: Option.Option<number>) =>
  new StravaRequestFailed({ reason, status })

/**
 * A 4xx body that says the Strava app is switched off (the developer subscription lapsed). The exact
 * status and body are unverified (research 2026-10-26 "Subscription lapse"), so 403 is always
 * treated as inactive and any other 4xx (not 401/429) only when the text matches.
 */
const INACTIVE_BODY = /inactive/i
const LOGGED_BODY_CHARS = 500
/** The longest one Strava request (or its body) may take; past it the attempt is `transport`. */
export const STRAVA_REQUEST_TIMEOUT = "10 seconds"

/** The one log line for an inactive app. Only Strava's response goes in: never a request header. */
const logApplicationRefused = (status: number, body: string) =>
  Effect.logWarning(
    `[strava] application refused status=${status} body=${body.slice(0, LOGGED_BODY_CHARS)}`,
  )

/** Maps a non-2xx response to `StravaRequestFailed`; reads the body only for the ambiguous 4xx. */
const failureOf = (response: HttpClientResponse.HttpClientResponse) => {
  const status = response.status
  const plain = failed(reasonForStatus(status), Option.some(status))
  if (status < 400 || status >= 500 || status === 401 || status === 429) {
    return Effect.fail(plain)
  }
  return response.text.pipe(
    Effect.timeout(STRAVA_REQUEST_TIMEOUT),
    Effect.orElseSucceed(() => ""),
    Effect.flatMap((body) =>
      status === 403 || INACTIVE_BODY.test(body)
        ? logApplicationRefused(status, body).pipe(
            Effect.andThen(Effect.fail(failed("app_inactive", Option.some(status)))),
          )
        : Effect.fail(plain),
    ),
  )
}

const TokenResponse = Schema.Struct({
  access_token: Schema.NonEmptyString,
  refresh_token: Schema.NonEmptyString,
  expires_at: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
  scope: Schema.optionalKey(Schema.String),
  athlete: Schema.optionalKey(
    Schema.Struct({
      id: Schema.Number.check(Schema.isInt()),
      firstname: Schema.optionalKey(Schema.NullOr(Schema.String)),
      lastname: Schema.optionalKey(Schema.NullOr(Schema.String)),
    }),
  ),
})

const ActivityResponse = Schema.Struct({ id: Schema.Number.check(Schema.isInt()) })

const FALLBACK_NAME = Label.make("Strava athlete")

/** First and last name as a `Label` (trimmed, 1-80); a name that does not fit falls back. */
const displayNameOf = (athlete: {
  readonly firstname?: string | null
  readonly lastname?: string | null
}) =>
  Option.getOrElse(
    Schema.decodeUnknownOption(Label)(
      `${athlete.firstname ?? ""} ${athlete.lastname ?? ""}`.trim().slice(0, 80).trim(),
    ),
    () => FALLBACK_NAME,
  )

const toTimestamp = (epochSeconds: number): Option.Option<Timestamp> =>
  DateTime.make(epochSeconds * 1000)

/**
 * Real Strava over an `HttpClient` (form-encoded bodies, `User-Agent: tanren/1`). `layerLive`
 * supplies the Workers `fetch` client; tests supply a stub `HttpClient`.
 */
const makeHttp = Effect.gen(function* () {
  const config = yield* WorkerConfig
  const client = yield* HttpClient.HttpClient
  const clientId = config.stravaClientId
  // `WorkerConfig` refuses `STRAVA_MODE=provider` without a secret, so None here is a wiring bug.
  const clientSecret = yield* Option.match(config.stravaClientSecret, {
    onNone: () => Effect.die("STRAVA_CLIENT_SECRET is not configured"),
    onSome: Effect.succeed,
  })

  const base = (url: string) =>
    HttpClientRequest.post(url).pipe(
      HttpClientRequest.setHeader("user-agent", STRAVA_USER_AGENT),
      HttpClientRequest.acceptJson,
    )

  /** Runs a request; a non-2xx status becomes `StravaRequestFailed`, a lost connection `transport`. */
  const send = (request: HttpClientRequest.HttpClientRequest) =>
    client.execute(request).pipe(
      // Bounded: the export runs each attempt uninterruptibly, so a hung request must end itself.
      Effect.timeout(STRAVA_REQUEST_TIMEOUT),
      Effect.mapError(() => failed("transport", Option.none())),
      Effect.flatMap((response) =>
        response.status >= 200 && response.status < 300
          ? Effect.succeed(response)
          : failureOf(response),
      ),
    )

  /** Decodes the JSON body; a body that does not match the schema is the provider's fault. */
  const decodeJson = <S extends Schema.Decoder<unknown>>(
    schema: S,
    response: HttpClientResponse.HttpClientResponse,
  ) =>
    response.json.pipe(
      Effect.timeout(STRAVA_REQUEST_TIMEOUT),
      Effect.mapError(() => failed("provider_error", Option.some(response.status))),
      Effect.flatMap((body) =>
        Schema.decodeUnknownEffect(schema)(body).pipe(
          Effect.mapError(() => failed("provider_error", Option.some(response.status))),
        ),
      ),
    )

  const toGrant = (
    body: typeof TokenResponse.Type,
    status: number,
  ): Effect.Effect<RefreshedTokens, StravaRequestFailed> =>
    Option.match(toTimestamp(body.expires_at), {
      onNone: () => Effect.fail(failed("provider_error", Option.some(status))),
      onSome: (expiresAt) =>
        Effect.succeed({
          accessToken: Redacted.make(body.access_token),
          refreshToken: Redacted.make(body.refresh_token),
          expiresAt,
        }),
    })

  const tokenRequest = (fields: Readonly<Record<string, string>>) =>
    base(STRAVA_TOKEN_URL).pipe(
      HttpClientRequest.bodyUrlParams({
        client_id: clientId,
        client_secret: Redacted.value(clientSecret),
        ...fields,
      }),
    )

  const exchangeCode = Effect.fn("StravaApi.exchangeCode")(function* (code: string) {
    const response = yield* send(tokenRequest({ grant_type: "authorization_code", code }))
    const body = yield* decodeJson(TokenResponse, response)
    const { accessToken, refreshToken, expiresAt } = yield* toGrant(body, response.status)
    // The exchange response names the athlete; a response without one is not a usable grant.
    if (body.athlete === undefined) {
      return yield* failed("provider_error", Option.some(response.status))
    }
    return {
      accessToken,
      refreshToken,
      expiresAt,
      scope: body.scope ?? "",
      athlete: { id: String(body.athlete.id), displayName: displayNameOf(body.athlete) },
    } satisfies TokenGrant
  })

  const refresh = Effect.fn("StravaApi.refresh")(function* (
    refreshToken: Redacted.Redacted<string>,
  ) {
    const response = yield* send(
      tokenRequest({ grant_type: "refresh_token", refresh_token: Redacted.value(refreshToken) }),
    )
    const body = yield* decodeJson(TokenResponse, response)
    const { accessToken, refreshToken: rotated, expiresAt } = yield* toGrant(body, response.status)
    return { accessToken, refreshToken: rotated, expiresAt } satisfies RefreshedTokens
  })

  const createActivity = Effect.fn("StravaApi.createActivity")(function* (
    accessToken: Redacted.Redacted<string>,
    activity: NewActivity,
  ) {
    const response = yield* send(
      base(STRAVA_ACTIVITIES_URL).pipe(
        HttpClientRequest.bearerToken(accessToken),
        HttpClientRequest.bodyUrlParams({
          name: activity.name,
          sport_type: activity.sportType,
          start_date_local: activity.startDateLocal,
          elapsed_time: String(activity.elapsedTime),
          description: activity.description,
          trainer: "1",
        }),
      ),
    )
    const body = yield* decodeJson(ActivityResponse, response)
    return { id: String(body.id) }
  })

  const revoke = Effect.fn("StravaApi.revoke")(function* (accessToken: Redacted.Redacted<string>) {
    yield* send(
      base(STRAVA_REVOKE_URL).pipe(
        HttpClientRequest.basicAuth(clientId, clientSecret),
        HttpClientRequest.bodyUrlParams({ token: Redacted.value(accessToken) }),
      ),
    )
  })

  return { exchangeCode, refresh, createActivity, revoke } satisfies StravaApiShape
})

const CONSOLE = "[strava:console]"
const CONSOLE_TOKEN_LIFETIME = { hours: 6 } as const
const CONSOLE_INACTIVE_STATUS = 403
const CONSOLE_INACTIVE_BODY = '{"message":"Application is inactive (console simulation)"}'

/**
 * `STRAVA_MODE=console`: no network. Console mode is also what production runs until the owner has
 * a Strava app; connect/callback refuse it outside local. Logs what it would do, without any token or
 * code, and answers with fake tokens that expire in six hours like Strava's.
 */
const makeConsole = (fail: Option.Option<"inactive">) =>
  Effect.sync(() => {
    const grant = Effect.map(DateTime.now, (now) => ({
      accessToken: Redacted.make("console-access-token"),
      refreshToken: Redacted.make("console-refresh-token"),
      expiresAt: DateTime.add(now, CONSOLE_TOKEN_LIFETIME),
    }))
    const exchangeCode = Effect.fn("StravaApi.console.exchangeCode")(function* (_code: string) {
      yield* Effect.log(`${CONSOLE} exchange code`)
      return {
        ...(yield* grant),
        scope: "read,activity:write",
        athlete: { id: "console-athlete", displayName: Label.make("Console Athlete") },
      } satisfies TokenGrant
    })
    const refresh = Effect.fn("StravaApi.console.refresh")(function* (
      _refreshToken: Redacted.Redacted<string>,
    ) {
      yield* Effect.log(`${CONSOLE} refresh tokens`)
      return yield* grant
    })
    const createActivity = Effect.fn("StravaApi.console.createActivity")(function* (
      _accessToken: Redacted.Redacted<string>,
      activity: NewActivity,
    ) {
      yield* Effect.log(
        `${CONSOLE} create activity ${activity.name} ${activity.startDateLocal} ${activity.elapsedTime}s`,
      )
      // `STRAVA_CONSOLE_FAIL=inactive`: behave like a Strava app whose subscription lapsed.
      if (Option.isSome(fail)) {
        yield* logApplicationRefused(CONSOLE_INACTIVE_STATUS, CONSOLE_INACTIVE_BODY)
        return yield* failed("app_inactive", Option.some(CONSOLE_INACTIVE_STATUS))
      }
      return { id: `console-${activity.sessionId.slice(0, 8)}` }
    })
    const revoke = Effect.fn("StravaApi.console.revoke")(function* (
      _accessToken: Redacted.Redacted<string>,
    ) {
      yield* Effect.log(`${CONSOLE} revoke`)
    })
    return { exchangeCode, refresh, createActivity, revoke } satisfies StravaApiShape
  })

export class StravaApi extends Context.Service<StravaApi, StravaApiShape>()(
  "@tanren/worker/StravaApi",
) {
  /** Real Strava through whatever `HttpClient` is provided (tests stub it). */
  static readonly layerHttp = Layer.effect(this, makeHttp)
  /** `layerHttp` over the Workers `fetch`. Needs `WorkerConfig`. */
  static readonly layerLive = this.layerHttp.pipe(Layer.provide(FetchHttpClient.layer))
  /**
   * Logs instead of calling Strava. Console mode is also what production runs until the owner has
   * a Strava app; connect/callback refuse it outside local. With
   * `Some("inactive")` `createActivity` fails like an inactive Strava app.
   */
  static readonly layerConsoleWith = (fail: Option.Option<"inactive">) =>
    Layer.effect(this, makeConsole(fail))
  /** `layerConsoleWith(None)`: every call succeeds. */
  static readonly layerConsole = this.layerConsoleWith(Option.none())
  /** `STRAVA_MODE` picks the layer, like `EmailSender.layer`. Needs `WorkerConfig`. */
  static readonly layer = Layer.unwrap(
    Effect.gen(function* () {
      const config = yield* WorkerConfig
      return Match.value(config.stravaMode).pipe(
        Match.when("console", () => StravaApi.layerConsoleWith(config.stravaConsoleFail)),
        Match.when("provider", () => StravaApi.layerLive),
        Match.exhaustive,
      )
    }),
  )
}
