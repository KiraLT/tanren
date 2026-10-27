import { UserTokens } from "@tanren/db"
import { NativeRateLimited, SessionStoreUnavailable, type UserId } from "@tanren/shared"
import { Context, Effect, Layer, Option } from "effect"
import { HttpEffect, HttpServerRequest, HttpServerResponse } from "effect/http"
import { HttpApiError, HttpApiMiddleware } from "effect/http-api"
import { makeLimiterWith } from "../auth/nativeAuthRoutes"
import { Sessions, type SessionsShape } from "../auth/Sessions"
import { bearerJwt } from "../auth/SessionsLive"
import { Tokens } from "../auth/Tokens"

/** The signed-in user of the current request; provided by `Authentication`. */
export class CurrentUser extends Context.Service<CurrentUser, { readonly userId: UserId }>()(
  "@tanren/worker/CurrentUser",
) {}

/** Methods that never write: they stay stateless (ADR-0022, 0 D1 reads for the identity). */
const READ_METHODS: ReadonlyArray<string> = ["GET", "HEAD", "OPTIONS"]

export const isWriteMethod = (method: string): boolean =>
  !READ_METHODS.includes(method.toUpperCase())

/**
 * SEC-1 B5: per user, per isolate, fixed 60 s windows (weak like every in-memory limiter here; the
 * upgrade is the Workers rate-limiting binding). `/sync/push` carries up to 500 changes per call;
 * the app pushes on every logged set, so 60/min is far above a real session.
 */
export const USER_RATE_LIMITS = {
  push: { max: 60, windowMs: 60_000 },
  write: { max: 120, windowMs: 60_000 },
} as const

/** `POST /sync/pull` is a read in a POST body: it stays unlimited like every GET. */
const UNLIMITED_WRITE_PATHS: ReadonlyArray<string> = ["/sync/pull"]

/** Which limiter bucket a request falls in; `None` = unlimited (reads). */
export const rateBucket = (
  method: string,
  url: string,
): Option.Option<keyof typeof USER_RATE_LIMITS> => {
  const path = url.split("?")[0] ?? url
  if (!isWriteMethod(method) || UNLIMITED_WRITE_PATHS.includes(path)) {
    return Option.none()
  }
  return Option.some(path === "/sync/push" ? "push" : "write")
}

/**
 * For a write: does the user row still exist? A token outlives an erased account by up to 15
 * minutes (app JWT, cookie cache), and the domain tables have no foreign key to `user`, so a push
 * would re-create rows under the erased id (STLS-F3). One primary-key read on `user`, which also
 * yields the app token generation an app JWT must still carry (STLS-F7).
 */
type UserRowCheck = (
  userId: UserId,
  headers: globalThis.Headers,
) => Effect.Effect<boolean, SessionStoreUnavailable>

type Limit = (key: string) => Effect.Effect<void, NativeRateLimited>

/** `no-store` on every authenticated response (SEC-1 G1): user data must never sit in a cache. */
const noStore = HttpEffect.appendPreResponseHandler((_request, response) =>
  Effect.succeed(HttpServerResponse.setHeader(response, "cache-control", "no-store")),
)

const make = (
  sessions: SessionsShape,
  writeAllowed: UserRowCheck,
  limits: Readonly<Record<keyof typeof USER_RATE_LIMITS, Limit>>,
) =>
  Authentication.of((httpEffect) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      yield* noStore
      const headers = new globalThis.Headers(request.headers)
      const userId = yield* sessions.current(headers)
      if (Option.isNone(userId)) {
        return yield* new HttpApiError.Unauthorized()
      }
      if (isWriteMethod(request.method) && !(yield* writeAllowed(userId.value, headers))) {
        return yield* new HttpApiError.Unauthorized()
      }
      const bucket = rateBucket(request.method, request.url)
      if (Option.isSome(bucket)) {
        yield* limits[bucket.value](`${bucket.value}:${userId.value}`).pipe(
          Effect.tapError(({ retryAfterSeconds }) =>
            HttpEffect.appendPreResponseHandler((_request, response) =>
              Effect.succeed(
                HttpServerResponse.setHeader(response, "retry-after", String(retryAfterSeconds)),
              ),
            ),
          ),
        )
      }
      return yield* Effect.provideService(httpEffect, CurrentUser, { userId: userId.value })
    }),
  )

const makeLimits = Effect.all({
  push: makeLimiterWith(USER_RATE_LIMITS.push),
  write: makeLimiterWith(USER_RATE_LIMITS.write),
})

/**
 * Resolves the session from the request headers; no session → 401, session store down → 503.
 * Writes (any method but GET/HEAD/OPTIONS) also need the `user` row: gone → 401, and pass the
 * per-user limiter: over → 429 `NativeRateLimited` + `Retry-After`. Every response is `no-store`.
 */
export class Authentication extends HttpApiMiddleware.Service<
  Authentication,
  { provides: CurrentUser; requires: never }
>()("@tanren/worker/Authentication", {
  error: [HttpApiError.Unauthorized, SessionStoreUnavailable, NativeRateLimited],
}) {
  /**
   * Production (`AuthMode` BetterAuth): writes check the user row through `UserTokens` and, for an
   * app JWT, that its `gen` is the row's `appTokenGen` (STLS-F7); mismatch → 401.
   */
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const sessions = yield* Sessions
      const users = yield* UserTokens
      const tokens = yield* Tokens
      const limits = yield* makeLimits
      // STLS-F7: an app JWT must still carry the user's current `appTokenGen`, so "sign out
      // everywhere" stops a stolen access token's writes at once. A Better Auth web session carries
      // no generation: its revocation point is the session row (sign-out deletes it), so a cookie
      // request keeps the plain row check. The bearer was verified by `Sessions` a moment ago; the
      // second HMAC verify here reads its `gen` without widening the `Sessions` port.
      const genMatches = (userId: UserId, headers: globalThis.Headers, app: number) =>
        Option.match(bearerJwt(headers), {
          onNone: () => Effect.succeed(true),
          onSome: (token) =>
            tokens.verifyApp(token).pipe(
              Effect.map((identity) => identity.userId === userId && identity.gen === app),
              Effect.catchTag("TokenRejected", () => Effect.succeed(false)),
            ),
        })
      return make(
        sessions,
        (userId, headers) =>
          users.tokenGens(userId).pipe(
            Effect.flatMap((gens) => genMatches(userId, headers, gens.app)),
            Effect.catchTags({
              UserNotFound: () => Effect.succeed(false),
              PersistenceError: (error) =>
                Effect.logError("user row check failed", error).pipe(
                  Effect.andThen(
                    Effect.fail(
                      new SessionStoreUnavailable({ message: "session store unavailable" }),
                    ),
                  ),
                ),
            }),
          ),
        limits,
      )
    }),
  )

  /** `AuthMode` Fixed (tests): a fixed identity is not a `user` row, so writes are not checked. */
  static readonly layerFixed = Layer.effect(
    this,
    Effect.gen(function* () {
      const sessions = yield* Sessions
      const limits = yield* makeLimits
      return make(sessions, () => Effect.succeed(true), limits)
    }),
  )
}
