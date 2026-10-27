# Team charter: Garmin import (GM, plan Amendment 19, ADR-0023)
Status: pre-written 2026-10-27 15:05 · dispatch right after the STLS cut-over commit lands in HEAD (migration 0006 committed) · Lead: `docs/tasks/step-2.md` Log · Sheet (normative, paste-ready briefs GM-2…GM-7): `docs/tasks/v5-garmin.md` · Design: `docs/design/garmin.md` · Research: `docs/research/2026-10-27-garmin-personal-api.md`

Mission: ship the Garmin import exactly as `docs/design/garmin.md` specifies — Settings → Integrations → Garmin row with a
paste field for the owner's personal API token, the Worker exchanging the key for the 24 h JWT and sealing both with
`TokenSeal`, `GarminPull.drain` on the existing `*/5` cron into the synced pull-only tables `imported_activity` and
`daily_health` (migration 0007), feed cards for imported activities, Today's `HealthStrip`, disconnect that removes the
token and soft-deletes the imports. Tasks GM-2 … GM-7, GM-R, GM-D, GM-Q1, GM-Q2 from the sheet.

Facts at dispatch (Lead):
- GM-1 landed (shared schemas: `garmin.ts` entities/Insert/Patch/`sportOf`/`GarminCursor`(+`GarminCursorJson`), ids
  `ImportedActivityId`/`DailyHealthId`, `Provider` + `"garmin"`, `ExportFailureReason` + `token_rejected`,
  `GarminConnectRequest` (`Schema.Trimmed` is a CHECK: the app must trim before sending), `GarminTokenRejected`,
  `ProviderStatus.imports` optionalKey, row codecs `ImportedActivityRow`/`DailyHealthRow`). NOT landed by GM-1: the sync
  members (`SyncTable`, `SYNC_TABLE_ORDER`, `SyncChange`, `ROW_TABLE`, `ROW_KEYS`) — they break `packages/db` SyncStore's
  exhaustive matches and `shared/src/sync.test.ts` → **GM-2 owns them** together with `packages/shared/src/{common.ts,
  sync.ts,sync.test.ts,row.ts}`; GM-5 consumes them. GM-1 also filled the one-line holes in `integrationsCopy.ts`
  (`garmin`, `token_rejected`) and `ExportQueue.ts:89` (`token_rejected`) — treat those lines as given.
- HEAD carries the STLS cut-over (ADR-0022): no KV, `workers-oauth-provider` gone, `Tokens` service, migration 0006. Your
  migration is **0007** (drizzle-kit generate, as 0004–0006 were). `apps/worker/src/{Config,Env}.ts`, `cloudflareEnv.d.ts`,
  `wrangler*.jsonc` are yours only for the `GARMIN_*` vars (keep `workers_dev: false`, `NATIVE_RETURN_PREFIXES`, no KV).
- The owner's TEST key: `/private/tmp/claude-501/-Users-lukas-Documents-Personal-tanren/2f72436e-0cd5-4397-8737-fd4699a2ee88/scratchpad/secrets/garmin.token`
  — read ONLY by GM-Q2 into a shell variable for the local worker (`--var` or request body), never printed, never in a
  repo file, test fixture, log or report. Garmin's terms: own data, single user — the feature is owner-scoped (ADR).
- INT-STLS (13:43) made `GET /integrations` list only `AVAILABLE_PROVIDERS = ["strava"]` in `apps/worker/src/api/IntegrationsHandlers.ts`
  (the Garmin row must not appear in production before its card exists); **GM-4 adds `"garmin"` to that list** when the connect endpoint
  lands, and GM-6's card is what the row opens. GM-4 also updates the test "does not list garmin until its connect endpoint exists".
- Legal stream (live, disjoint): `app/{privacy,terms}.tsx`, `src/components/legal/**`, `authGate.ts`, landing, sign-in,
  `AboutSection.tsx`; later LEGAL-2 adds `api/{AccountApi,AccountHandlers}.ts`, `Api.ts`, `Handlers.ts`,
  `settings/{DataSection.tsx,dataCopy.ts}`, `services/AccountErasure.ts` — none of yours; GM-4's `IntegrationsApi.ts` /
  `IntegrationsHandlers.ts` are yours.

Owned paths (exclusive, per task — the sheet's table is the source; the team-lead re-splits by interim):
- GM-2 (opus): `packages/shared/src/{common.ts,sync.ts,sync.test.ts,row.ts}` (sync members only), `packages/db/src/schema/
  {garmin.ts,index.ts,integration.ts (comment)}`, `packages/db/migrations/0007_*` + `meta/`, `packages/db/src/sync/SyncStore.ts`
  (+ `SyncStore.garmin.test.ts`), `packages/db/src/repositories/{GarminImport,GarminImport.test,Integration,Integration.test,index}.ts`,
  `packages/db/src/schema/parity.test.ts`, `apps/worker/src/sync/**` (the wrap + `Sync.push` forbids the two tables), `apps/worker/src/testing/workerdSetup.ts` (0007 line).
- GM-3 (sonnet): `apps/worker/src/integrations/{GarminApi,GarminApi.test}.ts`, `apps/worker/src/{Config,Config.test,Env}.ts`,
  `cloudflareEnv.d.ts`, `apps/worker/wrangler.jsonc`, `wrangler.test.jsonc`, `apps/worker/src/testing/fixtures.ts`.
- GM-5 (opus): `apps/mobile/src/store/{migrations,migrations.test}.ts`, `apps/mobile/src/services/{LocalStore,FeedRepo,FeedRepo.test,
  DailyHealthRepo,DailyHealthRepo.test,DataExport,DataExport.test}.ts`, `apps/mobile/src/hooks/{useFeed,useDailyHealth}.ts`,
  `apps/mobile/src/runtime.ts` (layer line), `apps/mobile/src/services/SyncEngine.ts` only if the new tables need a handler there.
- GM-4 (opus): `apps/worker/src/integrations/{GarminPull,GarminPull.test,GarminPull.workerd.test,scheduled}.ts`,
  `apps/worker/src/api/{IntegrationsApi,IntegrationsHandlers}.ts`, `apps/worker/src/api/Routes.edge.test.ts`, `apps/worker/src/app.ts` (layers only),
  `apps/worker/src/repos/**` (memory ports of the new repo methods).
- GM-6 (opus): `apps/mobile/src/components/integrations/{GarminCard,ProviderList}.tsx`, `apps/mobile/src/components/settings/
  {integrationsCopy,integrationsCopy.test}.ts`, `apps/mobile/src/services/{Integrations,Integrations.test}.ts`, `apps/mobile/src/hooks/useIntegrations.ts`,
  `apps/mobile/app/settings/integrations/[provider].tsx`, `apps/mobile/src/components/feed/{ImportedCard.tsx,…}` + feed rows, `apps/mobile/app/activity/imported/[id].tsx`,
  `apps/mobile/src/components/today/HealthStrip.tsx` + `TodayReady.tsx` (`banner` prop only).
- GM-7 (sonnet): `docs/design/{local-dev,deploy}.md`, `apps/worker/CLAUDE.md` (marker `shared with Lead`), one Assumes line in `docs/tasks/v5-legal.md`.
- Team: this sheet (team sheet below), `docs/tasks/v5-garmin.md` Log, `docs/design/screens/UI-GM-*` + `UI-GM-rows.html` (badges **H1–Hn**).
Read-only: everything else. Shared: `apps/worker/CLAUDE.md` (GM-7, marked); `apps/mobile/src/components/today/TodayReady.tsx` (GM-6, `banner` prop only).

Time box: 110 min (GM-2 ∥ GM-3 ∥ GM-5 20 → GM-4 ∥ GM-6 20 → GM-7 10 → GM-R ∥ GM-D 10 → fix 10 → GM-Q1 20 → GM-Q2 15 + 5).
Hard stop = dispatch `date` + 110; a round starts only when now + task + review ≤ hard stop − 3 min.
Ports: worker dev **9011**, web **9012** (GM-Q1/Q2, GM-6 ui-check); probe `ps -ef | grep "port 901"` first; never 8787/8790/8081/8991/9021.
Contracts (frozen, from the sheet): design §1 schemas (landed), §2 cursor JSON in `integration.scope`, §3 Strava row shape reuse
(`refreshToken` = sealed key, `accessToken` = sealed JWT, `expiresAt` = JWT exp, `REFRESH_MARGIN`), §4 endpoints
`POST /integrations/garmin/connect`, `DELETE /integrations/garmin`, status `imports`; `GARMIN_MAX_USERS_PER_RUN = 4`, ≤ 10 subrequests/user,
list endpoint only (200/page, ≤ 2 pages/run), `usersummary/daily` ≤ 7 days; `Sync.push` rejects the two tables `forbidden`.
Runtime proof: GM-3/GM-4 `wrangler dev --port 9011` with `GARMIN_MODE=console`; GM-Q1 = design §11 e2e in console mode with
screenshots at 390 + 1280 into `docs/design/screens/UI-GM-*`; GM-Q2 = provider mode with the TEST key (shell var only): ≥ 1 real
`imported_activity` row, `startedAt` = Garmin's start ± 1 min, a `daily_health` row for today, 401-on-bad-key → `revoked` state.
Lead rulings (apply): (1) GM-6 trims the pasted token before `connect`; (2) GM-4 treats an empty/undecodable `scope` as "no cursor"
(fresh pull window per design §2); (3) the token or JWT never appears in a log/error — GM-4's test asserts no `Bearer`/key substring;
(4) disconnect soft-deletes imports (sync-safe); (5) strength activities import as plain activities in v1 (duplicate card accepted);
(6) GM-2 publishes the shared sync members FIRST (≤ 5 min) and sends an interim so GM-5 can consume them while GM-2 continues.
Budget: 3 engineers in parallel, 1 reviewer (opus), 1 designer (fable), 1 QA (sonnet); ≤ 2 review rounds; reports ≤ 40 lines;
interims to the Lead after each wave with the file list and markers (`shared with`, `imports untracked`, `granted`).
Forbidden: dependency changes, root config, files outside owned paths, `git commit|push|reset|checkout`, `rm -r*`, `wrangler
deploy|login|secret|d1 execute --remote|d1 migrations apply --remote|deploy --dry-run`, `eas *`, reading `.env*`, writing the
TEST key anywhere but a shell variable (GM-Q2 only). Gate note (EM batch 8): `apps/worker typecheck … SIGKILL` right after
`apps/mobile typecheck … exit code 1` + `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` is pnpm aborting the sibling after the first failure,
not memory — fix the first failure and re-run the killed package alone (`pnpm -F @tanren/worker typecheck`); no concurrency cap.
Done when: root `pnpm check` green (paste tail) · GM-R APPROVE with blocking fixed · GM-D PASS · GM-Q1 + GM-Q2 measured in the sheet
Log · `grep -rn "imported_activity\|daily_health" apps/worker/src/mcp` = 0 · every touched file listed with markers.
Report: team report format from `.claude/agents/team-lead.md`.

---
## Team sheet (team-lead fills: Assumes · Tasks table · Log · Decisions · Escalations)
Team-lead: opus · GO 13:49:25 (box start, `date`) · hard stop 15:39 · ports 9011/9012 probed 13:44 free (`ps -ef | grep "port 901"` empty,
`curl localhost:901{1,2}/health` exit 7) · briefs: `$S/gm/{common,GM-2,GM-3,GM-5}.md` (S = session scratchpad).

### Assumes (cross-team, copied from charter + found at prep)
- HEAD 25a0b64 carries STLS (no KV, `Tokens`, migration 0006), GM-1 shared schemas, INT-STLS `AVAILABLE_PROVIDERS = ["strava"]`, LEGAL-2a AccountErasure (Lead).
- `TokenSeal` + `INTEGRATION_TOKEN_KEY`, `scheduled.ts` `*/5` cron, `makeLimiter`, `REFRESH_MARGIN` (Strava, ADR-0018) unchanged (Lead/strava, committed).
- Owner TEST key at `$S/secrets/garmin.token`, read only by GM-Q2 into a shell var (Lead).
- Live outside our paths: STLS-F3 edits `apps/worker/src/auth/SessionsLive.ts` (+ test, maybe a workerd test next to `nativeAuth.workerd.test.ts`);
  must not touch `workerdSetup.ts`, `Env.ts`, `wrangler*.jsonc`, `integrations/**`, `api/Integrations*` (Lead, 13:49). Legal stream: legal/landing/sign-in/About.
- LEGAL-2's later mobile `services/AccountErasure.ts` (local wipe) must clear `imported_activity`/`daily_health` too (legal stream) → integration checklist.
- `deployPreflight.checks.ts` does not check `GARMIN_MODE=provider` in production (Lead deploy runbook) → integration checklist.

### Tasks
| id | title | model | depends | wave | box | status |
| --- | --- | --- | --- | --- | --- | --- |
| GM-2 | DB + sync registries (Part A shared members first) | opus | — | W1 | 20 | done (r2) |
| GM-3 | GarminApi + config | sonnet | — | W1 | 20 | done |
| GM-5 | App data layer (polls GM-2 Part A) | opus | GM-2 A | W1 | 20 | done |
| GM-4 | GarminPull + handlers + routes + `AVAILABLE_PROVIDERS` garmin | opus | GM-2, GM-3 | W2 | 20 | done |
| GM-6 | App UI (code + tests; capture in GM-6S) | opus | GM-5 | W2 | 20 | done |
| GM-7 | Docs (from frozen names) | sonnet | GM-3 | W2 | 10 | done |
| REV-1 | Rolling review W1 (GM-2/3/5 files) | reviewer opus | W1 | W2 | 8 | done |
| GM-6S | GM-6 resume: capture 390+1280 on 9011/9012 console mode, card/strip heights | opus (resume) | GM-4, GM-6 | W3 | 10 | done |
| GM-R | Delta review W2 (GM-4/6/7) = final review | reviewer opus | W2 | W3 | 10 | done |
| GM-D | Designer check of GM-6S shots (architect-as-designer) | fable | GM-6S | W4 | 10 | done |
| FIX | review fix rounds (resumes) | — | REV-1, GM-R | W3/W4 | 10 | done |
| GM-Q1 | Local e2e console mode + gallery shots | qa sonnet | FIX | W5 | 20 | done |
| GM-Q2 | Provider mode with TEST key, measured | qa sonnet | GM-Q1 | W6 | 15 | done |
Overlap is promised only inside a wave (one message per wave).

### Decisions (for the Lead to ratify)
- Re-split inside the team: `apps/worker/src/repos/{MemoryStore,MemoryIntegrations(.test)}.ts` → GM-2 (port rule: GM-2 grows `SyncTable` and `IntegrationRepoShape`); GM-4 keeps the rest of `repos/**`.
- GM-3: `GARMIN_*` optional in `Env`/Config with decode defaults (`console`, §0 base URL) so `auth/*.test.ts` env fixtures stay untouched.
- GM-6 capture split into GM-6S (resume after GM-4): the Garmin row/connected state need GM-4's endpoint.
- GM-4 scope + `apps/worker/src/api/IntegrationsHandlers.test.ts` (the "does not list garmin" test, INT-STLS).

### Escalations
- 13:50 grant asked (interim): GM-2 registry-growth lines in `packages/db/src/repositories/AccountErasure{,.test}.ts`, `packages/db/src/seed/month{,.test}.ts`,
  `apps/worker/scripts/seed.ts`; GM-5 registry-growth lines in mobile `syncQueries.test.ts`, `migrations.edge.test.ts`, `SyncEngine{.test,.edge.test}.ts`,
  `CurrentUser.gate.test.ts`, `DataExport.edge.test.ts`, `MockSyncServer.ts`.

### Integration checklist
- [x] LEGAL-2 mobile `services/AccountErasure.ts` local wipe — resolved by the Lead: it enumerates `sqlite_master` at runtime (14:00).
- [ ] SEC-1 (Lead) · `Cache-Control: no-store` middleware on every `Authentication` HttpApi route (GM-R S5; covers `POST /integrations/garmin/connect`) · `curl -si -X POST …/integrations/garmin/connect | grep -i cache-control`
- [ ] `apps/worker/scripts/deployPreflight.checks.ts` · require `GARMIN_MODE=provider` in `env.production` · `pnpm -F @tanren/worker deploy:preflight --skip-gate`
- [ ] `packages/shared/src/dataExport.ts:8` comment "all 8 synced tables" → 12 · read
- [ ] Deploy (Lead) · `wrangler d1 migrations apply tanren --remote` (0007: 2 CREATE TABLE + 5 CREATE INDEX, additive) BEFORE the Worker upload · `wrangler d1 migrations list --remote` shows none pending
- [ ] `docs/design/garmin.md` truth-up (Lead/architect) · §0 `steps` → `totalSteps`, list-item keys settled (drop VERIFY), `startTimeGMT` "yyyy-MM-dd HH:mm:ss" UTC; §2 there is no `schema/index.ts` (drizzle glob); §6 card = `StatRow plain`, 160 high, `cardStats` bare numbers; detail tiles on the page; §11 drop "scratchpad file" wording, add `--test-scheduled`; GarminCursor gains `lastAttemptAt`
- [ ] Follow-up (owner-visible nit) · Worker "today" is UTC → strip may be missing 00:00–02:00 EET; daily budget is full (1 + 2 + 7 = 10) · decide: drop one back-day or fetch local date via profile timezone
- [ ] Follow-up · connect with no activity in the last 30 d shows "0 activities" (GM-Q2: owner's newest activity 2026-08-25) · consider a 90-d first back-fill or "No recent activities" copy
- [ ] Owner O1 · rotate the Garmin TEST key (GM-Q2 used it 14:38–14:41); delete `$S/gmq2` (dev.log holds personal activity data)

### Log
- 13:44 · HOLD: prepared (charter/sheet/design/ADR read, ports probed, GM-2/3/5 briefs in `$S/gm/`).
- 13:49 · GO (Lead) — box start 13:49:25, HEAD 25a0b64, tree clean.
- 13:51→14:01 · W1 · GM-2 engineer/opus · a69da771c5cb9aaf1 · 217k tok · 108 tools · r1 · DONE 9.9 min: shared Part A green 13:52:09; 0007 + GarminImportRepo + setCursor/listActive + push forbidden; shared 418 / db 171 / worker 717 tests green. Deviations: MemoryAccountErasure.ts + callbackRoutes.test.ts (2-line registry/stub, accepted); AccountErasure already listed both tables (LEGAL-2a); schema/index.ts does not exist (drizzle glob).
- 13:51→13:55 · W1 · GM-3 engineer/sonnet · ac3a160f3c0657fb6 · 171k tok · 37 tools · r1 · DONE 4.4 min: GarminApi (5 layers), Config optional GARMIN_*, 62 tests; spec: steps key = totalSteps, startTimeGMT "yyyy-MM-dd HH:mm:ss" UTC. Open: daily 404 → ruled None (GM-4).
- 13:51→13:57 · W1 · GM-5 engineer/opus · af9bd27429e41c79e · 180k tok · 66 tools · r1 · DONE 6.1 min: migration v4, FeedItem, DailyHealthRepo/useDailyHealth, DataExport; mobile 1021 tests; tsc red only feed.tsx:120,187 (→ GM-6b).
- 13:58 · Lead GRANT (all asked files) + re-split accepted + charter path fixes accepted. EM batch 9 deltas (rules 14/15) folded into W2 briefs.
- 14:03 · W2 dispatch (one message): GM-4 opus 20 · GM-6a opus 15 (Settings) · GM-6b opus 20 (Feed/Today) · REV-1 reviewer/opus 8. GM-6 split a/b (disjoint, 3-engineer budget); GM-7 moved to W3 (its real dep is GM-4).
- 14:04→14:15 · W2 · GM-4 engineer/opus · a42d49f941e50001f · 238k tok · 91 tools · r1 · DONE 10.6 min: GarminPull, connect/disconnect, AVAILABLE_PROVIDERS+garmin, MemoryGarminImport; worker 743 tests; smoke :9011 ok.
- 14:04→14:10 · W2 · GM-6a engineer/opus · a8099a4c915995d32 · 183k tok · 62 tools · r1 · DONE 6.4 min: GarminCard, ProviderList, copy, connectGarmin/disconnectGarmin; mobile 1072.
- 14:04→14:14 · W2 · GM-6b engineer/opus · adf27f1abf22f733e · 194k tok · 85 tools · r1 · DONE 10.0 min: ImportedCard (StatRow plain, 158 high), detail route, HealthStrip, banner prop, 4 glyphs; mobile check green.
- 14:04→14:07 · W2 · REV-1 reviewer/opus · a5f2d6229ae5a8a31 · 111k tok · 17 tools · APPROVE, 0 blocking, 4 should + 3 nit (fairness, timeout test, repo tests, SyncEngine dirty test).
- 14:16 · W3 dispatch: GM-4 r1 resume (fairness, race, Strava callback guard — Lead) ∥ GM-2 r1 resume (REV-1 #2–#6) ∥ GM-6S (GM-6b resume, capture 9011/9012) ∥ GM-R reviewer.
- 14:16→14:21 · W3 · GM-R reviewer/opus · aa563ab6ff3e8e8b0 · 150k tok · 45 tools · REQUEST CHANGES: B1 connectGarmin 5 s client timeout vs ≤ 25 s server; S2 lastPullAt shown after failures; S3 disconnect race revives imports; S4 detail tiles invisible; S5 no-store → SEC-1 (Lead); nits UTC today, page-cap comment.
- 14:17→14:22 · W3 · GM-4 r1 · DONE 4.9 min: listActive order by lastPullAt (json_valid guard), race skip, Strava callback erased-user guard; db 175 green; worker red 9 only in index.workerd/oauth rateLimit workerd tests (foreign uncommitted auth/oauth files).
- 14:22 · routed: GM-4 r1b (lastAttemptAt optionalKey in GarminCursor, page-cap comment) · GM-2 r1 + EXISTS-active guard (S3) · GM-6S + detail tiles (S4) · GM-6a B1 pending budget (+1 asked, start 14:26).
- 14:23→14:26 · W3 · GM-4 r1b · DONE 2.5 min: GarminCursor + lastAttemptAt (optionalKey, granted shared), lastPullAt = success only, listActive by lastAttemptAt; page-cap comment. Worker vitest 759 incl. index.workerd :510 green.
- 14:17→14:27 · W3 · GM-2 r1 + addendum · DONE 10 min: REV-1 #2–#6 + disconnect gate (active-integration check + guard stmt in same D1 batch, optional guard on SyncStore.apply); db 177 / worker 760 / mobile tsc 0.
- 14:26 · GM-6a r1 resumed (Lead YES +1): 30 s connect timeout, Connecting state, reload after failed connect.
- 14:26→14:27 · W3 · GM-7 engineer/sonnet · a6b47b06fa180f0b6 · 100k tok · 18 tools · DONE 1.0 min: local-dev §GARMIN_MODE, deploy §Garmin, worker CLAUDE.md (shared with Lead), legal Assumes line. Design corrections listed (§0 totalSteps, §11 scratchpad wording, --test-scheduled).
- 14:28 · GM-R delta pass 1 (GM-2 + GM-4 fixes) resumed; GM-6S + GM-6a r1 still running.
- 14:17→14:28 · W3 · GM-6S (GM-6b resume) · DONE 11 min: 26/28 shots (H3 dark lost to a foreign worker crash), card 160 (158 + border), strip 36 at 56–92, detail tiles moved off the Card, card values cardStats (≤ 7 chars); mobile 1084.
- 14:24→14:28 · GM-6a r1 · DONE 3.4 min: 30 s connect timeout, Connecting state, reload after failed connect, stale-banner hide.
- 14:28→14:31 · GM-R delta 1 + 2 · APPROVE (B1/S2/S3/S4 closed; json() guard accepted). Open should: S1 memory gate fails open; guard-SQL test copy; nits card comment, ≥ 100 km.
- 14:30→14:31 · GM-6a r2 · DONE: About copy provider-aware (ABOUT_BODIES list/strava/garmin).
- 14:30→14:32 · GM-D architect/fable · a220a2307416e4f2d · 91k tok · 25 tools · FIX 3 copy items + re-shoot (labels Calories/Avg HR, 2-line Garmin subtitle, NBSP counts); bare numbers + Connecting label ratified; then PASS without a 2nd round.
- 14:30→14:37 · GM-Q1 qa/sonnet · ac99cc4023e3f02c8 · 101k tok · 45 tools · FAIL step 7 (existing store): HIGH Cursor.ts rank regex \d rejects ranks 10/11 → every pull after a Garmin import 400s; everything else PASS (strip 358x36, D1 2/7, rejected dark pair shot, revoked has no console path, mcp grep 0). Added Cursor.edge.test.ts (it.effect.fails + DEFECT).
- 14:38 · W5: GM-2 r2 (cursor regex + S1 + guard test) ∥ GM-6a r3 (designer copy) ∥ GM-6b r2 (labels, nits, re-shoot H1/H2/H4/H5) ∥ GM-Q2 on port 9013 (9011/9012 held by the re-shoot; deviation from charter ports, band 901x probed free).
- 14:38→14:39 · GM-6a r3 · DONE: subtitle 2 lines, NBSP counts, field already non-editable while busy.
- 14:38→14:41 · GM-Q2 qa/sonnet · aacef6141e4bfce74 · 70k tok · 17 tools · PASS 6/6: bad key 400 rejected 0.67 s; connect 200 in 4.85 s; real rows 10 + 7 (activities needed cursor moved to 2026-08-01: no activity in last 30 d); started_at = startTimeGMT exact (3 rows), duration 20098 = 20097.92; today total_calories 1256 = 249 + 1007; DELETE → 0 live both tables. O1 due.
- 14:38→14:41 · GM-2 r2 · DONE 3 min: Cursor.ts rank \d{1,2} + bound; QA test un-.fails'd; S1 memory gate requires IntegrationRepo (provideMerge in app.ts); exported activeIntegrationGuard; db 182 / worker 760.
- 14:38→14:44 · GM-6b r2 · DONE 5.5 min: labels Calories/Avg HR, card comment, formatDistanceCompact; re-shot H1/H2/H4/H5 ×2 widths ×2 schemes; Q1 step 7 re-run on existing store PASS (pull 200 only, cards + strip gone); mobile 1088.
- 14:42→14:43 · GM-R delta 3 · APPROVE (all rounds). Open, non-blocking: S5 no-store (→ SEC-1), N8 UTC day, N9 page-cap restart.
- 14:44→14:45 · root `pnpm check` (team-lead) exit 0: biome 585 clean, typecheck ok, Test Files 192 passed, Tests 2448 passed.
- 14:47 · end-of-W3 interim with the full commit list to the Lead. All tasks done; no live agents. Wall-clock GO→report ≈ 58 of 110 min.
