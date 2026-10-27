import { AccountErasure } from "@tanren/db"
import { Array as Arr, Effect } from "effect"
import { HttpEffect, HttpServerResponse } from "effect/http"
import { HttpApiBuilder, HttpApiError } from "effect/http-api"
import { Api } from "./Api"
import { CurrentUser } from "./Authentication"

/**
 * Better Auth's cookies (`better-auth/dist/cookies` `getCookies`, 1.7.11): `session_token`, the
 * 15-minute `session_data` cache (ADR-0022) and `dont_remember`, each `Path=/; HttpOnly;
 * SameSite=Lax`, host-only (no `crossSubDomainCookies`), with the `__Secure-` prefix + `Secure`
 * when the base URL is https. Both spellings are expired: a browser ignores the one it does not hold.
 */
const AUTH_COOKIES = Arr.flatMap(["session_token", "session_data", "dont_remember"], (name) => [
  { name: `better-auth.${name}`, secure: false },
  { name: `__Secure-better-auth.${name}`, secure: true },
])

/** `no-store` plus an expired Set-Cookie per auth cookie. The names are constants: a failure is a defect. */
const signedOutResponse = (response: HttpServerResponse.HttpServerResponse) =>
  Effect.reduce(
    AUTH_COOKIES,
    () => HttpServerResponse.setHeader(response, "cache-control", "no-store"),
    (current, cookie) =>
      HttpServerResponse.expireCookie(cookie.name, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: cookie.secure,
      })(current),
  ).pipe(Effect.orDie)

/**
 * `POST /api/account/delete`: erase every row of the caller in one D1 batch, then end the
 * browser session by expiring Better Auth's cookies on the response. `PersistenceError` → 500.
 */
export const AccountLive = HttpApiBuilder.group(
  Api,
  "account",
  Effect.fn(function* (handlers) {
    const erasure = yield* AccountErasure
    return handlers.handle("delete", () =>
      Effect.gen(function* () {
        const { userId } = yield* CurrentUser
        yield* erasure.deleteUser(userId)
        yield* HttpEffect.appendPreResponseHandler((_request, response) =>
          signedOutResponse(response),
        )
        yield* Effect.logInfo("account erased", { userId })
        return { deleted: true } as const
      }).pipe(
        Effect.catchTag("PersistenceError", (error) =>
          Effect.logError("account erasure failed", error).pipe(
            Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
          ),
        ),
      ),
    )
  }),
)
