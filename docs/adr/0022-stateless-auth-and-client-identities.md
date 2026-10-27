# ADR-0022 — Stateless auth (JWT login + JWT MCP OAuth) and known MCP client identities

Status: accepted (Lead delegation, plan Amendment 3; owner instructions in Amendments 16 and 17,
2026-10-27). Design: `docs/design/auth-v2.md`. Tasks: `docs/tasks/v5-auth.md`.
Evidence: `docs/research/2026-10-27-stateless-sessions.md` (S2), `2026-10-27-mcp-client-identities.md` (S1).

## Context

- Login: Better Auth 1.7.11 on D1; every API request resolves the session with one D1 read
  (`SessionsLive.ts` → `auth.api.getSession`). Native sends `Authorization: Bearer <session.token>`.
- MCP: `@cloudflare/workers-oauth-provider` 1.2.3 keeps clients, grants, access tokens, consent
  transactions and replay keys in KV `OAUTH_KV` (S2 §4; the binding is mandatory, d.ts:1889).
  Production advertises `client_id_metadata_document_supported: false`, so the Claude app's
  "published identity" mode (CIMD) fails (Amendment 16).
- Owner: no KV, a secret-signed JWT for both login and OAuth, "fully stateless" (Amendment 17).
  Lead's concern: stateless tokens cannot be revoked before expiry.
- S2 proved: `session.cookieCache { enabled, strategy: "jwt" }` signs session+user with
  `BETTER_AUTH_SECRET` (HS256) and answers get-session with 0 D1 reads; the `jwt` plugin is
  asymmetric with a `jwks` table (wrong tool); the bearer plugin alone still reads D1.

## Decision

1. **Web login = Better Auth cookie cache JWT.** `session.cookieCache { enabled: true, strategy:
   "jwt", maxAge: 900 }`, `session.expiresIn` 30 d. Per request the Worker verifies the signed
   `session_data` cookie; no D1 read within 15 min. The session row stays (one write per sign-in,
   one read per 15 min): it is the revocation point — sign-out deletes it, so a replayed cookie
   dies within `maxAge`. No client change on web.
2. **Native login and MCP = Tanren JWTs** minted by one Effect service `Tokens`
   (`apps/worker/src/auth/Tokens.ts`, `jose` HS256). Access token 15 min, refresh token 30 d, claims
   `{ iss, sub, aud, scope, gen, jti, iat, exp }`. `POST /api/native/session` returns the pair
   instead of the Better Auth session token; `Sessions.current` accepts `Bearer <access JWT>`
   first, then the cookie path. `POST /api/token/refresh` checks `gen` against D1 and re-issues.
3. **Revocation = per-user token generations, checked at refresh, not per request** (Lead's
   default, validated): `user.appTokenGen` and `user.mcpTokenGen` (two integers, so disconnecting
   Claude does not sign the phone out). Sign-out / "disconnect all AI clients" bumps the integer;
   refresh fails at once, access tokens die within 15 min. Owner-visible latency ≤ 15 min, same
   as the web cookie cache. The alternative (one D1 read per request) is what the owner removed.
4. **MCP OAuth server rebuilt stateless in Effect** behind the existing `OAuthApi` port
   (`authorize.ts` and the pages stay): authorization code = 60 s JWT bound to PKCE S256,
   client_id and redirect_uri; access/refresh = JWTs with `aud = MCP_RESOURCE_URL`; consent
   handle = JWT + `__Host-` double-submit cookie; dynamic registration = the client's metadata
   signed into the `client_id` itself (stateless DCR); CIMD clients fetched and validated per
   authorization (Cache API, not state). One D1 table `oauth_code_use(jti, expiresAt)` makes codes
   single-use — an anti-replay log purged on every exchange, not a session store; the owner's
   "fully stateless" is read as "no per-request session state", and this is the one exception,
   recorded here. `OAUTH_KV` and `@cloudflare/workers-oauth-provider` are retired at cutover;
   existing connectors re-authorize once.
5. **Identities.** Trust is `clientDomain ∈ TRUSTED_CLIENT_HOSTS = ["claude.ai", "claude.com", "chatgpt.com"]` (`oauth/knownClients.ts`, IDENT-1, in flight)
   (CIMD only — DCR names are self-asserted, S1). Trusted: name, verified-domain badge, the
   document's `logo_uri` (https). Everything else: no logo, the untrusted warning block.
   **IDENT-1 ships first on the current library** (two config lines + allowlist + warning) so the
   owner can connect the Claude app today; the stateless rebuild carries the logic over unchanged.
6. **Secret.** No `SECRET_KEY`: `BETTER_AUTH_SECRET` already exists in production ("anything
   similar"). `Tokens` derives sub-keys with HKDF-SHA256 (`tanren/jwt/app/v1`, `tanren/jwt/mcp/v1`,
   `tanren/oauth/client/v1`), `kid` = first 8 hex of SHA-256(subkey). Rotating the secret
   invalidates every token and cookie (users sign in again); no second secret, no owner step.

## Consequences

- Zero D1 reads on the hot path (REST with a fresh cookie/JWT, every `/mcp` call); D1 reads only
  at sign-in, refresh (≤ 1 per 15 min per device), code exchange and the 15-min cookie refresh.
- Revocation is bounded at 15 min; "sign out everywhere" and "disconnect AI clients" are one
  `UPDATE user`. No list of connected clients (nothing is stored): Settings shows a single
  "Disconnect all AI clients" action.
- Refresh tokens are not rotated (reuse detection needs state); they are gen-bound and 30 d.
- Migration: 0006 adds two columns and one table; `OAUTH_KV` binding removed; connectors
  re-authorize once; the Claude Code CLI keeps working through stateless DCR.
- New dependency `jose` (already in the store via better-auth); `global_fetch_strictly_public`
  compatibility flag (CIMD fetch) — the Worker's outbound calls (Resend, Strava, CIMD) are public.

## Alternatives considered

- Keep `workers-oauth-provider` + KV, JWT only for login: least work; rejected — the owner named
  KV explicitly and the library cannot run without it.
- Better Auth `jwt` plugin for native: asymmetric keys in a `jwks` table, JWKS endpoint; more
  moving parts than one HS256 service, and not usable for the OAuth tokens.
- Native on Better Auth cookie cache (send `session_data` as a header): needs a Worker header→cookie
  adapter, a refresh endpoint anyway, and ties native to cookie internals; rejected for one `Tokens`.
- Per-request generation check (true instant revocation): one D1 read per request — exactly the
  cost the owner asked to remove. Not decided here: Durable Object / Cache-API gen caching.
- Refresh-token rotation with a D1 `refresh_family` table: more state for a single-user app; revisit
  if the app ever has more than the owner.
