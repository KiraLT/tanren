import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { BetterAuth } from "./BetterAuth"

/** `/api/auth/*` → Better Auth's own Web handler. Merge into the app's router layer. */
export const authRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const { auth } = yield* BetterAuth
    return HttpRouter.add("*", "/api/auth/*", (request) =>
      Effect.gen(function* () {
        const webRequest = yield* HttpServerRequest.toWeb(request)
        const response = yield* Effect.promise(() => auth.handler(webRequest))
        return HttpServerResponse.fromWeb(response)
      }),
    )
  }),
)
