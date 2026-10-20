# workers-oauth-provider around stateless createMcpHandler (2026-10-20)

**Question.** Can `@cloudflare/workers-oauth-provider` (latest) wrap a stateless `createMcpHandler`
(`agents/mcp/server`) under local `wrangler dev`, with `/mcp` bearer-protected and the provider serving
`/authorize`, `/token`, `/register`? What do Claude clients need (DCR, PKCE, scopes)? Where do
authorize-time `props` show up? Does it start with no DO and no module-scope I/O?

**Setup** (scratch project, not the repo:
`/private/tmp/claude-501/-Users-lukas-Documents-Personal-tanren/2f72436e-0cd5-4397-8737-fd4699a2ee88/scratchpad/oauth-spike`)
```
npm i wrangler@4.151.2 agents@0.28.1 @modelcontextprotocol/server@2.3.1 @cloudflare/workers-oauth-provider@1.2.3
wrangler.jsonc: compatibility_date 2026-10-19, flags [nodejs_compat], kv_namespaces [{binding: OAUTH_KV}]
new OAuthProvider({ apiRoute: "/mcp", apiHandler: { fetch: createMcpHandler(factory) }, defaultHandler,
  authorizeEndpoint: "/authorize", tokenEndpoint: "/token", clientRegistrationEndpoint: "/register",
  scopesSupported: ["mcp"], requiredScopes: ["mcp"],
  resourceMetadata: { resource: "http://localhost:8799/mcp" } })
defaultHandler /authorize: env.OAUTH_PROVIDER.parseAuthRequest(req) ->
  completeAuthorization({ request, userId, metadata: {}, scope, props: { userId } }) -> 302 redirectTo
tool: getMcpAuthContext()?.props   (agents/mcp/server)
```

**Observation** (curl against `wrangler dev --port 8799`)
```
no resourceMetadata -> workerd fails to start: "resourceMetadata.resource is required and must be an
  absolute HTTPS URI without a fragment (http is accepted only on a loopback host)"
with it            -> env.OAUTH_KV KV Namespace local; Ready on http://localhost:8799 (no DO binding)
                      WARNING CIMD disabled: add compat flag global_fetch_strictly_public to enable
POST /mcp no token -> 401  WWW-Authenticate: Bearer realm="OAuth",
                      resource_metadata=".../.well-known/oauth-protected-resource/mcp", scope="mcp"
/.well-known/oauth-protected-resource/mcp -> {resource:".../mcp", authorization_servers:[origin],
                      scopes_supported:["mcp"]}   (root /.well-known/oauth-protected-resource -> 404)
/.well-known/oauth-authorization-server -> registration_endpoint, code_challenge_methods_supported:["S256"],
                      token_endpoint_auth_methods_supported:[client_secret_basic, client_secret_post, none],
                      grant_types [authorization_code, refresh_token], client_id_metadata_document_supported:false
POST /register {token_endpoint_auth_method:"none", redirect_uris:[http://localhost:33418/callback]} -> client_id
/authorize without code_challenge -> AuthorizationError: Public clients must use PKCE (uncaught -> 500)
/authorize S256 + resource -> 302 callback?code=...&state=s1&iss=http://localhost:8799
POST /token + code_verifier -> {token_type:bearer, expires_in:3600, scope:"mcp", resource:".../mcp", refresh_token}
POST /mcp Bearer: initialize -> 200; tools/call whoami -> {"userId":"user-123"}; bad token -> 401
```
Relied on: oauth-provider.js:1968 `context.props = validation.props;`, agents handler-stateless js:302
(`authContext ?? verified props ?? workerCtx.props`). 1.2.3 throws on `allowPlainPKCE`/`allowImplicitFlow`.

**Answer.** (a) Yes. (c) Yes: one bundle, no DO, no module-scope I/O. (b) Turn DCR on (`/register`;
public clients are allowed by default). PKCE S256 is mandatory. Scopes are our choice (advertised,
not enforced). Authorize-time `props` show up as `ctx.props` and, inside tools, as
`getMcpAuthContext().props`. Confidence: **observed** for the whole flow with curl. **Inferred**
for real Claude Code and Claude app clients.

**What it means for Tanren (step 5).**
- `resourceMetadata.resource` is required and per environment (`https://mcp.tanren.me/mcp` in
  prod, `http://localhost:8787/mcp` locally). The constructor runs at module scope, so the value
  comes from a constant or from `import { env } from "cloudflare:workers"` (inferred).
- `McpAuth.layerOAuth` resolves `userId` from `getMcpAuthContext().props`. Set `props: { userId }`
  in `completeAuthorization` after checking the Better Auth session.
- `/authorize` must catch `parseAuthRequest` errors (OAuth error redirect or 400, not a 500).
- Add an `OAUTH_KV` KV binding; `global_fetch_strictly_public` flag only if we want CIMD clients.

**Not tested.** Real `claude mcp add --transport http` / Claude app connector round trip (needs a
browser login); refresh rotation; revocation; CIMD; custom domain; coexistence with REST/Better Auth.
