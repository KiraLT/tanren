import { AccountErasure, IntegrationRepo } from "@tanren/db"
import type { UserId } from "@tanren/shared"
import { Array as Arr, Effect, Option } from "effect"
import { HttpEffect, HttpServerResponse } from "effect/http"
import { HttpApiBuilder, HttpApiError } from "effect/http-api"
import { StravaApi } from "../integrations/StravaApi"
import { SealedToken, TokenSeal } from "../integrations/TokenSeal"
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
 * SEC-1 B4: revoke the Strava grant before the row goes, like `DELETE /integrations/strava`. Best
 * effort: a dead token, a Strava outage or a storage read failure only logs, never blocks erasure.
 * Garmin has nothing to revoke: the personal API key is the owner's own (ADR-0023), and erasure
 * drops its sealed copy with the row.
 */
const revokeStrava = Effect.fn("AccountLive.revokeStrava")(
  function* (
    integrations: IntegrationRepo["Service"],
    strava: StravaApi["Service"],
    seal: TokenSeal["Service"],
    userId: UserId,
  ) {
    const row = yield* integrations.get(userId, "strava")
    if (Option.isNone(row)) {
      return
    }
    // Same `v1.<iv>.<ct>` string under the db column's brand and TokenSeal's brand.
    const access = yield* seal.open(SealedToken.make(row.value.accessToken), {
      userId,
      provider: "strava",
      slot: "access",
    })
    yield* strava.revoke(access)
  },
  Effect.catch((error) =>
    Effect.logWarning(`[strava] revoke before erasure failed tag=${error._tag}`),
  ),
)

/**
 * `POST /api/account/delete`: revoke Strava (best effort), erase every row of the caller in one D1 batch, then end the
 * browser session by expiring Better Auth's cookies on the response. `PersistenceError` → 500.
 */
export const AccountLive = HttpApiBuilder.group(
  Api,
  "account",
  Effect.fn(function* (handlers) {
    const erasure = yield* AccountErasure
    const integrations = yield* IntegrationRepo
    const strava = yield* StravaApi
    const seal = yield* TokenSeal
    return handlers.handle("delete", () =>
      Effect.gen(function* () {
        const { userId } = yield* CurrentUser
        yield* revokeStrava(integrations, strava, seal, userId)
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
