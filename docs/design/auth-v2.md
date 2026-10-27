# Auth v2 — stateless login + stateless MCP OAuth + known client identities

Normative for `docs/tasks/v5-auth.md`. ADR-0022. Evidence: S1 `docs/research/2026-10-27-mcp-client-identities.md`,
S2 `docs/research/2026-10-27-stateless-sessions.md`. Every `VERIFY:` is checked by the task's engineer against
installed types; none blocks the design. Written 2026-10-27 12:45.

## 1. Shape (what verifies what, per request)

| Caller | Credential | Verified by | D1 reads |
| --- | --- | --- | --- |
| Web app (tanren.me) | Better Auth cookies `session_token` + `session_data` (HS256 JWT, `cookieCache`) | Better Auth `getSession` through `SessionsLive` (unchanged call) | 0 within `maxAge` 900 s; 1 after (row read, cookie re-issued) |
| Native app | `Authorization: Bearer <app access JWT>` | `Tokens.verifyApp` in `SessionsLive` before the cookie path | 0 |
| MCP client | `Authorization: Bearer <mcp access JWT>` | `Tokens.verifyMcp` in `McpAuth.layerJwt` (replaces `layerOAuth`) | 0 |
| Refresh (native, MCP) | refresh JWT | `Tokens.verify*Refresh` + `UserTokens.tokenGens(userId)` | 1 |
| Code exchange | code JWT + PKCE verifier | `StatelessOAuth.token` + `oauth_code_use` insert | 1 write (+ purge) |

Writers of each state (grep-verified 12:40): Better Auth session row — `nativeAuthRoutes.ts` `instance.api.signInMagicLink`
and the web magic-link verify (`authRoutes.ts` `/api/auth/*`); native token today — `nativeAuthRoutes.ts`
`instance.api.verifyOneTimeToken` → `token: verified.session.token` (STLS-3 replaces this write); `user.appTokenGen` /
`user.mcpTokenGen` — migration 0006 default 0, bumped only by `UserTokens.bumpAppTokenGen` / `bumpMcpTokenGen` (STLS-1 adds them; STLS-3 calls them).

## 2. Secrets and keys (`apps/worker/src/auth/Tokens.ts`)

- Input: `config.betterAuthSecret` (exists; `Config.ts` `BETTER_AUTH_SECRET: Schema.RedactedFromValue`). No `SECRET_KEY`.
- Sub-keys via WebCrypto HKDF-SHA256, salt empty, info strings: `tanren/jwt/app/v1`, `tanren/jwt/mcp/v1`,
  `tanren/oauth/client/v1`, `tanren/oauth/consent/v1`. 32-byte keys, HS256 (`jose` `SignJWT` / `jwtVerify`,
  `jose` 6.2.12 added to the catalog and `apps/worker/package.json`; VERIFY: `jose` HKDF is not needed — use
  `crypto.subtle.deriveBits`). `kid` = first 8 hex chars of SHA-256(subkey), set in the header, checked on verify.
- Rotation: changing `BETTER_AUTH_SECRET` invalidates all tokens and cookies; documented in `deploy.md` §3. No dual keys yet.

## 3. Token formats (all compact JWS, HS256, `typ: "JWT"`)

| Token | `aud` | `exp` | Other claims | Constant |
| --- | --- | --- | --- | --- |
| App access | `tanren:app` | 900 s | `sub: UserId`, `gen: appTokenGen`, `jti` | `APP_ACCESS_TTL_SECONDS` |
| App refresh | `tanren:app:refresh` | 30 d | `sub`, `gen`, `jti` | `APP_REFRESH_TTL_SECONDS` |
| MCP access | `MCP_RESOURCE_URL` | 900 s | `sub`, `scope: "tanren:read tanren:write"`, `client_id`, `gen: mcpTokenGen`, `jti` | `MCP_ACCESS_TTL_SECONDS` |
| MCP refresh | `tanren:mcp:refresh` | 30 d | `sub`, `scope`, `client_id`, `gen`, `jti` | `MCP_REFRESH_TTL_SECONDS` |
| Auth code | `tanren:oauth:code` | 60 s | `sub`, `scope`, `client_id`, `redirect_uri`, `code_challenge` (S256 only), `gen`, `jti` | `CODE_TTL_SECONDS` |
| Consent handle | `tanren:oauth:consent` | 600 s | the parsed `AuthRequest` fields + `nonce` (32 random bytes, base64url) | `CONSENT_TTL_SECONDS` |
| DCR client id | `tanren:oauth:client` | none | `redirect_uris: string[]`, `client_name`, `token_endpoint_auth_method: "none"` | — |

`iss` = `config.betterAuthUrl` everywhere. `jti` = 16 random bytes base64url. All times from `DateTime.now` (Effect), so
tests use `TestClock`. Schemas in `packages/shared/src/auth.ts` (new file, pure shapes, no `jose`): `AppTokenPair`
`{ accessToken: Schema.NonEmptyString, refreshToken: Schema.NonEmptyString, expiresAt: Timestamp }` (`Timestamp`:
`grep -n "export const Timestamp" packages/shared/src/common.ts`), `RefreshRequest { refreshToken }`,
`TokenRejected` (`Schema.TaggedError`, 401, `reason: "expired" | "revoked" | "invalid"`). `OAuthProps` (`mcp.ts:198`)
stays the principal shape; `McpScope`/`MCP_SCOPES` (`mcp.ts:194-195`) unchanged.

`Tokens` service shape (Effect, `Context.Service`, `static layer: Layer<Tokens, never, WorkerConfig>`):
`issueAppPair(userId, gen)`, `verifyApp(token) → Effect<{ userId, gen }, TokenRejected>`, `verifyAppRefresh`,
`issueMcpPair({ userId, scopes, clientId, gen })`, `verifyMcp(token) → Effect<McpPrincipal & { gen }, TokenRejected>`,
`verifyMcpRefresh`, `issueCode(...)`/`verifyCode`, `issueConsent`/`verifyConsent`, `issueClientId`/`verifyClientId`.
Verification order: signature + `kid` → `exp`/`iat` (60 s skew) → `aud` exact → `iss` exact → claim schema decode.

## 4. Login endpoints (`apps/worker/src/auth/`)

- Better Auth options (`BetterAuth.ts`): `session: { expiresIn: 2_592_000, updateAge: 86_400, cookieCache: { enabled: true,
  strategy: "jwt", maxAge: 900 } }` (S2 §1; VERIFY option names in `better-auth/dist/types/*.d.mts` `cookieCache?:`).
- `POST /api/native/session` (exists, `nativeAuthRoutes.ts`): after `verifyOneTimeToken`, read `appTokenGen` for
  `verified.user.id` and answer `NativeSessionResponse` v2 = `{ userId, access: AppTokenPair }` — `packages/shared/src/nativeAuth.ts`
  `NativeSessionResponse` changes (`token: SessionToken` removed; `SessionToken` brand stays for the mobile store until STLS-5
  deletes it); test assertions that pin `token`/`expiresAt` in `nativeAuthRoutes.*test.ts` and `apps/mobile/src/services/
  NativeSession.test.ts` are listed in the sheet's Assumes. The Better Auth session row created by the magic link stays (web
  cookie holder; expires in 30 d).
- `POST /api/token/refresh` body `RefreshRequest`, no cookie, no CSRF surface (bearer-style body only): `verifyAppRefresh` →
  `UserTokens.tokenGens(sub)` → `gen` equal else `TokenRejected("revoked")` → new `AppTokenPair` (new refresh too, same
  30 d from now; not rotated-with-detection, ADR §4). 401 on any rejection, `Cache-Control: no-store`.
- `POST /api/auth/sign-out` (Better Auth, web) unchanged. Native sign-out = `POST /api/token/revoke` (Bearer access JWT)
  → `bumpAppTokenGen(userId)`; mobile `Account.signOut` calls it on native instead of `/api/auth/sign-out`.
- `SessionsLive.current(headers)`: if `Authorization: Bearer` parses as a JWT (two dots) → `Tokens.verifyApp` → `Some(userId)`
  or `None` (never 503); else the existing `getSession` path. Order matters: Better Auth's bearer plugin would otherwise try
  the JWT as a signed session token (`bearer/index.mjs` `token.includes(".")` branch) and read D1.

## 5. MCP OAuth server (`apps/worker/src/oauth/`, stateless)

Routes (all on `betterAuthUrl` host; `serveWith` in `provider.ts` becomes the router, the `OAuthProvider` instance is removed):

| Route | Handler | Notes |
| --- | --- | --- |
| `GET /.well-known/oauth-authorization-server` | `metadata.ts` | `issuer`, `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `scopes_supported: MCP_SCOPES`, `response_types_supported: ["code"]`, `grant_types_supported: ["authorization_code","refresh_token"]`, `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported: ["none"]`, `client_id_metadata_document_supported: true` |
| `GET /.well-known/oauth-protected-resource[/mcp]` on the MCP host | `metadata.ts` | same JSON as today (`aliasRootResourceMetadata` logic kept) |
| `GET /authorize`, `POST /authorize/{login,approve,deny}` | `authorize.ts` (unchanged) over `OAuthApi.layerStateless` | consent handle = JWT; binding cookie `__Host-tanren-consent=<nonce>` (Secure, HttpOnly, SameSite=Lax, Path=/, Max-Age 600) |
| `POST /oauth/token` | `token.ts` | `grant_type=authorization_code`: verifyCode → PKCE S256(verifier)==challenge → `client_id`, `redirect_uri` equal → `INSERT oauth_code_use(jti, expiresAt)` (unique violation → `invalid_grant`) → `DELETE FROM oauth_code_use WHERE expiresAt < now` → `issueMcpPair`. `grant_type=refresh_token`: verifyMcpRefresh → `tokenGens` → gen equal → new pair. Errors RFC 6749 §5.2 JSON, 400/401, `no-store` |
| `POST /oauth/register` | `clients.ts` | stateless DCR: validate `redirect_uris` (§7), `client_name` ≤ 64 chars, answer `client_id = issueClientId(...)`, `token_endpoint_auth_method: "none"`; no secret, no storage |
| `/mcp` | `McpRoute.ts` with `McpAuth.layerJwt` | `Tokens.verifyMcp` → `McpPrincipal`; 401 `challenge()` unchanged |

`OAuthApi.layerStateless` implements the existing `OAuthApiShape` (`parseAuthRequest`, `describeConsent`, `beginConsent`,
`approveConsent`, `denyConsent`, `completeAuthorization`; `OAuthApi.ts:61-83`) so `authorize.ts` and `authorize.test.ts`'s
`layerFake` keep working. `ConsentDescription` becomes a local type in `oauth/consent.ts` with the same fields as the library's
(`clientId, clientName, clientDomain?, clientUri?, logoUri?, redirectUri, redirectHost, redirectIsLoopback, scope`) plus
`trusted: boolean` (from `knownClients.ts`, IDENT-1 — carried over unchanged). Client resolution (`clients.ts`):
`client_id` is an https URL with a path → CIMD (fetch, §7) ; else `verifyClientId` → DCR client; else `invalid_client`.

## 6. Identities (IDENT-1, in flight; the rebuild reuses `knownClients.ts` as is)

`TRUSTED_CLIENT_HOSTS = ["claude.ai", "claude.com", "chatgpt.com"]`; `trusted = clientDomain !== undefined &&
TRUSTED_CLIENT_HOSTS.includes(clientDomain)` (host equality, not suffix: `claude.ai.evil.com` is untrusted). Trusted row:
name, "Verified: <domain>" badge, `logo_uri` only if `https:` and trusted (`<img referrerpolicy="no-referrer" width=40
height=40>`). Untrusted: no logo, block "Unknown app — Tanren cannot verify who built <name>. Only continue if you started this
from an app you trust." + the primary button reads "Allow anyway". Colours stay the page's inline CSS (`.warn #8a4b00`);
Forge alignment is a later polish item. Known ids (S1): Claude Code `https://claude.ai/oauth/claude-code-client-metadata`,
ChatGPT `https://chatgpt.com/oauth/client.json` (+ per-callback variants), claude.ai app document URL unconfirmed
(redirect `https://claude.ai/api/mcp/auth_callback`) — hence hosts, not URLs.

## 7. Security checklist (architect.md), answered

- Cookie-bearing GET that mints a secret: none. `GET /authorize` only renders; the code is minted on `POST /authorize/approve`
  with `handle` (JWT) whose `nonce` must equal the `__Host-tanren-consent` cookie (double submit) and whose `sub`
  must equal the signed-in user (`Sessions.current`). `/api/token/refresh`, `/oauth/token` carry the secret in the body.
- Redirect target: `redirect_uri` must equal (string equality after canonicalisation) one of the client's URIs — CIMD
  document `redirect_uris` or the DCR JWT's. Accepted shapes: `https:` any host, or `http:` with host `localhost` /
  `127.0.0.1` / `[::1]` (any port); never other `http:`; no fragments; no userinfo. Production prefixes for trusted
  clients: `https://claude.ai/api/mcp/auth_callback`, `https://chatgpt.com/connector_platform_oauth_redirect`,
  `https://chatgpt.com/connector/oauth/` (S1).
- Canonicalisation: `new URL(raw).href === raw` for `client_id` and every `redirect_uri`; CIMD document `client_id` must equal
  the request's `client_id` byte for byte; `clientDomain = new URL(client_id).hostname`. Bypass tests (`clients.test.ts`):
  `https://claude.ai/../x`, `https://claude.ai/%2e%2e/x`, `https://claude.ai.evil.com/c.json`, `https://evil.com/claude.ai`,
  `https://claude.ai@evil.com/c.json`, `https://claude.ai:abc/c.json`, `http://claude.ai/c.json`.
- CIMD fetch: https only, redirect `manual` (no follow), 5 s timeout, 5 KiB cap, `content-type` JSON, result cached in
  `caches.default` for `max-age` ≤ 1 h (shorter than the library's 7 d so a revoked identity propagates), fetch failures →
  `invalid_client` (no stack to the client). `global_fetch_strictly_public` blocks private targets.
- Token exposure: `Cache-Control: no-store` on `/oauth/token`, `/api/token/*`, `/api/native/session`, all authorize pages
  (`html()` helper has it); `Referrer-Policy: no-referrer` meta on pages (exists); codes travel in the 302 `Location` only
  (60 s, PKCE-bound); no token or code in logs — log `jti` prefixes only (`Effect.logInfo` with `jti.slice(0, 8)`).
- Binding before consume: code → signature, `exp`, `aud`, then `client_id` & `redirect_uri` equality, then PKCE, then the
  `oauth_code_use` insert (the burn is last, so a failed check never consumes). HTTPS only outside `local`
  (`Config.ts` `checkResourceUrl` already gates `http:`).
- Login CSRF (native): PKCE in `/api/native/session` unchanged (`nativeAuthRoutes.ts`); the refresh and revoke endpoints
  accept no cookie, so a cross-site form cannot drive them.
- Replay / revocation bounds: access 15 min; refresh and code gen-bound; web cookie `maxAge` 15 min; stated in ADR §3.

## 8. Data (migration `packages/db/migrations/0006_token_generations.sql`)

```sql
ALTER TABLE "user" ADD COLUMN "appTokenGen" integer NOT NULL DEFAULT 0;
ALTER TABLE "user" ADD COLUMN "mcpTokenGen" integer NOT NULL DEFAULT 0;
CREATE TABLE "oauth_code_use" ("jti" text PRIMARY KEY NOT NULL, "expiresAt" integer NOT NULL);
```
Drizzle: `schema/auth.ts` `user` gains the two columns; new table `oauthCodeUse` in `schema/auth.ts` (no `userId`: it is not
user data; `parity.test.ts` VERIFY: the parity test may require `userId` on every table — if so, add `userId text NOT NULL`
and the rule stays). `UserTokens` (new, `packages/db/src/repositories/UserTokens.ts`; no user repo exists today — `ls packages/db/src/repositories`):
`tokenGens(userId) → Effect<{ app: number, mcp: number }, UserNotFound>`,
`bumpAppTokenGen(userId)`, `bumpMcpTokenGen(userId)`; `OAuthCodeUseRepo.burn(jti, expiresAt) → Effect<boolean>` (false on
duplicate) and `purge(now)`. `apps/worker/src/testing/workerdSetup.ts` lists 0006.

## 9. Mobile (`apps/mobile/src/services/`)

- `NativeSession`: stores `AppTokenPair` (SecureStore keys `tanren.access`, `tanren.refresh`, `tanren.expiresAt`); `token`
  returns the access token when `expiresAt - 30 s > now`, else refreshes (`POST /api/token/refresh`) once, stores, returns;
  a 401 from refresh → `clear` and signed-out state. `complete(code)` stores the v2 response. `withAuth` header adder
  (`NativeSession.ts` "Adds `Authorization: Bearer`") unchanged in shape.
- `Account.signOut`: native → `POST /api/token/revoke` then `clear`; web unchanged.
- Settings → Account section: new row "Disconnect AI clients" (`ListRow`, `tone="danger"`?, check `apps/mobile/src/ui`
  props) → `POST /api/token/revoke-mcp` → toast "Claude and other apps must reconnect". Copy in `settingsCopy.ts`.

## 10. Config, bindings, deploy

- `Env.ts`: remove `OAUTH_KV`, `OAUTH_PROVIDER`; `EnvVars` type simplifies. `wrangler.jsonc` / `wrangler.test.jsonc`: drop
  `kv_namespaces`; keep `global_fetch_strictly_public` (IDENT-1). `package.json`: remove `@cloudflare/workers-oauth-provider`,
  add `jose` (catalog `6.2.12`). `deploy.md` §2/§3: KV lines removed, "rotating `BETTER_AUTH_SECRET` signs everyone out", owner
  step O1: re-connect the Claude app once after cutover; optional `wrangler kv namespace delete` (owner, not agents).
- `local-dev.md` §5 curl flow updated to the new endpoints (`/oauth/register` → `/authorize` → `/oauth/token`).

## 11. Not decided here

Forge styling of the consent/login pages; listing connected clients (needs grant storage); refresh rotation with reuse
detection; dual-key secret rotation; Apple Health; moving web to Tanren JWT cookies.
