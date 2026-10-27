# v5 — Auth v2: known MCP client identities + stateless JWT auth
Source: plan Amendments 16 + 17 (owner, 2026-10-27 12:35) · Status: planned · Updated: 2026-10-27 12:48 · Baseline: 7b75026 + MCP-ROOT
Design: `docs/design/auth-v2.md` (normative; §2–§5, §8 frozen on dispatch) · ADR-0022 (accepted, Lead delegation) ·
Spikes: `docs/research/2026-10-27-mcp-client-identities.md` (S1), `2026-10-27-stateless-sessions.md` (S2)

## Decisions
- ADR-0022 §1 web login = Better Auth `cookieCache` JWT (15 min, HS256 on `BETTER_AUTH_SECRET`); §2 native + MCP = Tanren JWTs
  from one `Tokens` service; §3 revocation = `user.appTokenGen` / `user.mcpTokenGen` checked at refresh (≤ 15 min); §4 OAuth server
  rebuilt stateless behind the existing `OAuthApi` port, `oauth_code_use` the one anti-replay table, KV + library retired;
  §5 trust by `clientDomain` host allowlist (IDENT-1); §6 no `SECRET_KEY`, HKDF sub-keys of `BETTER_AUTH_SECRET` — accepted.
- Deferred (ADR §Alternatives / design §11): connected-clients list, refresh rotation, dual-key rotation, Forge consent styling.
- Forward refs (grep `v5\|OAUTH_KV\|stateless\|identit` in `docs/retro/incidents.md`, `docs/handoff.md`, `docs/tasks/v4-*.md`, 12:40):
  only handoff.md:54-59/110-111 (this wave). None deferred.

## Owner-gated
- O1 After STLS cutover deploy: reconnect the Claude app / Claude Code / ChatGPT once (grants in KV are gone). O2 Optional:
  `wrangler kv namespace delete` of `f7ea7f892333457f991ae37413b89d97` after a week (agents never delete it).

## Tasks
| id | title | role / model | depends | files (exclusive) | box | status |
| --- | --- | --- | --- | --- | --- | --- |
| IDENT-1 | CIMD on + `TRUSTED_CLIENT_HOSTS` + trusted/untrusted consent (current library) | engineer / sonnet | — | `apps/worker/src/oauth/{provider,authorize,pages}.ts`, `oauth/knownClients.ts` (+test), `apps/worker/wrangler.jsonc`, `wrangler.test.jsonc` (compat flag) | 20 | in flight (Lead, 12:45) |
| IDENT-D | Deploy + live check: AS metadata `client_id_metadata_document_supported: true`; connect Claude app (owner) | qa / sonnet | IDENT-1 | Log only | 10 | todo |
| STLS-1 | Shared `auth.ts` schemas + `NativeSessionResponse` v2; DB migration 0006 + `UserTokens` / `OAuthCodeUse` repos | engineer / sonnet | — | `packages/shared/src/{auth.ts,auth.test.ts,nativeAuth.ts,nativeAuth.test.ts,index.ts}`, `packages/db/src/schema/auth.ts`, `packages/db/migrations/0006_token_generations.sql` + `meta/`, `packages/db/src/repositories/{UserTokens.ts,UserTokens.test.ts,OAuthCodeUse.ts,OAuthCodeUse.test.ts,index.ts}`, `apps/worker/src/testing/workerdSetup.ts` | 20 | todo |
| STLS-2 | `Tokens` service (jose HS256, HKDF sub-keys, every issue/verify of design §3) | engineer / opus | — | `apps/worker/src/auth/{Tokens.ts,Tokens.test.ts}`, `apps/worker/package.json` + `pnpm-workspace.yaml` (`jose` catalog line only) | 20 | todo |
| STLS-3 | Login: cookieCache config, `SessionsLive` JWT-first, native session v2, `/api/token/{refresh,revoke,revoke-mcp}` | engineer / opus | STLS-1, STLS-2 | `apps/worker/src/auth/{BetterAuth.ts,SessionsLive.ts,SessionsLive.test.ts,nativeAuthRoutes.ts,nativeAuthRoutes.test.ts,nativeAuth.workerd.test.ts,tokenRoutes.ts,tokenRoutes.test.ts}`, `apps/worker/src/app.ts` (mount only) | 20 | todo |
| STLS-4 | Stateless OAuth server: `clients.ts` (CIMD + DCR), `consent.ts`, `OAuthApi.layerStateless`, `token.ts`, `metadata.ts`, `McpAuth.layerJwt`, router replaces `OAuthProvider`, KV + library removed | engineer / opus | STLS-1, STLS-2, IDENT-1 merged | `apps/worker/src/oauth/{clients.ts,clients.test.ts,consent.ts,OAuthApi.ts,token.ts,token.test.ts,metadata.ts,provider.ts,oauth.workerd.test.ts}`, `apps/worker/src/mcp/{McpAuth.ts,McpAuth.test.ts}`, `apps/worker/src/{Env.ts,index.ts,index.workerd.test.ts,cloudflareEnv.d.ts}`, `wrangler.jsonc`, `wrangler.test.jsonc`, `apps/worker/package.json` (remove the library) | 20 ×2 (split 4a server / 4b wiring+tests if over) | todo |
| STLS-5 | Mobile: `NativeSession` token pair + refresh, `Account.signOut` native revoke, "Disconnect AI clients" row | engineer / sonnet | STLS-1 (names) | `apps/mobile/src/services/{NativeSession.ts,NativeSession.test.ts,Account.ts,Account.test.ts,Account.edge.test.ts}`, `apps/mobile/src/components/settings/{AccountSection.tsx,settingsCopy.ts,settingsCopy.test.ts}`, `apps/mobile/src/hooks/useAccount.ts` | 20 | todo |
| STLS-6 | Docs: `deploy.md` §2/§3 (KV gone, rotation note, O1), `local-dev.md` §5 flow, `apps/worker/CLAUDE.md` layout + `oauth.md` superseded banner | engineer / sonnet | STLS-3, STLS-4 | `docs/design/{deploy.md,local-dev.md,oauth.md}`, `apps/worker/CLAUDE.md` | 10 | todo |
| STLS-R | Review: design §7 line by line (canonicalisation tests present, burn-last order, `no-store`, no token logging `grep -rn "logInfo\|logError" apps/worker/src/oauth apps/worker/src/auth/Tokens.ts`), Effect rules, workerd coverage | reviewer / opus | STLS-3, 4, 5 | read-only | 25 | todo |
| STLS-Q | Local e2e: `pnpm db:reset`; curl `/oauth/register` → `/authorize` (login + consent, untrusted block shown) → `/oauth/token` → `/mcp tools/list`; replay the code → `invalid_grant`; refresh → new pair; `revoke-mcp` → refresh 401; native: `ui-check` sign-in on web :8790 still cookie-based (0 D1 reads: `wrangler dev` log shows no `session` query on 2nd request) | qa / sonnet | STLS-R clean | Log only | 20 | todo |
| STLS-D | Production deploy, owner O1, live: AS metadata JSON, Claude app connect, `get_overview` call | qa / sonnet | STLS-Q | Log only | 10 | todo |

Parallel groups (≤ 3): {IDENT-1} → {IDENT-D} ∥ {STLS-1, STLS-2} → {STLS-3, STLS-4, STLS-5} → {STLS-6} → STLS-R → STLS-Q → STLS-D.
Case check 12:47: `ls apps/worker/src/oauth apps/worker/src/auth packages/db/src/repositories | tr A-Z a-z | sort | uniq -d`
must print nothing after the new files (`Tokens.ts` vs `token.ts` live in different directories — keep it so; never add
`oauth/tokens.ts`).

## Frozen contracts
- Design §3 token table (aud strings, TTL constants, claim names) and the `Tokens` method names; §4 endpoint paths and bodies;
  §5 route table and `OAuthApiShape` unchanged (`OAuthApi.ts:61-83`); §6 `TRUSTED_CLIENT_HOSTS` and trust predicate;
  §8 SQL byte for byte (drizzle whitespace aside), repo method names `tokenGens`, `bumpAppTokenGen`, `bumpMcpTokenGen`, `burn`, `purge`.
- `packages/shared`: `AppTokenPair`, `RefreshRequest`, `TokenRejected` (401, `reason: "expired" | "revoked" | "invalid"`),
  `NativeSessionResponse = { userId: UserId, access: AppTokenPair }`.

## Assumes (cited)
- `OAuthApiShape` is the whole surface `authorize.ts` uses: `grep -n "oauth\.\(parseAuthRequest\|describeConsent\|beginConsent\|approveConsent\|denyConsent\|completeAuthorization\)" apps/worker/src/oauth/authorize.ts` — six names, all in the shape (`OAuthApi.ts:61-83`).
- `cookieCache { strategy: "jwt" }` answers get-session with zero DB calls and bearer-only still reads D1: S2 §1–§2 (observed, `dbCalls=[]`).
- The native token is minted at exactly one site: `nativeAuthRoutes.ts` `instance.api.verifyOneTimeToken` → `token: verified.session.token` (grep 12:40).
- Tests that pin the old shape and their new values: `nativeAuthRoutes.test.ts:136` `toMatchObject({ token: expect.any(String), userId })` →
  `{ userId, access: { accessToken: expect.any(String), refreshToken: expect.any(String) } }`; `:403/:407` `set-auth-token` assertions
  stay (Better Auth still sets it on the web verify); `NativeSession.test.ts:186,245,253` `token → Option.some(TOKEN)` → `Option.some(ACCESS)`
  with a fixture pair, `:270` unchanged; `authorize.test.ts` consent assertions unchanged (`layerFake` keeps the shape).
- No `UserRepo` exists today (`ls packages/db/src/repositories`: Activity/Exercise/Integration/Plan/Profile/Session): STLS-1 creates `UserTokens.ts`.
- `ListRow` has `tone` and `chevron` props (`apps/mobile/src/ui/ListRow.tsx:111-116`); `AccountSection.tsx` already renders a `ListRow` + `Banner`.
- Library and flag facts (S1): `clientIdMetadataDocumentEnabled` needs `global_fetch_strictly_public`; the Worker's outbound fetches (Resend, Strava, CIMD) are public hosts.

## Briefs (paste-ready; every brief: permissions = edit only the listed files, no `git`, no `wrangler` remote, no `rm -r`, no `.env*`)

### STLS-1 — shared schemas, migration 0006, repos (sonnet, 20 min)
Read `docs/design/auth-v2.md` §3 (schemas), §8 (SQL, repo names), `packages/db/src/schema/auth.ts`, one existing repo (`Integration.ts`) for the
`effect/sql` pattern, `packages/db/src/schema/parity.test.ts` (does it demand `userId`? if yes add `userId text NOT NULL` to `oauth_code_use`
and record it in the Log). Do: `packages/shared/src/auth.ts` (`AppTokenPair`, `RefreshRequest`, `TokenRejected`) + test; `nativeAuth.ts`
`NativeSessionResponse` v2 (keep `SessionToken` export for now); migration 0006 via drizzle-kit (`pnpm --filter @tanren/db …`, read the
package scripts) matching §8 byte for byte; `UserTokens` (`tokenGens`, `bumpAppTokenGen`, `bumpMcpTokenGen`, `UserNotFound` tagged error) and
`OAuthCodeUse` (`burn` → `false` on duplicate jti, `purge(now)`); `workerdSetup.ts` lists 0006. Done: `pnpm check` green; repo tests prove
bump increments by exactly 1 and `burn` twice → `true, false`. Time box 20 min. Report: files, gate output, the parity ruling.

### STLS-2 — `Tokens` service (opus, 20 min)
Read `docs/design/auth-v2.md` §2–§3, `apps/worker/src/Config.ts` (`betterAuthSecret`), `.claude/skills/effect-conventions`. Add `jose` `6.2.12`
to the catalog and `apps/worker/package.json` (`catalog:`), `pnpm install`. Write `Tokens` (`Context.Service`, `static layer` needs
`WorkerConfig`): HKDF-SHA256 sub-keys (`crypto.subtle.deriveBits`, info strings §2), `kid`, HS256 `SignJWT`/`jwtVerify` with exact `aud`,
`iss`, 60 s skew, every method of §3; errors `TokenRejected`; times from `DateTime.now`. Tests (`@effect/vitest`, `TestClock`): round trip per
token; wrong `aud` → `invalid`; `exp` + 61 s → `expired`; tampered payload → `invalid`; app key never verifies an MCP token; `kid`
mismatch → `invalid`. No `any`, no `as` without comment. Done: `pnpm check` green. Time box 20 min.

### STLS-3 — login endpoints (opus, 20 min; depends STLS-1, STLS-2)
Read `docs/design/auth-v2.md` §4, `BetterAuth.ts`, `SessionsLive.ts`, `nativeAuthRoutes.ts` (the `verifyOneTimeToken` site),
`better-auth/dist/types/*.d.mts` for `session.cookieCache` option names (VERIFY: `strategy: "jwt"`, `maxAge`). Do: cookieCache config; `SessionsLive`
JWT-first (two-dot bearer → `Tokens.verifyApp`, rejection → `None`, else existing path); native session answers `{ userId, access }` after
`UserTokens.tokenGens`; `tokenRoutes.ts`: `POST /api/token/refresh` (body, gen check, 401 `TokenRejected`), `POST /api/token/revoke`
(Bearer access → `bumpAppTokenGen`), `POST /api/token/revoke-mcp` (Bearer access or cookie → `bumpMcpTokenGen`); `no-store` on all three;
mount in `app.ts`. Tests: assertions listed in Assumes updated; refresh after bump → 401 `revoked`; `nativeAuth.workerd.test.ts` 2nd request
with the JWT performs no `session` query (assert via the D1 spy pattern S2 used, or the `dbCalls` recorder in `workerdSetup`). Done: `pnpm check`.
Time box 20 min.

### STLS-4 — stateless OAuth server (opus, 20 min; split 4a/4b if the Lead prefers; depends STLS-1, STLS-2, IDENT-1 merged)
Read `docs/design/auth-v2.md` §5–§7, `oauth/{provider,authorize,OAuthApi,pages,knownClients}.ts`, `mcp/McpAuth.ts`, S1 §Library facts.
4a `clients.ts` (CIMD fetch per §7 with `caches.default`, validation, canonicalisation; stateless DCR issue/verify), `consent.ts`
(`ConsentDescription` local type + `trusted`), `OAuthApi.layerStateless` (handle JWT + `__Host-tanren-consent` double submit), `token.ts`
(burn-last order), `metadata.ts`. 4b `McpAuth.layerJwt` (replaces `layerOAuth` in `layerLive`), `provider.ts` → plain router (`serveWith` +
metadata + `/oauth/*`), `Env.ts`/`index.ts`/`cloudflareEnv.d.ts` without KV or `OAUTH_PROVIDER`, wrangler files without `kv_namespaces`, remove
`@cloudflare/workers-oauth-provider` from `package.json`, `oauth.workerd.test.ts` + `index.workerd.test.ts` rewritten for the new flow
(register → authorize → token → 7 tools; replayed code → `invalid_grant`; refresh; revoke-mcp → refresh 401), `clients.test.ts` with every
bypass URL of §7. Done: `pnpm check`; `grep -rn "OAUTH_KV\|workers-oauth-provider" apps/worker/src apps/worker/*.jsonc` = 0. Time box 20 min each.

### STLS-5 — mobile token pair (sonnet, 20 min; depends STLS-1 names)
Read `docs/design/auth-v2.md` §9, `NativeSession.ts`, `Account.ts`, `AccountSection.tsx`, `settingsCopy.ts`. Do: store `AppTokenPair`
(SecureStore keys §9), `token` refreshes 30 s before `expiresAt` via `POST /api/token/refresh` (one attempt; 401 → `clear`), `complete` stores
v2; `Account.signOut` native → `POST /api/token/revoke` then `clear`; new `ListRow` "Disconnect AI clients" (`tone="danger"`? read `RowTone`)
→ `POST /api/token/revoke-mcp` + `Banner` success/failure copy. Tests: Assumes list (`:186,245,253,270`); refresh path with a fake clock;
web path untouched (`Account.test.ts` web cases unchanged). Done: `pnpm check`. Time box 20 min.

### STLS-6 — docs (sonnet, 10 min; depends STLS-3, STLS-4)
`deploy.md` §2 drop KV lines, §3 rotation note + O1; `local-dev.md` §5 new curl flow (exact commands the engineer ran in STLS-4's workerd
test); `oauth.md` top banner "superseded by auth-v2.md (ADR-0022) for §1–§2, §4; §3 pages and §5 write tools stay"; `apps/worker/CLAUDE.md`
layout lines for `auth/Tokens.ts`, `auth/tokenRoutes.ts`, `oauth/{clients,consent,token,metadata}.ts`. Done: `pnpm check` (docs-only, gate still runs).

### IDENT-D / STLS-Q / STLS-D — see the task table rows; QA writes measured results to this sheet's Log only.

## Log
- 12:33 architect start; 12:39 both spikes read; 12:48 ADR-0022, design, sheet written (15.2 min).
