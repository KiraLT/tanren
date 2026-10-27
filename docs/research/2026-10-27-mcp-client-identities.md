# MCP client identities (CIMD) for Claude and ChatGPT — spike S1, 2026-10-27

**Question.** What does our OAuth server (`@cloudflare/workers-oauth-provider` 1.2.3) need to accept
Claude's "Use Claude's published identity" mode and ChatGPT, and to mark every other client untrusted?

**Setup.** Scratch Worker (scratchpad `s1/w`, `node_modules` symlinked to `apps/worker`): installed
provider, `clientIdMetadataDocumentEnabled: true`, flags `nodejs_compat` + `global_fetch_strictly_public`,
`defaultHandler` returning `parseAuthRequest` → `describeConsent` + `lookupClient` as JSON.
`wrangler dev --port 8961 --persist-to $(mktemp -d)`, then `GET /authorize?client_id=…` with PKCE.

**Observation.**
- AS metadata with CIMD on: `"client_id_metadata_document_supported":true`, auth methods
  `["client_secret_basic","client_secret_post","none","private_key_jwt"]`. Production today: `false`.
- Claude Code CIMD, `redirect_uri=http://localhost:53123/callback` →
  `{"clientName":"Claude Code","clientDomain":"claude.ai","clientUri":"https://claude.ai","redirectIsLoopback":true}`.
- Same client, `redirect_uri=https://evil.example/callback` → `AuthorizationError: Invalid redirect URI`.
- ChatGPT CIMD (`https://chatgpt.com/oauth/client.json`) → `CimdFetchError … HTTP 403`. A curl from the
  same machine with the library's exact headers gets 200, so chatgpt.com's bot filter blocks the
  local workerd fetch. Production egress was not tested.
- Unknown CIMD (`https://example.com/client.json`) → `CimdFetchError … HTTP 404`.
- A DCR client registered as `client_name:"Claude"` → consent `clientName:"Claude"` with **no** `clientDomain`.

**Library facts (dist/oauth-provider.js).**
- Shape: `isClientIdMetadataDocumentUrl` = `protocol === "https:" && rawPath(clientId) !== ""` (l.1311).
- Fetch: in `getClient`, called on every lookup (l.4697). Without the flag it throws `CIMD is enabled but
  'global_fetch_strictly_public' compatibility flag is not set.` (l.4702). Limits: 10 s timeout, 5 KiB
  max, Cache API cache `workers-oauth-provider:cimd:v1` for the origin's max-age, capped at 7 days (l.1071-1074).
- Validation (l.1364): the document's `client_id` must equal the URL, `client_name` must be non-empty,
  redirect URIs must be safe, no `client_secret`. The token auth method is negotiated.
- Consent (l.2169): `clientDomain: new URL(request.clientId).hostname` only for CIMD clients. The d.ts
  says "Absent for registered clients, whose names are unverified."
- No code changes are needed in the token or registration endpoints, and DCR keeps working.

**Published identities.**
| App | client_id | redirect | source |
|---|---|---|---|
| Claude Code | `https://claude.ai/oauth/claude-code-client-metadata` | `http://localhost/callback`, `http://127.0.0.1/callback` (any port) | fetched, 200 |
| claude.ai / Desktop / mobile ("published identity") | VERIFY: Anthropic hosts it but does not publish the URL | `https://claude.ai/api/mcp/auth_callback` | claude.com/docs/connectors/building/authentication.md |
| ChatGPT | `https://chatgpt.com/oauth/client.json`, or `https://chatgpt.com/oauth/{callback_id}/client.json` | `https://chatgpt.com/connector_platform_oauth_redirect` (or `/connector/oauth/{callback_id}`) | fetched, 200; developers.openai.com/apps-sdk/build/auth |

Claude doc (add-unlisted.md): "Use Claude's published identity … reads Claude's client details from a
Client ID Metadata Document that Anthropic hosts … the server must support this method". Claude uses it
only if the AS metadata has `client_id_metadata_document_supported: true` and `"none"` in the auth methods.

**Answer.** We need two config lines, `clientIdMetadataDocumentEnabled: true` in `provider.ts:88-102`
and `"global_fetch_strictly_public"` in `wrangler.jsonc` `compatibility_flags`. The library does the
fetch, validation, cache and `clientDomain`. To trust a client, check `clientDomain` (set only for CIMD)
against a configured host allowlist (`claude.ai`, `chatgpt.com`). Hosts are better than exact URLs
because Anthropic's hosted URL is unknown and ChatGPT's varies per callback_id. Anything else (DCR, or
CIMD on another host) gets the untrusted warning.

**Confidence.** Observed: library behaviour, Claude Code end to end, both document bodies. Unknown: the
URL of Claude's hosted-app CIMD, and whether the production Worker can fetch chatgpt.com (403 in local
dev). Risk (inferred): `global_fetch_strictly_public` also blocks the Worker's own fetches to private
addresses. Check that the Worker's existing outbound calls (Resend, Strava) are public.

**For Tanren.** Engineer task: two config lines, a `TRUSTED_CLIENT_HOSTS` allowlist, and an
`untrusted` branch in `pages.ts`. After deploy, connect from claude.ai and ChatGPT and confirm the
fetch works in production.
