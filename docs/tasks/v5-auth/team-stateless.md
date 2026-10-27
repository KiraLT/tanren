# Team charter: stateless auth (STLS, plan Amendment 17, ADR-0022)
Status: dispatched 2026-10-27 ~12:58 · Lead: `docs/tasks/step-2.md` Log · Task sheet (normative, paste-ready briefs): `docs/tasks/v5-auth.md`

Mission: implement ADR-0022 §1–§4 and §6 exactly as `docs/design/auth-v2.md` specifies: web login via Better Auth
`cookieCache` JWT; native login + MCP on Tanren JWTs from one `Tokens` service (HKDF sub-keys of `BETTER_AUTH_SECRET`,
no new secret); revocation by `appTokenGen` / `mcpTokenGen` checked at refresh; the MCP OAuth server rebuilt stateless in
Effect behind the existing `OAuthApi` port, `oauth_code_use` the only anti-replay table; KV and
`@cloudflare/workers-oauth-provider` removed. Tasks STLS-1 … STLS-Q from the sheet; STLS-D (production) is the Lead's.

Facts at dispatch (Lead, 12:58):
- HEAD = the WIP IDENT-1 commit (`git log --oneline -1`); REV-ID (reviewer) runs on it for ~6 min and the Lead then
  commits + deploys (DEPLOY-8) — none of that touches your files. `oauth/knownClients.ts` + `consentView` in
  `authorize.ts` are IDENT-1's and are reused unchanged by STLS-4 (design §5–§6).
- Both spikes are facts you may cite: `docs/research/2026-10-27-stateless-sessions.md` (cookieCache jwt = 0 DB reads;
  bearer alone reads D1; jwt plugin asymmetric-only), `docs/research/2026-10-27-mcp-client-identities.md`.
- `jose` is already in the pnpm store via better-auth; STLS-2 adds it to the catalog (`pnpm-workspace.yaml`) and
  `apps/worker/package.json` — the ONLY dependency change allowed in this charter, by STLS-2 alone.
- Local D1: `pnpm db:reset` is allowed (its `rm -rf` is script-internal, no prompt) but wipes the shared local D1; the
  Lead confirms nothing else uses it right now. Migration proofs on a `--persist-to` copy under `mktemp -d` are fine.

Owned paths (exclusive, per task as the sheet lists; the team-lead re-splits by interim):
- STLS-1: `packages/shared/src/{auth,auth.test,nativeAuth,nativeAuth.test,index}.ts`, `packages/db/migrations/0006_*`
  (+ `meta`), `packages/db/src/schema/**`, `packages/db/src/repositories/{UserTokens,OAuthCodeUse}.ts` (+tests, `index.ts`),
  `apps/worker/src/testing/workerdSetup.ts`.
- STLS-2: `apps/worker/src/auth/Tokens.ts` (+test), `apps/worker/package.json`, `pnpm-workspace.yaml` (jose only).
- STLS-3: `apps/worker/src/auth/{BetterAuth,SessionsLive,nativeAuthRoutes,tokenRoutes}.ts` (+tests), `apps/worker/src/app.ts`.
- STLS-4: `apps/worker/src/oauth/**` except `knownClients.ts` (read-only), `apps/worker/src/mcp/McpAuth.ts` (+test),
  `apps/worker/src/{Env,index}.ts`, `cloudflareEnv.d.ts`, `apps/worker/wrangler*.jsonc` (KV removal only),
  `apps/worker/package.json` (removal of `@cloudflare/workers-oauth-provider` only, after STLS-2's add landed),
  `apps/worker/src/repos/**` (memory ports of the new repos).
- STLS-5: `apps/mobile/src/services/{NativeSession,Account}.ts` (+tests), `apps/mobile/src/components/settings/{AccountSection.tsx,settingsCopy.ts}` (+test).
- STLS-6: `docs/design/{deploy,local-dev,oauth}.md`, `apps/worker/CLAUDE.md` (layout lines; marker `shared with Lead`).
- Team: this sheet (team sheet below), `docs/tasks/v5-auth.md` Log.
Read-only: everything else. Adjacent (live elsewhere): none in code after REV-ID; the Lead edits `docs/handoff.md`,
`docs/tasks/step-2.md`.
Shared: `apps/worker/CLAUDE.md` (STLS-6, marked); `docs/tasks/v5-auth.md` Log (you append, the Lead reads).

Time box: 110 min (STLS-1 ∥ STLS-2 20 → STLS-3 ∥ STLS-4a ∥ STLS-5 20 → STLS-4b 20 → STLS-6 10 → STLS-R 10 → fix 10
→ STLS-Q 10 + 10 slack). Hard stop = dispatch `date` + 110: report what passed and what did not; a round starts only
when now + task + review ≤ hard stop − 3 min.
Ports: worker dev **8981** (STLS-3/4 smoke) and **8982** (STLS-Q e2e); probe `ps -ef | grep "port 898"` first; never
8787/8790/8081/8897/8911/8912/8921/8931/8941/8951/8961.
Contracts (frozen, from the sheet): design §3 token table (aud strings, TTLs, claim names) and `Tokens` method names;
§4 endpoint paths and bodies; §5 route table and `OAuthApiShape` unchanged (`OAuthApi.ts:61-83`); §6 trust predicate;
§8 SQL byte for byte and repo method names `tokenGens`, `bumpAppTokenGen`, `bumpMcpTokenGen`, `burn`, `purge`;
shared `AppTokenPair`, `RefreshRequest`, `TokenRejected` (401, `reason: "expired" | "revoked" | "invalid"`),
`NativeSessionResponse = { userId, access: AppTokenPair }`.
Runtime proof: STLS-3/4 each run `wrangler dev --port 8981` (own `--persist-to` copy, migrations applied) with the
curl sequence of their brief; STLS-Q runs the sheet's e2e on 8982 and writes measured results to this sheet's Log;
workerd tests are the regression proof for every OAuth path (register → authorize → token → tools/list; replayed
code → `invalid_grant`; refresh; revoke-mcp → refresh 401).
Assumes (cross-team): the sheet's "Assumes (cited)" block — re-grep each before the task that relies on it.
Security: design §7 checklist applied line by line by STLS-4 and verified by STLS-R; no token or secret ever logged
(`grep -rn "logInfo\|logError" apps/worker/src/oauth apps/worker/src/auth/Tokens.ts` in the review); `no-store` on
every token/consent response; canonicalisation tests for every bypass URL of §7.
Lead rulings (apply, do not re-decide):
1. Split STLS-4 into 4a (clients, consent, layerStateless, token, metadata — pure modules + tests) and 4b (McpAuth
   layerJwt, router, KV/library removal, workerd rewrite); one opus engineer, 4a then 4b by resume; 4b starts only
   after STLS-1 and STLS-2 have landed and IDENT-1 is committed (it is).
2. `parity.test.ts` ruling: if it demands `userId` on `oauth_code_use`, add `userId text NOT NULL` and record it.
3. The web client does not change (ADR §1); STLS-5 changes native only; `Account.test.ts` web cases stay byte-identical.
4. Models as the sheet says (opus for STLS-2/3/4 and the reviewer, sonnet elsewhere); the sheet's boxes stand.
Tasks: as the sheet's table; dispatch STLS-1 ∥ STLS-2 in ONE Agent message now; STLS-3 ∥ STLS-4a ∥ STLS-5 in ONE
message when both have landed; interim to the Lead after each wave with the file list and markers (`shared with`,
`imports untracked`).
Budget: 3 engineers in parallel, 1 reviewer (opus), 1 QA (sonnet); ≤ 2 review rounds; reports ≤ 40 lines.
Forbidden: dependency changes other than STLS-2's `jose` add and STLS-4b's library removal, root config changes
beyond the catalog line, files outside owned paths, `git commit|push|reset|checkout`, `rm -r*`, `wrangler
deploy|login|secret|d1 execute --remote|d1 migrations apply --remote`, `wrangler deploy --dry-run`, `eas *`,
reading `.env*`, deleting the production KV namespace (owner step O2).
Done when: root `pnpm check` green (paste tail) · STLS-R APPROVE with blocking fixed · STLS-Q e2e measured in the Log
· `grep -rn "OAUTH_KV\|workers-oauth-provider" apps/worker/src apps/worker/*.jsonc apps/worker/package.json` = 0 ·
every touched file listed with markers.
Report: team report format from `.claude/agents/team-lead.md`.

---
## Team sheet (team-lead fills: Assumes · Tasks table · Log · Decisions · Escalations)

Team-lead dispatched 12:47:21 · hard stop **14:37** · ports probed 12:49: 8981/8982 free (`ps -ef | grep "port 898"` empty,
`curl /health` no answer) → STLS-3/4 smoke 8981, STLS-Q 8982.

### Assumes (cross-team, copied from v5-auth.md "Assumes (cited)"; re-grep before the task that relies on it)
- `OAuthApiShape` is the whole surface `authorize.ts` uses (six names, `OAuthApi.ts:61-83`).
- `cookieCache { strategy: "jwt" }` = 0 DB calls on get-session; bearer-only still reads D1 (S2 §1–§2).
- Native token minted at one site: `nativeAuthRoutes.ts` `verifyOneTimeToken` → `token: verified.session.token`.
- Old-shape test pins: `nativeAuthRoutes.test.ts:136`, `:403/:407` stay; `NativeSession.test.ts:186,245,253` → ACCESS, `:270` unchanged; `authorize.test.ts` unchanged.
- No `UserRepo` today (`ls packages/db/src/repositories` 12:49: ActivityExport/Exercise/Integration/Plan/Profile/Session).
- `ListRow` has `tone` + `chevron` (`ListRow.tsx:111-116`); `AccountSection.tsx` renders `ListRow` + `Banner`.
- CIMD needs `global_fetch_strictly_public` (IDENT-1, committed 5e64e61).
- `jose@6.2.12` in the pnpm store (`ls node_modules/.pnpm | grep ^jose@` 12:49); `@cloudflare/workers-oauth-provider` at `apps/worker/package.json:21`.

### Tasks
| id | model | depends | box | wave | agent id | status |
| --- | --- | --- | --- | --- | --- | --- |
| STLS-1 | sonnet | — | 20 | W1 | a20851f517fa17e07 | done 12:53 (in review REV-W1) |
| STLS-2 | opus | — | 20 | W1 | a0d08878389be20e3 | done 12:55 (in review REV-W1) |
| REV-W1 | opus | STLS-1, STLS-2 | 6 | W2 (with 3/4a/5) | a4a91ac8d051e07b8 | APPROVE 12:59 (should #2 + nit #3 → resumed 13:10; should #1 covered by STLS-3 workerd test) |
| STLS-3 | opus | 1, 2 | 20 | W2 | a715e5c63cf3b23cb | done 13:08 |
| STLS-4a | opus | 1, 2 | 20 | W2 | a5736abc27c1b6d2e | done 13:08 |
| STLS-5 | sonnet | 1 | 20 | W2 | ab9dd7c02dde4468f | done 13:03 |
| STLS-4b | opus (resume 4a) | 4a, 1, 2 | 20 | W3 | a5736abc27c1b6d2e | done 13:21 (nits r2 13:29) |
| STLS-6 | sonnet | 3, 4b | 10 | W3 | ab27d30ffc147b2bc | done 13:22 (QA doc fixes r2 13:29) |
| REV-W2 | opus | 3, 4a | 10 | W3 | a6b260b84ed0136d0 | REQUEST CHANGES 13:14 (CIMD body timeout/cap) → fixed by REV-W2-F a26c19e417c0ef40a 13:17 |
| STLS-R | opus | 4b, 5, 6, REV-W2-F | 12 | W4 | accf6a839ba385aaf | APPROVE 13:26 (should #1 mobile marker, nits → fix r 13:29) |
| STLS-5 r2 | sonnet (resume) | Lead ruling 14:15-msg | 10 | W3 | ab9dd7c02dde4468f | dispatched 13:12 (if over → STLS-F1 follow-up) |
| fix | same engineers | R | 8 | W5 | ab9dd7c0 / a5736abc / ab27d30f | done 13:31 |
| STLS-Q | sonnet | (run ∥ STLS-R) | 20 | W4 | abcf0ea39e096fae4 | PASS 13:28 (13/13) |

Note: inside a nested team-lead each Agent message returns when all its children finish, so a wave = one message; no overlap
across waves is promised.

### Log
`HH:MM→HH:MM · task · role/model · agent id · tokens · tool uses · rounds · outcome`
- 12:48:59→12:52:49 · STLS-1 · engineer/sonnet · a20851f517fa17e07 · 131k · 36 · r1 · shared/db gates green (390 + 159 tests); 0006 generated (drizzle order/backticks); parity ruling: no `userId` (parity covers the 10 sync tables only); root red only in STLS-3/5 consumers (expected)
- 12:48:59→12:54:35 · STLS-2 · engineer/opus · a0d08878389be20e3 · 146k · 29 · r1 · Tokens.ts 14 tests green; jose 6.2.12 catalog + worker package.json + lockfile (+6 lines); root red only at mobile NativeSession.ts:123 (STLS-5) + nativeAuthRoutes.test.ts ×3 (STLS-3)

- 12:57→12:59 · REV-W1 · reviewer/opus · a4a91ac8d051e07b8 · 79k · 10 · r1 · APPROVE; should: jose not run in workerd (covered by STLS-3 nativeAuth.workerd), expiresAt second clock read; nits: Option.match in UserTokens, expired-before-aud ordering (design order, left)
- 12:57:59→13:03 · STLS-5 · engineer/sonnet · ab9dd7c02dde4468f · 204k · 69 · r1 · mobile check 85 files / 981 tests green; token pair + refresh (Semaphore single-flight), native revoke best-effort, Disconnect AI clients row; 4 granted fixtures
- 12:58:00→13:08:33 · STLS-3 · engineer/opus · a715e5c63cf3b23cb · 210k · 90 · r1 · worker 48 files / 656 tests; workerd: app-JWT request 0 `session` queries; smoke 8981 real native flow, refresh/revoke/revoke-mcp, 0×500; scope deviation: auth.test.ts + authRoutes.test.ts one-line `MemoryTokens` provide (compile) — accepted
- 12:58:00→13:08:24 · STLS-4a · engineer/opus · a5736abc27c1b6d2e · 199k · 59 · r1 · src/oauth 7 files / 118 tests; §7 bypass list + burn-last asserted; OAuthApiShape identical
- 13:09:28→13:09:58 · root `pnpm check` (team-lead) · green: biome 536 files, 172 test files / 2186 tests
- 13:10 · STLS-4b resume a5736abc27c1b6d2e; REV-W1 fixes: STLS-2 a0d08878389be20e3 (expiresAt), STLS-1 a20851f517fa17e07 (nit)
- 13:10→13:11:14 · REV-W1 nit · engineer/sonnet · a20851f517fa17e07 · ~3k delta · 6 · r2 · UserTokens Option.match; db check 159 green
- 13:12 · STLS-5 r2 (Lead ruling: pending-revoke marker) · resume ab9dd7c02dde4468f · box 10
- 13:12 · team-lead Edit `apps/mobile/CLAUDE.md` :209 (token pair keys, refresh) + :358 (native sign-out = revoke best-effort → forgetOwner → clear; Disconnect AI clients row)
- 13:11:11→13:21:48 · STLS-4b · engineer/opus (resume) · a5736abc27c1b6d2e · 312k total · 92 total · r1 · makeRouter + layerJwt + library/KV gone; workerd 8 files / 91–92 tests; smoke 8981 0×500; KV grep 0
- 13:12:59→13:14:38 · STLS-5 r2 · engineer/sonnet · ab9dd7c02dde4468f · 251k total · 23 · r2 · pending-revoke marker; mobile 85 files / 991 tests
- 13:12→13:14 · REV-W2 · reviewer/opus · a6b260b84ed0136d0 · 106k · 14 · r1 · REQUEST CHANGES: CIMD 5 s timeout excludes body read, 5 KiB cap after arrayBuffer (unauthenticated DoS)
- 13:15:23→13:17:22 · REV-W2-F · engineer/opus · a26c19e417c0ef40a · 108k · 22 · r1 · single timeout over fetch+body, streamed cap + reader cancel, 7 tests; DCR ≤ 10 × ≤ 2048
- 13:18:15→13:22:09 · STLS-6 · engineer/sonnet · ab27d30ffc147b2bc · 159k · 54 · r1 · deploy.md §3a O1/O2, local-dev §5, oauth.md banner, worker CLAUDE.md (shared with Lead)
- 13:23→13:26 · STLS-R · reviewer/opus · accf6a839ba385aaf · 146k · 18 · r1 · APPROVE; should: marker vs re-sign-in; nits ×4 (catalog line = root config → Lead); root gate: typecheck green, 2244/2245 tests, 1 foreign GM-1 (`IntegrationsHandlers.test.ts:147`); workerd 8/92
- 13:23:38→13:28:09 · STLS-Q · qa/sonnet · abcf0ea39e096fae4 · 88k · 34 · r1 · PASS 13/13 on :8982 + UI :8983 (Disconnect AI clients → revoke-mcp 204, banner); measured: 9 tools, replay → invalid_grant "code already used", revoke-mcp → refresh invalid_grant "grant revoked", access valid after revoke (≤ 15 min), native revoke → 401 revoked, get-session served from `session_data` with the session row deleted, 0×500, 0 token hits in logs
- 13:29 · fix round: STLS-5 (marker, JSDoc), 4b (2 doc comments), STLS-6 (local-dev §5 iss/ALLOWED_ORIGINS/run markers)
- 13:29:31→13:30:41 · STLS-R fix · STLS-5 sonnet ab9dd7c02dde4468f · 12 tools · r3 · complete always retries + removes marker after storePair; 2 tests; mobile 86 files / 1005 green
- 13:29:33→13:29:42 · STLS-R nits · 4b opus a5736abc27c1b6d2e · 6 tools · McpAuth.ts:67, OAuthApi.ts:70 comments; biome clean
- 13:29→13:30 · STLS-6 fix · sonnet ab27d30ffc147b2bc · 7 tools · local-dev §5 (iss removed, ALLOWED_ORIGINS, run markers)
- 13:39:44→13:40:18 · root `pnpm check` (team-lead, final) · biome 545 files ok, typecheck ok, 174/175 test files, 2251/2252 tests; 1 FAIL foreign GM-1 `apps/worker/src/api/IntegrationsHandlers.test.ts` ("lists strava as disconnected…", garmin row); KV/library grep = 0; case check empty
- 13:41 · team report sent. Wall 12:47 → 13:41 = 54 of 110 min.
### Decisions
- 12:55 Path release: IDENT-1 fix r2 committed 9484553 (`knownClients.ts` final: `TRUSTED_CLIENT_HOSTS` tuples, `clientTrust(input: ClientTrustInput): ClientTrust` plain type) → STLS-4a may start on `oauth/**` (knownClients read-only); EAS-1 committed 89383c3 (`wrangler.jsonc` `env.production.vars.NATIVE_RETURN_PREFIXES` = `exps://u.expo.dev/71f6…/`) → STLS-4b re-reads wrangler.jsonc and keeps that value (Lead notice 13:10).
- STLS-1 (ratify): repo methods carry `PersistenceError`; `UserNotFound` = internal `Data.TaggedError { userId }` (worker maps to `TokenRejected`); `OAuthCodeUseRepo.burn(jti, expiresAt: DateTime.Utc)` / `purge(now: DateTime.Utc)` stored as epoch ms; `burn` = `INSERT … ON CONFLICT DO NOTHING RETURNING jti`; services `UserTokens`, `OAuthCodeUseRepo`, registered in db `Repositories.layer`; migration via `pnpm generate --name token_generations`.
- STLS-2 (ratify): lazy key derivation (`Effect.cached`); `scope` claim = granted scopes space-joined; verify returns supersets (`jti`, `clientId`, code `exp`); consent handle carries `sub` + `request` + `nonce`, `issueConsent({ userId, request }) → { handle, nonce }`; code signed with the mcp key (told apart by `aud`); DCR client id has `jti`, no `exp`; `layerWith(config)` for tests.
- 12:57 Re-split by team-lead: `apps/worker/src/repos/**` → STLS-3 in W2 (memory `UserTokens` + `OAuthCodeUseRepo`; STLS-3's route tests need them), back to STLS-4b in W3. STLS-4a uses local fakes in its tests.

- 13:10 W2 ratified by team-lead (Lead to confirm): STLS-3 revoke/revoke-mcp 204; malformed refresh body 401 invalid; deleted user at native session 400 `NativeCodeRejected`; JWT-shaped rejected Bearer on revoke-mcp → 401 (no cookie fallback; cookie path relies on SameSite=Lax); `SessionsLive` provides `Tokens.layer` internally; memory `UserTokens` every user `{0,0}`; new `repos/MemoryTokens.ts`; scope deviation `auth/{auth,authRoutes}.test.ts` (+1 provide line each). STLS-4a: `layerStateless({ request })` needs Sessions → additive `request` arg on `authorize.ts` `oauth` hook (granted to 4b); CIMD cache `caches.open("tanren:cimd:v1")` (types lack `caches.default`); PKCE S256 required at parse; `resource` ≠ MCP_RESOURCE_URL → `invalid_target`; refresh may only narrow scope; DCR default name "Unnamed app"; discovery CORS `*`. STLS-5: `token: Option<string>`; refresh network failure keeps pair, returns none; `hasSession`; native revoke best-effort (3 s) then clear — a failed revoke leaves the refresh token valid server-side ≤ 30 d; legacy `tanren.session` deleted; `userId` not stored on device; Disconnect row on native + web, `tone="danger"`.
- 13:10 Ownership: `app.ts` + `repos/**` + `mcp/McpRoute*` + `authorize.ts` (hook arity only) → STLS-4b. `refresh after revoke-mcp` asserted as `/oauth/token` 400 `invalid_grant` (RFC 6749 §5.2).
- Docs debt (STLS-6): `apps/mobile/CLAUDE.md` sign-out policy + SecureStore keys are stale (STLS-5) — mobile CLAUDE.md is in the package containing STLS-5's paths: team-lead edits those lines before the report.

- 13:29 Run STLS-Q ∥ STLS-R (not after): Q is read-only on its own port; R found no blocking, the fix round touches only mobile marker logic + comments + docs (no e2e path) → Q stands. Ratify.
- 4b (ratify): authorize hook `oauth: (env, request) => Option<Layer<OAuthApi, never, Sessions | WorkerConfig>>` required; loopback registrations match any port (RFC 8252 §7.3, as the library); `withCors` = library's (origin reflected, no credentials); 405 JSON on wrong methods. REV-W2-F: oversize DCR → `invalid_client_metadata`.
- STLS-Q observations accepted as design: consent handle reusable ≤ 10 min by a holder of both handle and binding cookie (browser approve clears the cookie) → follow-up STLS-F2 if single-use is wanted (needs storage); web session row deletion does not log out a browser holding `session_data` until `maxAge` 900 s (ADR §3 bound).
- STLS-6 (ratify): deploy.md §3a "Stateless auth cutover (O1–O2)"; "Disconnect AI clients" is the MCP kill switch.

### Escalations
- Root config: `pnpm-workspace.yaml:10` catalog line `"@cloudflare/workers-oauth-provider": 1.2.3` is now unused (lockfile entry gone); charter allows only the jose line → Lead removes it or grants it (1-line, `pnpm install` + gate).

### Integration checklist
- [ ] `pnpm-workspace.yaml:10` · delete the unused workers-oauth-provider catalog line · `pnpm install && pnpm check`
- [ ] Production: `wrangler d1 migrations apply tanren --remote` (0006) BEFORE the Worker deploy · `wrangler d1 execute tanren --remote --command "PRAGMA table_info(user)"` shows appTokenGen/mcpTokenGen
- [ ] `docs/design/native-auth.md` may still describe the native token as a Better Auth session token (STLS-6 note) · doc check
- [ ] Follow-ups: STLS-F2 single-use consent handle (optional); old `SessionToken` export in `packages/shared/src/nativeAuth.ts` now unused by mobile · grep `SessionToken` → delete
- [ ] Lead: STLS-D deploy after STLS-Q (production KV binding removal in the same deploy; O1 reconnect).
