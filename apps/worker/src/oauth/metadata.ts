import { MCP_SCOPES } from "@tanren/shared"
import { Option } from "effect"
import type { WorkerConfigShape } from "../Config"

// Discovery documents of the stateless authorization server (docs/design/auth-v2.md §5).

type MetadataConfig = Pick<WorkerConfigShape, "betterAuthUrl" | "mcpResourceUrl">

export const AUTHORIZATION_SERVER_METADATA = "/.well-known/oauth-authorization-server"
export const PROTECTED_RESOURCE_METADATA = "/.well-known/oauth-protected-resource"

/** RFC 8414 metadata: exactly the §5 field list. The issuer is the `betterAuthUrl` origin. */
export const authorizationServerMetadata = (config: MetadataConfig) => ({
  issuer: new URL(config.betterAuthUrl).origin,
  authorization_endpoint: `${config.betterAuthUrl}/authorize`,
  token_endpoint: `${config.betterAuthUrl}/oauth/token`,
  registration_endpoint: `${config.betterAuthUrl}/oauth/register`,
  scopes_supported: [...MCP_SCOPES],
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  client_id_metadata_document_supported: true,
})

/** RFC 9728 metadata: the same JSON the library served (resource, AS, both scopes, header bearer). */
export const protectedResourceMetadata = (config: MetadataConfig) => ({
  resource: config.mcpResourceUrl,
  authorization_servers: [new URL(config.betterAuthUrl).origin],
  scopes_supported: [...MCP_SCOPES],
  bearer_methods_supported: ["header"],
})

const json = (request: Request, body: unknown): Response =>
  new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      // Public discovery data: any origin may read it.
      "access-control-allow-origin": "*",
    },
  })

/**
 * The discovery route, or `None` when `request` is not a discovery URL. The protected-resource
 * document is served on the MCP host only, at its path form (`…/oauth-protected-resource/mcp`) and at
 * the root form (the alias `provider.ts` `aliasRootResourceMetadata` used to rewrite).
 */
export const metadataRoute =
  (config: MetadataConfig) =>
  (request: Request): Option.Option<Response> => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return Option.none()
    }
    const url = new URL(request.url)
    const resource = new URL(config.mcpResourceUrl)
    if (url.pathname === AUTHORIZATION_SERVER_METADATA) {
      return Option.some(json(request, authorizationServerMetadata(config)))
    }
    const resourcePath =
      resource.pathname === "/"
        ? PROTECTED_RESOURCE_METADATA
        : `${PROTECTED_RESOURCE_METADATA}${resource.pathname}`
    return url.hostname === resource.hostname &&
      (url.pathname === resourcePath || url.pathname === PROTECTED_RESOURCE_METADATA)
      ? Option.some(json(request, protectedResourceMetadata(config)))
      : Option.none()
  }
