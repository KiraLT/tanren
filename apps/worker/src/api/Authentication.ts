import { UserTokens } from "@tanren/db"
import { SessionStoreUnavailable, type UserId } from "@tanren/shared"
import { Context, Effect, Layer, Option } from "effect"
import { HttpServerRequest } from "effect/http"
import { HttpApiError, HttpApiMiddleware } from "effect/http-api"
import { Sessions, type SessionsShape } from "../auth/Sessions"

/** The signed-in user of the current request; provided by `Authentication`. */
export class CurrentUser extends Context.Service<CurrentUser, { readonly userId: UserId }>()(
  "@tanren/worker/CurrentUser",
) {}

/** Methods that never write: they stay stateless (ADR-0022, 0 D1 reads for the identity). */
const READ_METHODS: ReadonlyArray<string> = ["GET", "HEAD", "OPTIONS"]

export const isWriteMethod = (method: string): boolean =>
  !READ_METHODS.includes(method.toUpperCase())

/**
 * For a write: does the user row still exist? A token outlives an erased account by up to 15
 * minutes (app JWT, cookie cache), and the domain tables have no foreign key to `user`, so a push
 * would re-create rows under the erased id (STLS-F3). One primary-key read on `user`.
 */
type UserRowCheck = (userId: UserId) => Effect.Effect<boolean, SessionStoreUnavailable>

const make = (sessions: SessionsShape, userRowExists: UserRowCheck) =>
  Authentication.of((httpEffect) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const userId = yield* sessions.current(new globalThis.Headers(request.headers))
      if (Option.isNone(userId)) {
        return yield* new HttpApiError.Unauthorized()
      }
      if (isWriteMethod(request.method) && !(yield* userRowExists(userId.value))) {
        return yield* new HttpApiError.Unauthorized()
      }
      return yield* Effect.provideService(httpEffect, CurrentUser, { userId: userId.value })
    }),
  )

/**
 * Resolves the session from the request headers; no session → 401, session store down → 503.
 * Writes (any method but GET/HEAD/OPTIONS) also need the `user` row: gone → 401.
 */
export class Authentication extends HttpApiMiddleware.Service<
  Authentication,
  { provides: CurrentUser; requires: never }
>()("@tanren/worker/Authentication", {
  error: [HttpApiError.Unauthorized, SessionStoreUnavailable],
}) {
  /** Production (`AuthMode` BetterAuth): writes check the user row through `UserTokens`. */
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const sessions = yield* Sessions
      const users = yield* UserTokens
      return make(sessions, (userId) =>
        users.tokenGens(userId).pipe(
          Effect.as(true),
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
      )
    }),
  )

  /** `AuthMode` Fixed (tests): a fixed identity is not a `user` row, so writes are not checked. */
  static readonly layerFixed = Layer.effect(
    this,
    Effect.gen(function* () {
      const sessions = yield* Sessions
      return make(sessions, () => Effect.succeed(true))
    }),
  )
}
