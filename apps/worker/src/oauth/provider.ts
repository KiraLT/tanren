import type { OAuthCodeUseRepo, UserTokens } from "@tanren/db"
import { Effect, Layer, ManagedRuntime, Option } from "effect"
import type { App } from "../app"
import { makeLimiterWith } from "../auth/nativeAuthRoutes"
import { Tokens } from "../auth/Tokens"
import { WorkerConfig, type WorkerConfigShape } from "../Config"
import { mcpLandingResponse } from "../mcp/McpLanding"
import type { Mcp } from "../mcp/McpRoute"
import type { Authorize } from "./authorize"
import { ClientResolver, register } from "./clients"
import {
  AUTHORIZATION_SERVER_METADATA,
  metadataRoute,
  PROTECTED_RESOURCE_METADATA,
} from "./metadata"
import { OAuthApi } from "./OAuthApi"
import { errorPage, PAGE_CSP } from "./pages"
import { tokenEndpoint } from "./token"

// The Worker's router (ADR-0022, docs/design/auth-v2.md §5): the stateless OAuth authorization
// server, the MCP resource and the REST app on one fetch. No KV, no library: discovery, token and
// registration are `metadata.ts`, `token.ts`, `clients.ts`; consent is `authorize.ts` over
// `OAuthApi.layerStateless`.

export interface WorkerHandlers {
  readonly app: App
  readonly mcp: Mcp
  readonly authorize: Authorize
}

/** The Worker's fetch; `index.ts` calls it. */
export interface WorkerFetch {
  readonly fetch: (request: Request, env: unknown, ctx: ExecutionContext) => Promise<Response>
}

/** Where code redemptions and token generations live (D1 in the Worker, memory in Node tests). */
export type OAuthStore = Layer.Layer<UserTokens | OAuthCodeUseRepo>

export const TOKEN_PATH = "/oauth/token"
export const REGISTER_PATH = "/oauth/register"

/**
 * The `authorize.ts` hook: the stateless `OAuthApi` for one browser request, over `Tokens`, the
 * CIMD/DCR `ClientResolver` and the token store; `Sessions` and `WorkerConfig` come from the
 * authorize runtime.
 */
export const statelessOAuth = (store: OAuthStore) => (_env: unknown, request: Request) =>
  Option.some(
    OAuthApi.layerStateless({ request }).pipe(
      Layer.provide(ClientResolver.layer),
      Layer.provide(Layer.merge(Tokens.layer, store)),
    ),
  )

/**
 * CORS as the removed OAuth provider library sent it (`withCorsHeaders`): the request's `Origin`
 * is reflected (bearer tokens are not ambient credentials), `WWW-Authenticate` and `Retry-After`
 * are exposed, headers the response already has are kept. No `Origin` → unchanged.
 */
export const withCors = (response: Response, request: Request): Response => {
  const origin = request.headers.get("origin")
  if (origin === null) {
    return response
  }
  const source = response.headers
  const unlessPresent = (name: string, value: string): ReadonlyArray<[string, string]> =>
    source.has(name) ? [] : [[name, value]]
  const headers = new Headers([
    ...[...source.entries()].filter(
      ([name]) => name !== "vary" && name !== "access-control-expose-headers",
    ),
    ...unlessPresent("access-control-allow-origin", origin),
    ...unlessPresent("access-control-allow-methods", "*"),
    ...unlessPresent("access-control-allow-headers", "Authorization, *"),
    ...unlessPresent("access-control-max-age", "86400"),
    ["vary", appendValue(source.get("vary"), "Origin")],
    [
      "access-control-expose-headers",
      appendValue(
        appendValue(source.get("access-control-expose-headers"), "WWW-Authenticate"),
        "Retry-After",
      ),
    ],
  ])
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/** `current` (a comma list) plus `value` unless already listed, case-insensitively. */
const appendValue = (current: string | null, value: string): string => {
  const values = (current ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  return values.some((item) => item.toLowerCase() === value.toLowerCase())
    ? values.join(", ")
    : [...values, value].join(", ")
}

const methodNotAllowed = (allow: string, json: boolean): Response =>
  json
    ? new Response(
        JSON.stringify({ error: "invalid_request", error_description: "Method not allowed" }),
        {
          status: 405,
          headers: {
            allow,
            "content-type": "application/json",
            "cache-control": "no-store",
            pragma: "no-cache",
          },
        },
      )
    : new Response(null, { status: 405, headers: { allow } })

/**
 * SEC-A2 (A4): per isolate, per route, per `cf-connecting-ip`, fixed 60 s windows (`makeLimiterWith`;
 * weak like the native limiter, the upgrade is the Workers rate-limiting binding). Sized well above a
 * real client: one OAuth flow is 2-3 `/authorize*` requests, one token exchange plus a refresh every
 * 15 minutes, and one registration per client install.
 */
export const OAUTH_RATE_LIMITS = {
  authorize: { max: 30, windowMs: 60_000 },
  token: { max: 60, windowMs: 60_000 },
  register: { max: 10, windowMs: 60_000 },
} as const

type LimitedRoute = keyof typeof OAUTH_RATE_LIMITS

/** RFC 6749 has no 429 error code; `temporarily_unavailable` (§4.1.2.1) is the closest. */
const tooManyJson = (retryAfterSeconds: number): Response =>
  new Response(
    JSON.stringify({ error: "temporarily_unavailable", error_description: "Too many requests" }),
    {
      status: 429,
      headers: {
        "retry-after": String(retryAfterSeconds),
        "content-type": "application/json",
        "cache-control": "no-store",
        pragma: "no-cache",
      },
    },
  )

/** The `/authorize*` 429: the same page frame and CSP as every authorize page. */
const tooManyHtml = (retryAfterSeconds: number): Response =>
  new Response(errorPage("Too many requests", "Wait a minute, then start again from your app."), {
    status: 429,
    headers: {
      "retry-after": String(retryAfterSeconds),
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": PAGE_CSP,
    },
  })

/**
 * `OPTIONS` on a CORS path → 204; discovery → `metadata.ts`; `/oauth/token`, `/oauth/register`;
 * `/mcp` → MCP; `GET|HEAD /` on the MCP host → the static landing page (the bare origin is not the
 * RFC 8707 resource); `/authorize` and below → the authorize pages; everything else → the REST app.
 */
export const makeRouter = (
  env: unknown,
  config: WorkerConfigShape,
  { app, mcp, authorize }: WorkerHandlers,
  store: OAuthStore,
): WorkerFetch & { readonly dispose: () => Promise<void> } => {
  const runtime = ManagedRuntime.make(
    Layer.merge(Tokens.layer, store).pipe(
      Layer.provideMerge(WorkerConfig.layerFromEnv(env)),
      Layer.orDie,
    ),
  )
  const metadata = metadataRoute(config)
  const mcpHostname = new URL(config.mcpResourceUrl).hostname
  const run = (effect: Effect.Effect<Response, never, Tokens | UserTokens | OAuthCodeUseRepo>) =>
    runtime.runPromise(effect)
  // Three `Ref.make`s: no I/O, so building them where `index.ts` builds the router is safe.
  const limiters = Effect.runSync(
    Effect.all({
      authorize: makeLimiterWith(OAUTH_RATE_LIMITS.authorize),
      token: makeLimiterWith(OAUTH_RATE_LIMITS.token),
      register: makeLimiterWith(OAUTH_RATE_LIMITS.register),
    }),
  )
  /** `handle()` unless this `cf-connecting-ip` is over the route's limit, then the 429. */
  const limited = (
    route: LimitedRoute,
    request: Request,
    tooMany: (retryAfterSeconds: number) => Response,
    handle: () => Promise<Response>,
  ): Promise<Response> =>
    Effect.runPromise(
      limiters[route](
        `oauth-${route}:${request.headers.get("cf-connecting-ip") ?? "unknown"}`,
      ).pipe(
        Effect.flatMap(() => Effect.promise(handle)),
        Effect.catchTag("NativeRateLimited", ({ retryAfterSeconds }) =>
          Effect.succeed(tooMany(retryAfterSeconds)),
        ),
      ),
    )

  const isCorsPath = (pathname: string, hostname: string) =>
    pathname === "/mcp" ||
    pathname === TOKEN_PATH ||
    pathname === REGISTER_PATH ||
    pathname === AUTHORIZATION_SERVER_METADATA ||
    (hostname === mcpHostname &&
      (pathname === PROTECTED_RESOURCE_METADATA ||
        pathname.startsWith(`${PROTECTED_RESOURCE_METADATA}/`)))

  const fetch = async (request: Request, workerEnv: unknown, ctx: ExecutionContext) => {
    const { pathname, hostname } = new URL(request.url)
    if (request.method === "OPTIONS" && isCorsPath(pathname, hostname)) {
      return withCors(
        new Response(null, { status: 204, headers: { "content-length": "0" } }),
        request,
      )
    }
    const discovered = metadata(request)
    if (Option.isSome(discovered)) {
      return withCors(discovered.value, request)
    }
    if (pathname === AUTHORIZATION_SERVER_METADATA) {
      return withCors(methodNotAllowed("GET, HEAD, OPTIONS", false), request)
    }
    if (pathname === TOKEN_PATH) {
      return withCors(
        request.method === "POST"
          ? await limited("token", request, tooManyJson, () => run(tokenEndpoint(request)))
          : methodNotAllowed("POST, OPTIONS", true),
        request,
      )
    }
    if (pathname === REGISTER_PATH) {
      return withCors(
        request.method === "POST"
          ? await limited("register", request, tooManyJson, () => run(register(request)))
          : methodNotAllowed("POST, OPTIONS", true),
        request,
      )
    }
    if (pathname === "/mcp") {
      return withCors(await mcp.handle(request, workerEnv, ctx), request)
    }
    if (
      pathname === "/" &&
      (request.method === "GET" || request.method === "HEAD") &&
      hostname === mcpHostname
    ) {
      return mcpLandingResponse(request, config.mcpResourceUrl)
    }
    if (pathname === "/authorize" || pathname.startsWith("/authorize/")) {
      return limited("authorize", request, tooManyHtml, () =>
        authorize.handle(request, workerEnv, ctx),
      )
    }
    return app.handler(request)
  }
  return { fetch, dispose: () => runtime.dispose() }
}
