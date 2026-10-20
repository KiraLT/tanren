import type { UserId } from "@tanren/shared"
import { Context, Effect, Layer, Option } from "effect"
import { HttpServerRequest } from "effect/http"
import { HttpApiError, HttpApiMiddleware } from "effect/http-api"
import { SessionStoreUnavailable, Sessions } from "../auth/Sessions"

/** The signed-in user of the current request; provided by `Authentication`. */
export class CurrentUser extends Context.Service<CurrentUser, { readonly userId: UserId }>()(
  "@tanren/worker/CurrentUser",
) {}

/** Resolves the session from the request headers; no session → 401, session store down → 503. */
export class Authentication extends HttpApiMiddleware.Service<
  Authentication,
  { provides: CurrentUser; requires: never }
>()("@tanren/worker/Authentication", {
  error: [HttpApiError.Unauthorized, SessionStoreUnavailable],
}) {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const sessions = yield* Sessions
      return Authentication.of((httpEffect) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const userId = yield* sessions.current(new globalThis.Headers(request.headers))
          if (Option.isNone(userId)) {
            return yield* new HttpApiError.Unauthorized()
          }
          return yield* Effect.provideService(httpEffect, CurrentUser, { userId: userId.value })
        }),
      )
    }),
  )
}
