import { EmailDeliveryFailed, InternalError, SessionStoreUnavailable } from "@tanren/shared"
import { Data, Effect, Layer, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { BetterAuth } from "./BetterAuth"
import { EmailSendFailed } from "./Email"
import { nativeAuthRoutes } from "./nativeAuthRoutes"

/** Internal: the auth service or its store could not answer (D1 down, instance failed to build). */
class AuthStoreFailed extends Data.TaggedError("AuthStoreFailed")<{ readonly cause: unknown }> {}

const isEmailSendFailed = Schema.is(EmailSendFailed)

/**
 * `bearer()` copies the session token into `set-auth-token` (and exposes it to CORS) on every
 * cookie-setting response, which would hand the web app's JavaScript the token its httpOnly cookie
 * hides. Native clients get their token only from `POST /api/native/session`, so it is dropped.
 */
export const withoutAuthToken = (
  response: HttpServerResponse.HttpServerResponse,
): HttpServerResponse.HttpServerResponse => {
  const stripped = HttpServerResponse.removeHeader(response, "set-auth-token")
  const exposed = (response.headers["access-control-expose-headers"] ?? "")
    .split(",")
    .map((header) => header.trim())
    .filter((header) => header.length > 0 && header.toLowerCase() !== "set-auth-token")
  return exposed.length === 0
    ? HttpServerResponse.removeHeader(stripped, "access-control-expose-headers")
    : HttpServerResponse.setHeader(stripped, "access-control-expose-headers", exposed.join(", "))
}

/** 503: the session store or auth service is down. */
const unavailable = (cause: unknown) =>
  Effect.logError("auth handler failed", cause).pipe(
    Effect.andThen(
      HttpServerResponse.schemaJson(SessionStoreUnavailable)(
        new SessionStoreUnavailable({ message: "session store unavailable" }),
        { status: 503 },
      ),
    ),
  )

/** 502: the email provider refused the magic link. The body names only provider and reason. */
const deliveryFailed = (error: EmailSendFailed) =>
  Effect.logError("magic link email failed", error.message).pipe(
    Effect.andThen(
      HttpServerResponse.schemaJson(EmailDeliveryFailed)(
        new EmailDeliveryFailed({ provider: error.provider, reason: error.reason }),
        { status: 502 },
      ),
    ),
  )

/** 500: a bug. The cause (stack included) goes to the log; the body is a bare `InternalError`. */
const internal = (defect: unknown) =>
  Effect.logError("auth handler defect", defect).pipe(
    Effect.andThen(
      HttpServerResponse.schemaJson(InternalError)(new InternalError({}), { status: 500 }),
    ),
  )

/**
 * `/api/auth/*` → Better Auth's own Web handler. Merge into the app's router layer.
 * A rejected handler (D1 down), a lazy instance that fails to build or a request that cannot be
 * converted is an auth outage: 503 `SessionStoreUnavailable`. A rejected magic-link send (Better
 * Auth must run with `onAPIError.throw` for it to reach here) is 502 `EmailDeliveryFailed`. Any
 * other defect is 500 `InternalError`.
 */
const betterAuthMount = Layer.unwrap(
  Effect.gen(function* () {
    const betterAuth = yield* BetterAuth
    return HttpRouter.add("*", "/api/auth/*", (request) =>
      Effect.gen(function* () {
        const auth = yield* betterAuth.auth.pipe(
          Effect.catchDefect((cause) => Effect.fail(new AuthStoreFailed({ cause }))),
        )
        const webRequest = yield* HttpServerRequest.toWeb(request)
        const response = yield* Effect.tryPromise({
          try: () => auth.handler(webRequest),
          catch: (cause) => (isEmailSendFailed(cause) ? cause : new AuthStoreFailed({ cause })),
        })
        return withoutAuthToken(HttpServerResponse.fromWeb(response))
      }).pipe(
        Effect.catchTag("EmailSendFailed", deliveryFailed),
        Effect.catch(unavailable),
        Effect.catchDefect(internal),
      ),
    )
  }),
)

/**
 * Every auth route: the Better Auth mount plus native sign-in (`/auth/native/complete`,
 * `/api/native/session`), so `app.ts` and `index.ts` wire one layer.
 */
export const authRoutes = Layer.mergeAll(betterAuthMount, nativeAuthRoutes)
