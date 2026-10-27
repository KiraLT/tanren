import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { authorizationServerMetadata, metadataRoute, protectedResourceMetadata } from "./metadata"

const LOCAL = {
  betterAuthUrl: "http://localhost:8787",
  mcpResourceUrl: "http://localhost:8787/mcp",
}
const PROD = { betterAuthUrl: "https://api.tanren.me", mcpResourceUrl: "https://mcp.tanren.me/mcp" }

const body = async (response: Option.Option<Response>) =>
  Option.match(response, { onNone: () => Promise.resolve(null), onSome: (r) => r.json() })

describe("authorization-server metadata", () => {
  it("has exactly the design §5 field list", () => {
    expect(authorizationServerMetadata(PROD)).toEqual({
      issuer: "https://api.tanren.me",
      authorization_endpoint: "https://api.tanren.me/authorize",
      token_endpoint: "https://api.tanren.me/oauth/token",
      registration_endpoint: "https://api.tanren.me/oauth/register",
      scopes_supported: ["tanren:read", "tanren:write"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      client_id_metadata_document_supported: true,
    })
  })

  it("is served at /.well-known/oauth-authorization-server", async () => {
    const response = metadataRoute(PROD)(
      new Request("https://api.tanren.me/.well-known/oauth-authorization-server"),
    )
    expect(await body(response)).toEqual(authorizationServerMetadata(PROD))
  })
})

describe("protected-resource metadata", () => {
  it("is the JSON the library served", () => {
    expect(protectedResourceMetadata(LOCAL)).toEqual({
      resource: "http://localhost:8787/mcp",
      authorization_servers: ["http://localhost:8787"],
      scopes_supported: ["tanren:read", "tanren:write"],
      bearer_methods_supported: ["header"],
    })
  })

  it("root and path forms on the MCP host answer the same document", async () => {
    const route = metadataRoute(PROD)
    const root = route(new Request("https://mcp.tanren.me/.well-known/oauth-protected-resource"))
    const path = route(
      new Request("https://mcp.tanren.me/.well-known/oauth-protected-resource/mcp"),
    )
    expect(await body(root)).toEqual(protectedResourceMetadata(PROD))
    expect(await body(path)).toEqual(protectedResourceMetadata(PROD))
  })

  it("is not served on another host, at another path, or for POST", () => {
    const route = metadataRoute(PROD)
    expect(
      Option.isNone(
        route(new Request("https://api.tanren.me/.well-known/oauth-protected-resource")),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        route(new Request("https://mcp.tanren.me/.well-known/oauth-protected-resource/other")),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        route(
          new Request("https://mcp.tanren.me/.well-known/oauth-protected-resource", {
            method: "POST",
          }),
        ),
      ),
    ).toBe(true)
  })
})
