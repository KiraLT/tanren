import { SessionStoreUnavailable } from "@tanren/shared"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { BetterAuth } from "./BetterAuth"

/** The 503 every failed `/api/auth/*` call answers, with the shared error as the JSON body. */
const unavailable = (cause: unknown) =>
  Effect.logError("auth handler failed", cause).pipe(
    Effect.andThen(
      HttpServerResponse.schemaJson(SessionStoreUnavailable)(
        new SessionStoreUnavailable({ message: "session store unavailable" }),
        { status: 503 },
      ),
    ),
  )

/**
 * `/api/auth/*` → Better Auth's own Web handler. Merge into the app's router layer.
 * A rejected handler (D1 down) or a lazy instance that fails to build is an outage of the auth
 * service: 503 `SessionStoreUnavailable`, never a bare 500.
 */
export const authRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const betterAuth = yield* BetterAuth
    return HttpRouter.add("*", "/api/auth/*", (request) =>
      Effect.gen(function* () {
        const auth = yield* betterAuth.auth
        const webRequest = yield* HttpServerRequest.toWeb(request)
        const response = yield* Effect.tryPromise(() => auth.handler(webRequest))
        return HttpServerResponse.fromWeb(response)
      }).pipe(Effect.catch(unavailable), Effect.catchDefect(unavailable)),
    )
  }),
)
