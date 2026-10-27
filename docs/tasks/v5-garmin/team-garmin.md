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
TEST key anywhere but a shell variable (GM-Q2 only), more than 2 live `tsc`/gate runs at once in the team (a worker typecheck was
SIGKILLed for memory at 15:00 with three streams gating).
Done when: root `pnpm check` green (paste tail) · GM-R APPROVE with blocking fixed · GM-D PASS · GM-Q1 + GM-Q2 measured in the sheet
Log · `grep -rn "imported_activity\|daily_health" apps/worker/src/mcp` = 0 · every touched file listed with markers.
Report: team report format from `.claude/agents/team-lead.md`.

---
## Team sheet (team-lead fills: Assumes · Tasks table · Log · Decisions · Escalations)
