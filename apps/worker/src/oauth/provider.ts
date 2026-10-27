import { OAuthProvider } from "@cloudflare/workers-oauth-provider"
import { MCP_SCOPES } from "@tanren/shared"
import { Option } from "effect"
import type { App } from "../app"
import type { WorkerConfigShape } from "../Config"
import type { Env } from "../Env"
import { devPrincipalFor } from "../mcp/McpAuth"
import { mcpLandingResponse } from "../mcp/McpLanding"
import type { Mcp } from "../mcp/McpRoute"
import type { Authorize } from "./authorize"

// The Worker as one `OAuthProvider` in combined mode (docs/design/oauth.md §1). This module imports
// the package's value (and so `cloudflare:workers`): only `index.ts` and workerd tests load it.

export interface WorkerHandlers {
  readonly app: App
  readonly mcp: Mcp
  readonly authorize: Authorize
}

const ACCESS_TOKEN_TTL = 3600
const REFRESH_TOKEN_TTL = 2_592_000

/** The provider's handler signature; `makeProvider` returns this, `index.ts` calls `fetch`. */
export interface WorkerFetch {
  readonly fetch: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>
}

const PROTECTED_RESOURCE_METADATA = "/.well-known/oauth-protected-resource"

/**
 * `/mcp` → MCP, `GET|HEAD /` on the MCP host → the static landing page (the MCP handler stays on
 * `/mcp`: the bare origin is not the RFC 8707 resource), `/authorize` and below → the authorize
 * pages, everything else → the REST app.
 */
export const serveWith =
  (mcpResourceUrl: string, { app, mcp, authorize }: WorkerHandlers) =>
  (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
    const { pathname, hostname } = new URL(request.url)
    if (pathname === "/mcp") {
      return mcp.handle(request, env, ctx)
    }
    if (
      pathname === "/" &&
      (request.method === "GET" || request.method === "HEAD") &&
      hostname === new URL(mcpResourceUrl).hostname
    ) {
      return Promise.resolve(mcpLandingResponse(request, mcpResourceUrl))
    }
    if (pathname === "/authorize" || pathname.startsWith("/authorize/")) {
      return authorize.handle(request, env, ctx)
    }
    return app.handler(request)
  }

/**
 * RFC 9728 root form → path form. The provider answers only the metadata URL derived from
 * `resourceMetadata.resource` (`/.well-known/oauth-protected-resource/mcp`, dist/oauth-provider.js
 * `findResourceServerForMetadataUrl`) and 404s the rest of the namespace before any handler runs,
 * so the root form on the MCP host is rewritten to the path form and served by the provider itself:
 * the same JSON, the same `resource`. Other hosts and paths pass through unchanged.
 */
export const aliasRootResourceMetadata =
  (mcpResourceUrl: string) =>
  (request: Request): Request => {
    const url = new URL(request.url)
    const resource = new URL(mcpResourceUrl)
    return url.pathname === PROTECTED_RESOURCE_METADATA &&
      url.hostname === resource.hostname &&
      resource.pathname !== "/"
      ? new Request(
          new URL(`${PROTECTED_RESOURCE_METADATA}${resource.pathname}${url.search}`, url.origin),
          request,
        )
      : request
  }

/**
 * Endpoints are full URLs on `betterAuthUrl` (the api host, where the Better Auth cookie lives):
 * the issuer is the token endpoint's origin and `authorization_servers` defaults to it, so neither
 * is set (S5-T4 Q1/Q2). `authorizeEndpoint` is advertised only; `serveWith` serves it.
 * The provider's `resolveExternalToken` accepts the local dev token as the dev principal's props,
 * so `Bearer <DEV_MCP_TOKEN>` keeps working through the provider (local only).
 */
export const makeProvider = (config: WorkerConfigShape, handlers: WorkerHandlers): WorkerFetch => {
  const serve = serveWith(config.mcpResourceUrl, handlers)
  const alias = aliasRootResourceMetadata(config.mcpResourceUrl)
  const provider = new OAuthProvider<Env>({
    apiRoute: "/mcp",
    apiHandler: { fetch: serve },
    defaultHandler: { fetch: serve },
    authorizeEndpoint: `${config.betterAuthUrl}/authorize`,
    tokenEndpoint: `${config.betterAuthUrl}/oauth/token`,
    clientRegistrationEndpoint: `${config.betterAuthUrl}/oauth/register`,
    scopesSupported: [...MCP_SCOPES],
    // Advertised, not enforced (dist/oauth-provider.d.ts:1132-1143): it becomes the protected-resource
    // metadata's `scopes_supported` and the 401 challenge `scope`, which MCP clients request. Both
    // scopes, so a client asks for write; a read-only grant still works, `server.ts` gates the tools.
    requiredScopes: [...MCP_SCOPES],
    resourceMetadata: { resource: config.mcpResourceUrl },
    accessTokenTTL: ACCESS_TOKEN_TTL,
    refreshTokenTTL: REFRESH_TOKEN_TTL,
    resolveExternalToken: ({ token }) =>
      Promise.resolve(
        Option.getOrNull(
          Option.map(devPrincipalFor(config, token), (principal) => ({
            props: principal,
            audience: config.mcpResourceUrl,
          })),
        ),
      ),
  })
  // `fetch` is a method: called on the instance, never detached.
  return { fetch: (request, env, ctx) => provider.fetch(alias(request), env, ctx) }
}
