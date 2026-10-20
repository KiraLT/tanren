# ADR-0011: MCP authorization with `workers-oauth-provider` in combined mode, authorization server on the API host

Date: 2026-10-20 · Status: **accepted** (Lead decision under owner delegation, 2026-10-20; plan Amendment 3) · Step 5 · Author: architect (design: `docs/design/oauth.md`; facts: `docs/research/2026-10-20-oauth-provider-spike.md`)

## Context

`docs/plan.md` names `workers-oauth-provider` for MCP auth and ADR-0010 made `/mcp` a stateless
`createMcpHandler` route in the one `tanren` Worker. `@cloudflare/workers-oauth-provider` went v1
on 2026-10-01 (installed target 1.2.3): it kept the combined `OAuthProvider` (authorization server
and protected resource in one Worker) and added a split API (`OAuthAuthorizationServer` +
`OAuthResourceServer` over Service Bindings); v1 requires `resourceMetadata.resource`. The MCP
2026-07-28 authorization spec is what the Claude app and Claude Code speak: RFC 9728 discovery from
the 401 challenge, dynamic client registration, PKCE S256. S5-SPIKE ran all of that under
`wrangler dev` with our compat date/flags and a local KV binding: no Durable Object, DCR on by
default, PKCE S256 mandatory, scopes advertised but not enforced, authorize-time `props` reach the
API handler as `ctx.props`. Two constraints shape the rest: Better Auth's session cookie lives on the
`BETTER_AUTH_URL` host (`api.tanren.me`), and the plan puts the MCP resource on `mcp.tanren.me`.

## Decision

1. **Combined `OAuthProvider`** in the existing `tanren` Worker, KV-backed (`OAUTH_KV`), no Durable
   Object, no split API. The provider is the Worker's default export; `apiHandler` and
   `defaultHandler` are one plain `{ fetch }` dispatcher (`/mcp` → MCP route, `/authorize*` →
   authorize flow, everything else → the HttpApi app). It is the second allowed non-Effect adapter
   next to the MCP handler module (ADR-0010).
2. **Hosts.** The authorization server (`/authorize`, `/oauth/token`, `/oauth/register`,
   `/.well-known/oauth-authorization-server`) is advertised as full URLs on the `BETTER_AUTH_URL`
   host; the resource is the new var `MCP_RESOURCE_URL` (`https://mcp.tanren.me/mcp`; locally both
   are `http://localhost:8787`). Fallback if the provider ties the issuer to the resource host:
   path endpoints on `mcp.tanren.me` plus Better Auth cross-subdomain cookies (oauth.md §1).
3. **Identity.** The grant's encrypted `props` are `{ userId, scopes }`, decoded with the shared
   `OAuthProps` schema; `McpAuth.resolve(request, ctx)` returns an `McpPrincipal`; `layerLive` tries
   OAuth props, then the local dev bearer token (still refused outside `local` by `Config.ts`).
   Scopes `tanren:read` / `tanren:write`: write tools are registered only for a `tanren:write` grant.
4. **Login and consent.** The login page reuses the Better Auth magic link server-side with
   `callbackURL` = the original `/authorize?…` URL; consent uses the provider's v1 consent helpers
   (single-use handle cookie, confused-deputy protection); no hand-rolled CSRF or sessions.

## Consequences

- One new var (`MCP_RESOURCE_URL`), one KV binding, one dependency; production needs the
  `env.production` ids and the secrets `BETTER_AUTH_SECRET`, `RESEND_API_KEY` (`docs/design/deploy.md`).
- `src/index.ts` changes shape (provider as default export) but the REST app, sync and read tools are
  untouched; the dev token keeps existing Claude Code setups and workerd tests working.
- `/authorize` builds a second lazy Better Auth instance unless `makeApp` can share its runtime
  (VERIFY in S5-T4; harmless either way).
- `/authorize` must catch `parseAuthRequest` failures (`AuthorizationError` → redirect or 400 page),
  or the provider answers 500.
- The Claude app connector flow (DCR without a pre-registered client, the browser login) is an
  **owner-verified step**: no agent can run it; Claude Code against localhost is the agents' proof.
- CIMD stays off (needs the `global_fetch_strictly_public` compat flag); revisit if a client requires it.

## Alternatives considered

- **Split API, two Workers** (AS + resource server over a Service Binding): second deploy and
  config, no benefit for a single-user app whose AS and resource are the same code. Rejected.
- **Cloudflare Access or a third-party IdP** (GitHub, Google) in front of the provider: another
  account and consent hop; Better Auth already holds the user table. Rejected.
- **Bearer API keys instead of OAuth**: the Claude app's custom connectors require OAuth. Rejected.
- **Whole flow on `mcp.tanren.me` with cross-subdomain cookies**: works, but widens the cookie
  scope to every subdomain; kept only as the fallback in Decision 2.

Not decided here: writes to non-active (draft) plans and `delete_*` tools, refresh-token idle expiry,
rate limiting on `/authorize/login` (oauth.md §7).
