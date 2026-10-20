import {
  InternalError,
  NativeCodeRejected,
  NativeSessionRequest,
  NativeSessionResponse,
  PkceChallenge,
  SessionStoreUnavailable,
} from "@tanren/shared"
import { isAPIError } from "better-auth/api"
import { Data, DateTime, Effect, Layer, Option, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { WorkerConfig } from "../Config"
import { BetterAuth } from "./BetterAuth"
import { isAllowedReturnTo, signCode, verifyCode } from "./nativeCode"

/** Internal: the auth service or its store could not answer (D1 down, instance failed to build). */
class NativeStoreFailed extends Data.TaggedError("NativeStoreFailed")<{
  readonly cause: unknown
}> {}

/** Internal: Better Auth answered 4xx (no session for the OTT, unknown/used/expired OTT). */
class AuthRejected extends Data.TaggedError("AuthRejected")<{ readonly status: number }> {}

/** A Better Auth call: a 4xx `APIError` is a rejection, anything else an outage. */
const callAuth = <A>(call: () => Promise<A>) =>
  Effect.tryPromise({
    try: call,
    catch: (cause) =>
      isAPIError(cause) && cause.statusCode < 500
        ? new AuthRejected({ status: cause.statusCode })
        : new NativeStoreFailed({ cause }),
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
const page = (status: number, head: string, body: string) =>
  HttpServerResponse.text(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
${head}<title>Tanren sign-in</title>
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

/** 400, no redirect: a link whose `returnTo` or `challenge` is bad must not send the browser anywhere. */
const brokenPage = page(
  400,
  "",
  "<h1>Sign-in link broken</h1><p>This sign-in link is broken. Request a new one in the app.</p>",
)

/** The link was expired or used, or Safari has no session: hand the app an error instead of a code. */
const linkInvalidPage = (returnTo: string) =>
  page(
    200,
    "",
    `<h1>Link expired</h1><p>This sign-in link has expired or was already used.</p>
<a class="button" href="${escapeHtml(`${returnTo}?error=link_invalid`)}">Back to Tanren</a>`,
  )

/** Auto-open (meta refresh) plus a big button: a tap is the reliable way into a custom scheme. */
const openAppPage = (href: string) =>
  page(
    200,
    `<meta http-equiv="refresh" content="0;url=${escapeHtml(href)}">\n`,
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

const rejected = (error: NativeCodeRejected) =>
  HttpServerResponse.schemaJson(NativeCodeRejected)(error, {
    status: 400,
    headers: { "cache-control": "no-store" },
  })

const decodeChallenge = Schema.decodeUnknownOption(PkceChallenge)
const decodeRequest = Schema.decodeUnknownEffect(NativeSessionRequest)

/**
 * Native sign-in (docs/design/native-auth.md §2.3), merged into `authRoutes`:
 * `GET /auth/native/complete` turns the Safari session (cookie from the magic link) into a one-time
 * code bound to the app's PKCE challenge; `POST /api/native/session` exchanges code + verifier for
 * the Better Auth session token, which the app then sends as `Authorization: Bearer`.
 */
export const nativeAuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const betterAuth = yield* BetterAuth
    const config = yield* WorkerConfig
    const auth = betterAuth.auth.pipe(
      Effect.catchDefect((cause) => Effect.fail(new NativeStoreFailed({ cause }))),
    )

    const complete = (request: HttpServerRequest.HttpServerRequest) =>
      Effect.gen(function* () {
        const webRequest = yield* HttpServerRequest.toWeb(request)
        const params = new URL(webRequest.url).searchParams
        const returnTo = Option.fromNullishOr(params.get("returnTo")).pipe(
          Option.filter(isAllowedReturnTo),
        )
        const challenge = decodeChallenge(params.get("challenge"))
        if (Option.isNone(returnTo) || Option.isNone(challenge)) {
          return brokenPage
        }
        if (params.has("error")) {
          return linkInvalidPage(returnTo.value)
        }
        const instance = yield* auth
        const generated = yield* callAuth(() =>
          instance.api.generateOneTimeToken({ headers: webRequest.headers }),
        ).pipe(
          Effect.map(Option.some),
          // No session in Safari's cookie jar (link opened in another browser, session gone).
          Effect.catchTag("AuthRejected", () => Effect.succeed(Option.none())),
        )
        return yield* Option.match(generated, {
          onNone: () => Effect.succeed(linkInvalidPage(returnTo.value)),
          onSome: ({ token }) =>
            signCode(config.betterAuthSecret, token, challenge.value).pipe(
              Effect.map((code) =>
                openAppPage(`${returnTo.value}?code=${encodeURIComponent(code)}`),
              ),
            ),
        })
      }).pipe(Effect.catch(unavailable), Effect.catchDefect(internal))

    const exchange = (request: HttpServerRequest.HttpServerRequest) =>
      Effect.gen(function* () {
        const body = yield* request.json.pipe(
          Effect.flatMap(decodeRequest),
          Effect.mapError(() => new NativeCodeRejected({ reason: "malformed" })),
        )
        // Binding first: a wrong verifier must not consume the one-time token.
        const ott = yield* verifyCode(config.betterAuthSecret, body.code, body.verifier)
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
          headers: { "cache-control": "no-store" },
        })
      }).pipe(
        Effect.catchTag("NativeCodeRejected", rejected),
        // A session row Better Auth returned that our schema rejects (non-UUID user id) is a bug.
        Effect.catchTags({
          NoSuchElementError: (error) => Effect.die(error),
          SchemaError: (error) => Effect.die(error),
        }),
        Effect.catch(unavailable),
        Effect.catchDefect(internal),
      )

    return Layer.mergeAll(
      HttpRouter.add("GET", "/auth/native/complete", complete),
      HttpRouter.add("POST", "/api/native/session", exchange),
    )
  }),
)
