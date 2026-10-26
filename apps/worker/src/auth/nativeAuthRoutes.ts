import {
  EmailDeliveryFailed,
  InternalError,
  NativeBeginRejected,
  NativeBeginRequest,
  NativeBeginResponse,
  NativeCodeRejected,
  NativeRateLimited,
  NativeSessionRequest,
  NativeSessionResponse,
  PkceChallenge,
  SessionStoreUnavailable,
} from "@tanren/shared"
import { isAPIError } from "better-auth/api"
import { Clock, Data, DateTime, Effect, HashMap, Layer, Option, Ref, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { WorkerConfig } from "../Config"
import { BetterAuth } from "./BetterAuth"
import { EmailSendFailed } from "./Email"
import {
  BeginState,
  isAllowedReturnTo,
  signBegin,
  signCode,
  verifyBegin,
  verifyCode,
} from "./nativeCode"

/** Internal: the auth service or its store could not answer (D1 down, instance failed to build). */
class NativeStoreFailed extends Data.TaggedError("NativeStoreFailed")<{
  readonly cause: unknown
}> {}

/** Internal: Better Auth answered 4xx (no session for the OTT, unknown/used/expired OTT). */
class AuthRejected extends Data.TaggedError("AuthRejected")<{ readonly status: number }> {}

/** How long a begin signature is valid: the magic link itself expires sooner (5 min). */
export const BEGIN_TTL_SECONDS = 15 * 60
/** `/complete` only hands out a code for a session made this recently (by the magic link). */
export const FRESH_SESSION_MS = 5 * 60 * 1000
/** Per isolate, per route, per `cf-connecting-ip`. */
export const NATIVE_RATE_LIMIT = { max: 10, windowMs: 60 * 1000 } as const

const isEmailSendFailed = Schema.is(EmailSendFailed)

/** A Better Auth call: a 4xx `APIError` is a rejection, a failed email send stays itself, anything else is an outage. */
const callAuth = <A>(call: () => Promise<A>) =>
  Effect.tryPromise({
    try: call,
    catch: (cause) => {
      if (isEmailSendFailed(cause)) {
        return cause
      }
      return isAPIError(cause) && cause.statusCode < 500
        ? new AuthRejected({ status: cause.statusCode })
        : new NativeStoreFailed({ cause })
    },
  })

interface Bucket {
  readonly windowStart: number
  readonly count: number
}

/**
 * Fixed-window limiter in isolate memory (weak: each isolate counts alone; the production upgrade
 * is the Workers rate-limiting binding, see apps/worker/CLAUDE.md). Expired buckets are dropped on
 * every call, so the map stays as small as the set of recent callers.
 */
export const makeLimiter = Effect.gen(function* () {
  const buckets = yield* Ref.make(HashMap.empty<string, Bucket>())
  return (key: string) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const { max, windowMs } = NATIVE_RATE_LIMIT
      const bucket = yield* Ref.modify(buckets, (map) => {
        const live = HashMap.filter(map, (b) => b.windowStart + windowMs > now)
        const next = Option.match(HashMap.get(live, key), {
          onNone: () => ({ windowStart: now, count: 1 }),
          onSome: (b) => ({ windowStart: b.windowStart, count: b.count + 1 }),
        })
        return [next, HashMap.set(live, key, next)] as const
      })
      if (bucket.count > max) {
        return yield* new NativeRateLimited({
          retryAfterSeconds: Math.ceil((bucket.windowStart + windowMs - now) / 1000),
        })
      }
    })
})

const ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char)

/** The page carries a one-time code: never cached, never sent on as a Referer. */
const page = (status: number, body: string) =>
  HttpServerResponse.text(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Tanren sign-in</title>
<style>
body{font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#1a1a1a;background:#fafafa}
a.button{display:block;text-align:center;padding:1rem;font-size:1.25rem;background:#1a1a1a;color:#fff;border-radius:.75rem;text-decoration:none;margin-top:1.5rem}
</style>
</head>
<body>
${body}
</body>
</html>`,
    {
      status,
      contentType: "text/html; charset=utf-8",
      headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" },
    },
  )

/** 400, no redirect: a bad `returnTo`, challenge or begin signature must not send the browser anywhere. */
const brokenPage = page(
  400,
  "<h1>Sign-in link broken</h1><p>This sign-in link is broken. Request a new one in the app.</p>",
)

/** Expired or used link, no fresh session: hand the app an error instead of a code. */
const linkInvalidPage = (returnTo: string) =>
  page(
    200,
    `<h1>Link expired</h1><p>This sign-in link has expired or was already used.</p>
<a class="button" href="${escapeHtml(`${returnTo}?error=link_invalid`)}">Back to Tanren</a>`,
  )

/** A tap, not an automatic redirect: the owner confirms the hand-off to the app (design §4). */
const openAppPage = (href: string) =>
  page(
    200,
    `<h1>Signed in</h1><p>Tap the button to finish signing in on this iPhone.</p>
<a class="button" href="${escapeHtml(href)}">Open Tanren</a>`,
  )

/** 503: the session store or auth service is down. */
const unavailable = (cause: unknown) =>
  Effect.logError("native auth failed", cause).pipe(
    Effect.andThen(
      HttpServerResponse.schemaJson(SessionStoreUnavailable)(
        new SessionStoreUnavailable({ message: "session store unavailable" }),
        { status: 503 },
      ),
    ),
  )

/** 500: a bug. The cause goes to the log (never the code or token); the body is a bare `InternalError`. */
const internal = (defect: unknown) =>
  Effect.logError("native auth defect", defect).pipe(
    Effect.andThen(
      HttpServerResponse.schemaJson(InternalError)(new InternalError({}), { status: 500 }),
    ),
  )

const noStore = { "cache-control": "no-store" }

const rateLimited = (error: NativeRateLimited) =>
  HttpServerResponse.schemaJson(NativeRateLimited)(error, {
    status: 429,
    headers: { ...noStore, "retry-after": String(error.retryAfterSeconds) },
  })

const codeRejected = (error: NativeCodeRejected) =>
  HttpServerResponse.schemaJson(NativeCodeRejected)(error, { status: 400, headers: noStore })

const beginRejected = (error: NativeBeginRejected) =>
  HttpServerResponse.schemaJson(NativeBeginRejected)(error, { status: 400, headers: noStore })

/** 502: the email provider refused the link. The body names only provider and reason. */
const deliveryFailed = (error: EmailSendFailed) =>
  Effect.logError("native magic link email failed", error.message).pipe(
    Effect.andThen(
      HttpServerResponse.schemaJson(EmailDeliveryFailed)(
        new EmailDeliveryFailed({ provider: error.provider, reason: error.reason }),
        { status: 502 },
      ),
    ),
  )

const decodeChallenge = Schema.decodeUnknownOption(PkceChallenge)
const decodeBeginState = Schema.decodeUnknownOption(BeginState)
const decodeExpiry = Schema.decodeUnknownOption(Schema.NumberFromString.check(Schema.isInt()))

export const clientIp = (request: HttpServerRequest.HttpServerRequest): string =>
  request.headers["cf-connecting-ip"] ?? "unknown"

/**
 * Native sign-in (docs/design/native-auth.md §2.3), merged into `authRoutes`:
 * `POST /api/native/begin` signs (email, challenge, returnTo, expiry) into the magic link's
 * callbackURL and sends the link; `GET /auth/native/complete` checks that signature against the
 * fresh Safari session's email and hands out a one-time code bound to the PKCE challenge;
 * `POST /api/native/session` exchanges code + verifier for the Better Auth session token.
 */
export const nativeAuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const betterAuth = yield* BetterAuth
    const config = yield* WorkerConfig
    const limit = yield* makeLimiter
    const allowedReturnTo = isAllowedReturnTo(config.nativeReturnPrefixes)
    const secret = config.betterAuthSecret
    const auth = betterAuth.auth.pipe(
      Effect.catchDefect((cause) => Effect.fail(new NativeStoreFailed({ cause }))),
    )

    const begin = (request: HttpServerRequest.HttpServerRequest) =>
      Effect.gen(function* () {
        yield* limit(`begin:${clientIp(request)}`)
        const body = yield* request.json.pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(NativeBeginRequest)),
          Effect.mapError(() => new NativeBeginRejected({ reason: "malformed" })),
        )
        if (!allowedReturnTo(body.returnTo)) {
          return yield* new NativeBeginRejected({ reason: "return-to" })
        }
        const now = yield* Clock.currentTimeMillis
        const expiresAt = Math.floor(now / 1000) + BEGIN_TTL_SECONDS
        const state: BeginState = { ...body, expiresAt }
        const sig = yield* signBegin(secret, state)
        const callbackURL = `/auth/native/complete?${new URLSearchParams({
          challenge: body.challenge,
          returnTo: body.returnTo,
          exp: String(expiresAt),
          sig,
        })}`
        const webRequest = yield* HttpServerRequest.toWeb(request)
        const instance = yield* auth
        yield* callAuth(() =>
          instance.api.signInMagicLink({
            body: { email: body.email, callbackURL },
            headers: webRequest.headers,
          }),
        )
        return yield* HttpServerResponse.schemaJson(NativeBeginResponse)(
          { sent: true },
          { headers: noStore },
        )
      }).pipe(
        Effect.catchTags({
          NativeRateLimited: rateLimited,
          NativeBeginRejected: beginRejected,
          EmailSendFailed: deliveryFailed,
        }),
        Effect.catch(unavailable),
        Effect.catchDefect(internal),
      )

    const complete = (request: HttpServerRequest.HttpServerRequest) =>
      Effect.gen(function* () {
        yield* limit(`complete:${clientIp(request)}`)
        const webRequest = yield* HttpServerRequest.toWeb(request)
        const params = new URL(webRequest.url).searchParams
        const returnTo = Option.fromNullishOr(params.get("returnTo")).pipe(
          Option.filter(allowedReturnTo),
        )
        const challenge = decodeChallenge(params.get("challenge"))
        if (Option.isNone(returnTo) || Option.isNone(challenge)) {
          return brokenPage
        }
        if (params.has("error")) {
          return linkInvalidPage(returnTo.value)
        }
        const expiresAt = decodeExpiry(params.get("exp"))
        const sig = Option.fromNullishOr(params.get("sig"))
        if (Option.isNone(expiresAt) || Option.isNone(sig)) {
          return brokenPage
        }
        const now = yield* Clock.currentTimeMillis
        if (now > expiresAt.value * 1000) {
          return linkInvalidPage(returnTo.value)
        }
        const instance = yield* auth
        const session = yield* callAuth(() =>
          instance.api.getSession({ headers: webRequest.headers }),
        ).pipe(
          Effect.map(Option.fromNullishOr),
          Effect.catchTag("AuthRejected", () => Effect.succeed(Option.none())),
        )
        if (Option.isNone(session)) {
          return linkInvalidPage(returnTo.value)
        }
        const state = decodeBeginState({
          email: session.value.user.email,
          challenge: challenge.value,
          returnTo: returnTo.value,
          expiresAt: expiresAt.value,
        })
        // The app started this sign-in for this email, challenge and returnTo; anything else is a
        // crafted URL (session-export CSRF) or a session of another user.
        if (Option.isNone(state) || !(yield* verifyBegin(secret, state.value, sig.value))) {
          return brokenPage
        }
        const createdAt = DateTime.make(session.value.session.createdAt)
        if (
          Option.isNone(createdAt) ||
          now - DateTime.toEpochMillis(createdAt.value) > FRESH_SESSION_MS
        ) {
          return linkInvalidPage(returnTo.value)
        }
        const generated = yield* callAuth(() =>
          instance.api.generateOneTimeToken({ headers: webRequest.headers }),
        ).pipe(
          Effect.map(Option.some),
          Effect.catchTag("AuthRejected", () => Effect.succeed(Option.none())),
        )
        return yield* Option.match(generated, {
          onNone: () => Effect.succeed(linkInvalidPage(returnTo.value)),
          onSome: ({ token }) =>
            signCode(secret, token, challenge.value).pipe(
              Effect.map((code) =>
                openAppPage(`${returnTo.value}?code=${encodeURIComponent(code)}`),
              ),
            ),
        })
      }).pipe(
        Effect.catchTag("NativeRateLimited", rateLimited),
        Effect.catch(unavailable),
        Effect.catchDefect(internal),
      )

    const exchange = (request: HttpServerRequest.HttpServerRequest) =>
      Effect.gen(function* () {
        yield* limit(`session:${clientIp(request)}`)
        const body = yield* request.json.pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(NativeSessionRequest)),
          Effect.mapError(() => new NativeCodeRejected({ reason: "malformed" })),
        )
        // Binding first: a wrong verifier must not consume the one-time token.
        const ott = yield* verifyCode(secret, body.code, body.verifier)
        if (Option.isNone(ott)) {
          return yield* new NativeCodeRejected({ reason: "mismatch" })
        }
        const instance = yield* auth
        const verified = yield* callAuth(() =>
          instance.api.verifyOneTimeToken({ body: { token: ott.value } }),
        ).pipe(
          Effect.catchTag("AuthRejected", () =>
            Effect.fail(new NativeCodeRejected({ reason: "invalid" })),
          ),
        )
        const expiresAt = yield* Effect.fromOption(DateTime.make(verified.session.expiresAt))
        const response = yield* Schema.decodeUnknownEffect(NativeSessionResponse)({
          token: verified.session.token,
          userId: verified.user.id,
          expiresAt: DateTime.formatIso(expiresAt),
        })
        return yield* HttpServerResponse.schemaJson(NativeSessionResponse)(response, {
          headers: noStore,
        })
      }).pipe(
        Effect.catchTags({ NativeRateLimited: rateLimited, NativeCodeRejected: codeRejected }),
        // A session row Better Auth returned that our schema rejects (non-UUID user id) is a bug.
        Effect.catchTags({
          NoSuchElementError: (error) => Effect.die(error),
          SchemaError: (error) => Effect.die(error),
        }),
        Effect.catch(unavailable),
        Effect.catchDefect(internal),
      )

    return Layer.mergeAll(
      HttpRouter.add("POST", "/api/native/begin", begin),
      HttpRouter.add("GET", "/auth/native/complete", complete),
      HttpRouter.add("POST", "/api/native/session", exchange),
    )
  }),
)
