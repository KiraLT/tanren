import { SealedToken as DbSealedToken, IntegrationRepo, UserTokens } from "@tanren/db"
import { IdGenerator, type NativeRateLimited, type UserId } from "@tanren/shared"
import { DateTime, Effect, Layer, Option } from "effect"
import { HttpRouter, type HttpServerRequest, HttpServerResponse } from "effect/http"
import { clientIp, makeLimiter } from "../auth/nativeAuthRoutes"
import { WorkerConfig } from "../Config"
import { escapeHtml } from "../oauth/pages"
import {
  CONNECT_COOKIE,
  checkBinding,
  isConsoleOutsideLocal,
  STRAVA_CALLBACK_PATH,
  StateRejected,
  verifyState,
} from "./connect"
import { isNativeReturnTo } from "./returnTo"
import { StravaApi } from "./StravaApi"
import { TokenSeal } from "./TokenSeal"

/** Every callback answer: never cached, never sent on as a Referer (design §4, token exposure). */
const SECURE_HEADERS = { "cache-control": "no-store", "referrer-policy": "no-referrer" } as const

const page = (
  status: number,
  title: string,
  body: string,
  extraHeaders: Readonly<Record<string, string>> = {},
) =>
  HttpServerResponse.text(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)} · Tanren</title>
<style>
body{font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#1a1a1a;background:#fafafa}
a.button,button{display:block;width:100%;box-sizing:border-box;text-align:center;padding:1rem;font:inherit;font-size:1.25rem;background:#1a1a1a;color:#fff;border:0;border-radius:.75rem;text-decoration:none;margin-top:1.5rem;cursor:pointer}
button.secondary{background:transparent;color:#1a1a1a;border:1px solid #1a1a1a;margin-top:.75rem}
</style>
</head>
<body>
${body}
</body>
</html>`,
    {
      status,
      contentType: "text/html; charset=utf-8",
      headers: { ...SECURE_HEADERS, ...extraHeaders },
    },
  )

/**
 * SEC-1c: a native state has no binding cookie, so before the code is spent the browser shows
 * whose Tanren account Strava would be attached to. Continue / Cancel POST the same fields back to
 * the callback; never framed (a click-jacked Continue would defeat the check).
 */
const confirmPage = (
  email: string,
  fields: { readonly [K in "state" | "code" | "scope"]: string },
) =>
  page(
    200,
    "Connect Strava",
    `<h1>Connect Strava to Tanren</h1>
<p>Strava will be connected to the Tanren account <strong>${escapeHtml(email)}</strong>.</p>
<p>If this is not your account, cancel.</p>
<form method="post" action="${STRAVA_CALLBACK_PATH}">
<input type="hidden" name="state" value="${escapeHtml(fields.state)}">
<input type="hidden" name="code" value="${escapeHtml(fields.code)}">
<input type="hidden" name="scope" value="${escapeHtml(fields.scope)}">
<button type="submit" name="decision" value="continue">Continue</button>
<button type="submit" name="decision" value="cancel" class="secondary">Cancel</button>
</form>`,
    { "content-security-policy": "frame-ancestors 'none'", "x-frame-options": "DENY" },
  )

/** 400, no redirect: a bad, tampered or expired state sends the browser nowhere. */
export const expiredPage = page(
  400,
  "Link expired",
  "<h1>Link expired</h1><p>This link has expired. Start again from Settings.</p>",
)

/** 400: Strava runs in console mode outside local (no Strava app yet); nothing is stored. */
export const notConnectedPage = page(
  400,
  "Strava not connected",
  "<h1>Strava is not connected yet</h1><p>Strava is not available on this server yet.</p>",
)

/**
 * 400, nothing stored: the state was minted for a web browser whose `CONNECT_COOKIE` this request
 * does not carry, i.e. someone else's connect link (forced connect, SEC-1 B1) or another browser.
 */
export const otherBrowserPage = page(
  400,
  "Start again",
  "<h1>Start again from Settings</h1><p>This Strava link was started in another browser. Open Settings → Integrations here and connect again.</p>",
)

/** The binding cookie is single-use: expired on every outcome that consumed a verified state. */
const clearBinding = (response: HttpServerResponse.HttpServerResponse) =>
  HttpServerResponse.expireCookie(CONNECT_COOKIE, {
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "lax",
  })(response).pipe(Effect.orDie)

const rateLimitedPage = (error: NativeRateLimited) =>
  Effect.succeed(
    HttpServerResponse.text("Too many requests. Try again in a minute.", {
      status: 429,
      headers: { ...SECURE_HEADERS, "retry-after": String(error.retryAfterSeconds) },
    }),
  )

export type CallbackOutcome = "connected" | "denied" | "scope" | "provider"

/**
 * Back to the app: `http(s)` → 303 to `returnTo?<query>`; `exp(s)://` → a 200 page with one escaped
 * link (Safari does not follow a 303 into Expo Go reliably, and a tap confirms the hand-off).
 */
const back = (returnTo: string, outcome: CallbackOutcome) => {
  const target = `${returnTo}?${outcome === "connected" ? "connected=strava" : `error=${outcome}`}`
  if (!isNativeReturnTo(returnTo)) {
    return HttpServerResponse.redirect(target, { status: 303, headers: SECURE_HEADERS })
  }
  return outcome === "connected"
    ? page(
        200,
        "Connected to Strava",
        `<h1>Connected to Strava</h1><p>Your workouts will be sent to Strava.</p>
<a class="button" href="${escapeHtml(target)}">Open Tanren</a>`,
      )
    : page(
        200,
        "Strava not connected",
        `<h1>Strava not connected</h1><p>Nothing was connected.</p>
<a class="button" href="${escapeHtml(target)}">Open Tanren</a>`,
      )
}

/** The only log line: user and outcome. Never the code, a token or the state. */
const logOutcome = (userId: UserId, outcome: CallbackOutcome) =>
  Effect.logInfo(`[strava] callback userId=${userId} outcome=${outcome}`)

/**
 * `GET /integrations/strava/callback` (design §4). Identity comes only from the signed `state`:
 * cookies and `Authorization` are never read. Order: rate limit → state (signature, expiry,
 * returnTo) → provider `error` → `activity:write` in `scope` → the state's user still exists →
 * exchange the code once → seal → upsert → back to `returnTo`. A native (unbound) state stops the
 * GET at `confirmPage`; its `POST` (same path, same limiter) re-runs every check and exchanges.
 */
export const callbackRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* WorkerConfig
    const strava = yield* StravaApi
    const seal = yield* TokenSeal
    const integrations = yield* IntegrationRepo
    const tokens = yield* UserTokens
    const ids = yield* IdGenerator
    const limit = yield* makeLimiter

    /** GET: Strava's redirect (query). POST: the native interstitial's form (urlencoded body). */
    const fieldsOf = (request: HttpServerRequest.HttpServerRequest) =>
      request.method === "POST"
        ? request.text.pipe(
            Effect.map((body) => new URLSearchParams(body)),
            // An unreadable body has no valid state: the same 400 as a tampered one.
            Effect.mapError(() => new StateRejected({ reason: "malformed" })),
          )
        : // `request.url` is the path + query; the base only lets URL parse it.
          Effect.succeed(new URL(request.url, "http://callback.invalid").searchParams)

    const callback = (request: HttpServerRequest.HttpServerRequest) =>
      Effect.gen(function* () {
        // GET and POST share one limiter key.
        yield* limit(`strava-callback:${clientIp(request)}`)
        // Console mode outside local would store a fake integration: refuse before anything else,
        // even for a state minted elsewhere (REV-2).
        if (isConsoleOutsideLocal(config)) {
          return notConnectedPage
        }
        const params = yield* fieldsOf(request)
        const state = yield* verifyState(config, params.get("state") ?? "")
        // SEC-1 B1: a web state is good only in the browser that started it (double-submit cookie).
        yield* checkBinding(
          state,
          Option.fromNullishOr(request.cookies[CONNECT_COOKIE]),
          isNativeReturnTo(state.returnTo),
        )
        const finish = (outcome: CallbackOutcome) =>
          logOutcome(state.userId, outcome).pipe(
            Effect.as(back(state.returnTo, outcome)),
            Effect.flatMap(clearBinding),
          )
        if (params.has("error") || params.get("decision") === "cancel") {
          return yield* finish("denied")
        }
        const scopes = (params.get("scope") ?? "").split(",").map((scope) => scope.trim())
        if (!scopes.includes("activity:write")) {
          return yield* finish("scope")
        }
        const code = params.get("code") ?? ""
        if (code.length === 0) {
          return yield* finish("provider")
        }
        // SEC-1c: a state that passed `checkBinding` without a binding is a native one (no cookie
        // jar). Its GET only shows whose account Strava would join; the POST below exchanges.
        // Anything but the form POST stops here: HttpRouter serves HEAD through the GET route.
        if (request.method !== "POST" && state.binding === undefined) {
          return yield* tokens.email(state.userId).pipe(
            Effect.map((email) =>
              confirmPage(email, {
                state: params.get("state") ?? "",
                code,
                scope: scopes.join(","),
              }),
            ),
            Effect.catchTags({
              UserNotFound: () =>
                Effect.logWarning(
                  `[strava] callback for a missing user userId=${state.userId}`,
                ).pipe(Effect.andThen(finish("provider"))),
              PersistenceError: () =>
                Effect.logError(`[strava] reading the account failed userId=${state.userId}`).pipe(
                  Effect.andThen(finish("provider")),
                ),
            }),
          )
        }
        return yield* Effect.gen(function* () {
          // The state is signed but stateless: an account erased after it was minted must not get
          // an integration row back (STLS-F3/F4). Checked before the one-time code is spent.
          const exists = yield* tokens.tokenGens(state.userId).pipe(
            Effect.as(true),
            Effect.catchTag("UserNotFound", () => Effect.succeed(false)),
          )
          if (!exists) {
            yield* Effect.logWarning(`[strava] callback for a missing user userId=${state.userId}`)
            return yield* finish("provider")
          }
          const grant = yield* strava.exchangeCode(code)
          const bound = { userId: state.userId, provider: "strava" } as const
          const access = yield* seal.seal(grant.accessToken, { ...bound, slot: "access" })
          const refresh = yield* seal.seal(grant.refreshToken, { ...bound, slot: "refresh" })
          const now = yield* DateTime.now
          yield* integrations.upsert({
            id: yield* ids.next,
            userId: state.userId,
            provider: "strava",
            status: "active",
            externalId: grant.athlete.id,
            displayName: grant.athlete.displayName,
            // Same `v1.<iv>.<ct>` string: TokenSeal's brand and the db column's brand name one value.
            accessToken: DbSealedToken.make(access),
            refreshToken: DbSealedToken.make(refresh),
            expiresAt: grant.expiresAt,
            scope: scopes.join(","),
            createdAt: now,
            updatedAt: now,
          })
          return yield* finish("connected")
        }).pipe(
          // A failed exchange or store write: the app shows "try again" (`?error=provider`). The
          // log names the failure tag and status only; `StravaRequestFailed` carries no secrets.
          Effect.catchTags({
            StravaRequestFailed: (error) =>
              Effect.logWarning(
                `[strava] exchange failed userId=${state.userId} reason=${error.reason}`,
              ).pipe(Effect.andThen(finish("provider"))),
            PersistenceError: () =>
              Effect.logError(
                `[strava] storing the integration failed userId=${state.userId}`,
              ).pipe(Effect.andThen(finish("provider"))),
          }),
        )
      }).pipe(
        Effect.catchTags({
          NativeRateLimited: rateLimitedPage,
          StateRejected: ({ reason }) =>
            Effect.succeed(reason === "binding" ? otherBrowserPage : expiredPage),
        }),
        Effect.catchDefect((defect) =>
          Effect.logError("[strava] callback defect", defect).pipe(Effect.as(expiredPage)),
        ),
      )

    return Layer.mergeAll(
      HttpRouter.add("GET", STRAVA_CALLBACK_PATH, callback),
      HttpRouter.add("POST", STRAVA_CALLBACK_PATH, callback),
    )
  }),
)
