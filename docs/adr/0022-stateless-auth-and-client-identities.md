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

## Amendments

- 2026-10-27 STLS-F3: writes check the user row exists; reads stay stateless — a deleted user's tokens fail writes immediately (`Authentication.layer`: any method but GET/HEAD/OPTIONS → `UserTokens.tokenGens`, gone → 401; `/sync/pull` is a POST and pays the one read too).
- 2026-10-27 SEC-1 A6: the Better Auth cookie cache (`session_data`, 900 s) is not bound to the session id, so a copy of it replays for up to 900 s after sign-out by design (auth-v2 §4). Writes are still gated by the user-row check (STLS-F3), which refuses them once the account is erased; after a plain sign-out the copy works until it expires. The window is the price of 0 D1 reads per read request.
- 2026-10-27 STLS-F5 (security review A3): refresh tokens rotate, with reuse detection; this supersedes the "Refresh-token rotation … revisit" alternative above. Every successful refresh — app (`POST /api/token/refresh`) and MCP (`grant_type=refresh_token`) — burns the presented token's `jti` in the D1 ledger `refresh_token_burn` (migration 0010: `jti` PK, `userId`, `expiresAt`, `burnedAt`, epoch ms, index on `expiresAt`) with one atomic `INSERT … ON CONFLICT DO NOTHING RETURNING`, then mints a new pair with a fresh `jti`. Order: signature/`aud`/`exp` → generation → (MCP: client and scope checks) → burn → mint, so a refused request never consumes the token. A `jti` already in the ledger and re-sent within 30 s of its first burn (`REUSE_GRACE`, `auth/refreshRotation.ts`; Auth0's "reuse interval") gets a fresh pair from the presented token's verified claims and no bump (logged at info): a client whose response was lost (10 s timeout, failed SecureStore write, suspended app) is not a thief, and the app keeps an unsaved rotated pair in memory and retries the store before any further refresh (STLS-F6). Accepted risk (the Auth0 reuse-interval trade-off): inside the 30 s grace every re-send mints an independent pair, so a replay of a stolen token within that window starts its own refresh chain and goes undetected until the next generation bump (sign-out, revoke, or a later reuse outside the window). A `jti` re-sent later is reuse (a stolen or leaked copy): the user's generation for that family is bumped (`appTokenGen` / `mcpTokenGen`), a warning is logged with the user id and the `jti` prefix, and the request is refused (app 401 `revoked`, MCP 400 `invalid_grant`); every refresh token of the family, the rotated one included, dies with the bump. Access tokens are not checked against the generation (0 D1 reads per read request, unchanged), so an already issued access token lives out its 15 minutes. Retention = the burned token's own lifetime plus the 60 s verification skew (`expiresAt = exp + CLOCK_SKEW_SECONDS`, `retainUntil`; the same rule now sets `oauth_code_use.expiresAt`), because a token verifies until `exp + 60 s` and a purged row would let a burned token burn again: each refresh also deletes rows whose `expiresAt` has passed (one indexed statement, like `oauth_code_use`), so the ledger never holds more than one live lifetime of refreshes; the rows are erased with the account. Cost: 2 more D1 statements per refresh (3 on a re-send: the first burn's `burnedAt` is read). Deploy: additive table, expand only — migrate live D1 (`MIGRATE=1`) before the Worker upload; the previous Worker ignores the table.
