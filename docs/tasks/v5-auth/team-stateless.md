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
| STLS-1 | sonnet | — | 20 | W1 | | dispatched 12:51 |
| STLS-2 | opus | — | 20 | W1 | | dispatched 12:51 |
| REV-W1 | opus | STLS-1, STLS-2 | 6 | W2 (with 3/4a/5) | | todo |
| STLS-3 | opus | 1, 2 | 20 | W2 | | todo |
| STLS-4a | opus | 1, 2 | 20 | W2 | | todo |
| STLS-5 | sonnet | 1 | 20 | W2 | | todo |
| STLS-4b | opus (resume 4a) | 4a, 1, 2 | 20 | W3 | | todo |
| STLS-6 | sonnet | 3, 4b | 10 | W4 | | todo |
| STLS-R | opus | 3, 4b, 5 (delta over W1) | 10 | W4 (with 6) | | todo |
| fix | same engineers | R | 10 | W5 | | todo |
| STLS-Q | sonnet | R clean | 10 | W6 | | todo |

Note: inside a nested team-lead each Agent message returns when all its children finish, so a wave = one message; no overlap
across waves is promised.

### Log
`HH:MM→HH:MM · task · role/model · agent id · tokens · tool uses · rounds · outcome`

### Decisions

### Escalations

### Integration checklist
- [ ] Lead: STLS-D deploy after STLS-Q (production KV binding removal in the same deploy; O1 reconnect).
