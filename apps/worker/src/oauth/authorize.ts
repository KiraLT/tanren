import type { ConsentDescription, OAuthHelpers } from "@cloudflare/workers-oauth-provider"
import { MCP_SCOPES, McpScope, type SessionStoreUnavailable } from "@tanren/shared"
import {
  Array as Arr,
  Cause,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Option,
  Predicate,
  Schema,
} from "effect"
import { BetterAuth } from "../auth/BetterAuth"
import { Sessions } from "../auth/Sessions"
import { SessionsLive } from "../auth/SessionsLive"
import { WorkerConfig } from "../Config"
import { clientTrust } from "./knownClients"
import { OAuthApi, type OAuthFailure } from "./OAuthApi"
import { type ConsentView, checkEmailPage, consentPage, errorPage, loginPage } from "./pages"

/** The part of the Worker env this module reads: the helpers the `OAuthProvider` injects. */
export interface AuthorizeEnv {
  readonly OAUTH_PROVIDER?: OAuthHelpers
}

export interface AuthorizeServices {
  /** Better Auth for the magic-link send (and, by default, for `Sessions`). */
  readonly betterAuth: Layer.Layer<BetterAuth, never, WorkerConfig>
  /** Who is signed in. Default `SessionsLive` on the same Better Auth instance; tests pass `layerFixed`. */
  readonly sessions?: Layer.Layer<Sessions, never, BetterAuth | WorkerConfig>
  /**
   * The provider port for one request. Default: `OAuthApi.layerFromHelpers(env.OAUTH_PROVIDER)`,
   * none when the request did not come through the provider. Tests pass one shared fake.
   */
  readonly oauth?: (env: AuthorizeEnv) => Option.Option<Layer.Layer<OAuthApi>>
}

export interface Authorize {
  readonly handle: (request: Request, env: AuthorizeEnv, ctx: ExecutionContext) => Promise<Response>
  readonly dispose: () => Promise<void>
}

const HTML = "text/html; charset=utf-8"

const html = (status: number, body: string, extra: Headers = new Headers()): Response =>
  new Response(body, {
    status,
    headers: new Headers([
      ...extra.entries(),
      ["content-type", HTML],
      ["cache-control", "no-store"],
    ]),
  })

/** 302 to `location`; `extra` (provider cookies) is kept, any `location` in it replaced. */
const redirect = (location: string, extra: Headers = new Headers()): Response =>
  new Response(null, {
    status: 302,
    headers: new Headers([
      ...Arr.filter([...extra.entries()], ([name]) => name.toLowerCase() !== "location"),
      ["location", location],
      ["cache-control", "no-store"],
    ]),
  })

const unavailable = () =>
  html(
    503,
    errorPage("Temporarily unavailable", "Tanren could not complete this step. Try again shortly."),
  )

/** A provider failure: back to the client when the provider validated its redirect, else a page. */
const failureResponse = (failure: OAuthFailure): Response =>
  Option.match(failure.redirectTo, {
    onSome: (to) => redirect(to),
    onNone: () => html(400, errorPage("Invalid authorization request", failure.message)),
  })

/** `next` must be a same-origin `/authorize?…` URL, so the login form cannot redirect elsewhere. */
export const safeNext = (next: string, origin: string): Option.Option<string> =>
  Option.liftThrowable((raw: string) => new URL(raw, origin))(next).pipe(
    Option.filter(
      (url) =>
        next.startsWith("/authorize?") && url.origin === origin && url.pathname === "/authorize",
    ),
    Option.as(next),
  )

const readForm = (request: Request) =>
  Effect.tryPromise(() => request.formData()).pipe(Effect.option)

const field = (form: FormData, name: string): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(form.get(name)), Predicate.isString)

const isMcpScope = Schema.is(McpScope)

/**
 * The scopes a request may be granted. A request without `scope` (parsed as `[]`) may get any MCP
 * scope; the consent page shows both and the user decides.
 */
export const grantableScopes = (requested: ReadonlyArray<string>): ReadonlyArray<McpScope> =>
  requested.length === 0 ? MCP_SCOPES : Arr.filter(requested, isMcpScope)

/**
 * What the consent page shows: the grantable scopes, and the client's trust derived only from the
 * provider's `clientDomain` (set for CIMD clients alone), never from its self-declared name.
 */
export const consentView = (consent: ConsentDescription): ConsentView => ({
  ...consent,
  scope: [...grantableScopes(consent.scope)],
  trust: clientTrust(Option.fromNullishOr(consent.clientDomain)),
})

/**
 * What Better Auth's origin check and rate limiter read from the browser's request. Only
 * Cloudflare's own client-IP header: a caller-supplied `x-forwarded-for` would pick its own
 * rate-limit key.
 */
const FORWARDED_HEADERS = [
  "origin",
  "referer",
  "cookie",
  "cf-connecting-ip",
  "user-agent",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
] as const

/** `GET /authorize`: login page when signed out, else the consent page. */
const showAuthorize = Effect.fn("authorize.show")(function* (request: Request) {
  const oauth = yield* OAuthApi
  const sessions = yield* Sessions
  const url = new URL(request.url)
  const authRequest = yield* oauth.parseAuthRequest(request)
  const user = yield* sessions.current(request.headers)
  if (Option.isNone(user)) {
    return html(200, loginPage(`${url.pathname}${url.search}`))
  }
  const consent = yield* oauth.describeConsent(authRequest)
  const transaction = yield* oauth.beginConsent(authRequest)
  return html(200, consentPage(consentView(consent), transaction.handle), transaction.headers)
})

/** `POST /authorize/login`: send the magic link that returns to `next`. */
const login = Effect.fn("authorize.login")(function* (request: Request) {
  const origin = new URL(request.url).origin
  const form = yield* readForm(request)
  const email = Option.flatMap(form, (f) => field(f, "email")).pipe(
    Option.map((raw) => raw.trim()),
    Option.filter((raw) => raw.length > 0),
  )
  const next = Option.flatMap(form, (f) => field(f, "next")).pipe(
    Option.flatMap((raw) => safeNext(raw, origin)),
  )
  if (Option.isNone(email) || Option.isNone(next)) {
    return html(400, errorPage("Invalid sign-in request", "Start again from your app."))
  }
  const config = yield* WorkerConfig
  const auth = yield* (yield* BetterAuth).auth
  // Through Better Auth's router, not `auth.api`: only the router runs its rate limiter and its
  // origin/CSRF check, so this page cannot be used to mail arbitrary addresses unthrottled.
  const status = yield* Effect.tryPromise(() =>
    auth.handler(
      new Request(`${config.betterAuthUrl}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: new Headers([
          ["content-type", "application/json"],
          ...Arr.flatMap(
            FORWARDED_HEADERS,
            (name): ReadonlyArray<[string, string]> =>
              Option.match(Option.fromNullishOr(request.headers.get(name)), {
                onNone: () => [],
                onSome: (value) => [[name, value]],
              }),
          ),
        ]),
        body: JSON.stringify({ email: email.value, callbackURL: next.value }),
      }),
    ),
  ).pipe(
    Effect.map((response) => response.status),
    Effect.catch((error) =>
      Effect.logError("magic link request failed", error.cause).pipe(Effect.as(503)),
    ),
  )
  if (status >= 200 && status < 300) {
    return html(200, checkEmailPage(email.value))
  }
  yield* Effect.logWarning("magic link not sent", status)
  return status >= 400 && status < 500
    ? html(400, errorPage("Could not send a sign-in link", "Check the email address."))
    : unavailable()
})

/** `POST /authorize`: deny, or approve the ticked scopes for the signed-in user. */
const decide = Effect.fn("authorize.decide")(function* (request: Request) {
  const oauth = yield* OAuthApi
  const sessions = yield* Sessions
  const form = yield* readForm(request)
  const handle = Option.flatMap(form, (f) => field(f, "handle"))
  if (Option.isNone(form) || Option.isNone(handle)) {
    return html(400, errorPage("Invalid consent request", "Start again from your app."))
  }
  const approve = Option.contains(field(form.value, "decision"), "approve")
  const ticked = Arr.dedupe(Arr.filter(form.value.getAll("scope"), isMcpScope))
  if (!approve || ticked.length === 0) {
    const denied = yield* oauth.denyConsent(request, handle.value)
    return redirect(denied.redirectTo, denied.headers)
  }
  // The user comes from this request's session, never from the form.
  const user = yield* sessions.current(request.headers)
  if (Option.isNone(user)) {
    return html(401, errorPage("Signed out", "Your session ended. Start again from your app."))
  }
  // Approve without a scope override: the provider hands back the request it stored, so the grant
  // is ticked ∩ requested ∩ MCP_SCOPES and a tampered form cannot add a scope the client never asked for.
  const approved = yield* oauth.approveConsent(request, handle.value)
  const grantable = grantableScopes(approved.request.scope)
  const scopes = Arr.filter(ticked, (scope) => grantable.includes(scope))
  if (scopes.length === 0) {
    return html(400, errorPage("Invalid consent request", "Start again from your app."))
  }
  const { redirectTo } = yield* oauth.completeAuthorization({
    request: approved.request,
    userId: user.value,
    scope: scopes,
    props: { userId: user.value, scopes },
  })
  return redirect(redirectTo, approved.headers)
})

type AuthorizeDeps = OAuthApi | Sessions | BetterAuth | WorkerConfig

const route = (request: Request): Effect.Effect<Response, never, AuthorizeDeps> => {
  const { pathname } = new URL(request.url)
  const program: Effect.Effect<Response, OAuthFailure | SessionStoreUnavailable, AuthorizeDeps> =
    pathname === "/authorize" && request.method === "GET"
      ? showAuthorize(request)
      : pathname === "/authorize" && request.method === "POST"
        ? decide(request)
        : pathname === "/authorize/login" && request.method === "POST"
          ? login(request)
          : Effect.succeed(html(404, errorPage("Not found", "There is nothing here.")))
  return program.pipe(
    Effect.catchTags({
      OAuthFailure: (failure) => Effect.succeed(failureResponse(failure)),
      SessionStoreUnavailable: (_: SessionStoreUnavailable) => Effect.succeed(unavailable()),
    }),
    Effect.catchCause((cause) =>
      Effect.logError("authorize failed", Cause.pretty(cause)).pipe(Effect.as(unavailable())),
    ),
  )
}

const defaultOAuth = (env: AuthorizeEnv): Option.Option<Layer.Layer<OAuthApi>> =>
  Option.map(Option.fromNullishOr(env.OAUTH_PROVIDER), OAuthApi.layerFromHelpers)

/**
 * The authorization-server pages the `OAuthProvider` delegates to (docs/design/oauth.md §3):
 * `GET /authorize`, `POST /authorize/login`, `POST /authorize`. Build once per isolate; layers only
 * describe (Better Auth is created on first use). Every outcome is a page or a redirect, never 500.
 */
export const makeAuthorize = (env: unknown, services: AuthorizeServices): Authorize => {
  const runtime = ManagedRuntime.make(
    (services.sessions ?? SessionsLive).pipe(
      Layer.provideMerge(services.betterAuth),
      Layer.provideMerge(WorkerConfig.layerFromEnv(env)),
      Layer.orDie,
    ),
  )
  const oauthFor = services.oauth ?? defaultOAuth
  const handle = (request: Request, workerEnv: AuthorizeEnv, _ctx: ExecutionContext) =>
    Option.match(oauthFor(workerEnv), {
      onNone: () => Promise.resolve(unavailable()),
      onSome: (oauth) =>
        runtime
          .runPromiseExit(route(request).pipe(Effect.provide(oauth)))
          .then(Exit.match({ onFailure: unavailable, onSuccess: (response) => response })),
    })
  return { handle, dispose: () => runtime.dispose() }
}
