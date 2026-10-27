# v5 — Garmin import (personal API token)
Source: plan Amendment 19 (owner, 2026-10-27 13:30) · Status: planned · Updated: 2026-10-27 13:18 · Baseline: after STLS's 0006 commit
Design: `docs/design/garmin.md` (normative; §1–§4 frozen on dispatch) · ADR-0023 (accepted, Lead delegation) · Spike G1:
`docs/research/2026-10-27-garmin-personal-api.md`

## Decisions
- ADR-0023 §1 key pasted in Settings, exchanged for a 24 h JWT, both sealed in the existing `integration` row (`refreshToken` = key,
  `accessToken` = JWT, `expiresAt` = JWT exp); §2 pull on the existing cron, list endpoint only, 4 users/run; §3 two synced
  pull-only tables, migration 0007; §4 feed card + Today strip + Settings card; §5 owner-scoped per Garmin's terms — accepted.
- Deferred (ADR §Not decided): FIT download, HR series, strength → Tanren session mapping, "View on Garmin" link (design §0 VERIFY).
- Forward refs (grep -i garmin `docs/handoff.md`, `docs/retro/incidents.md`, `docs/tasks/step-2.md`, 13:06): handoff 3a (parked
  Garmin → this sheet), step-2 Log 13:04 (dispatch) — no other open items.

## Owner-gated
- O1 After GM-Q2: delete the TEST key at connect.garmin.com/app/settings/personalApiToken and create the real one (the spike
  printed a partial access token once); paste it in Settings → Integrations → Garmin on tanren.me.
- O2 Production vars `GARMIN_MODE=provider`, `GARMIN_BASE_URL` (GM-3 writes them into `wrangler.jsonc` env.production).
- O3 Renew the key before the lifetime chosen at creation (Garmin emails a week before); Settings shows the added date.

## Ordering constraint
STLS (team-stateless, `docs/tasks/v5-auth/team-stateless.md`) owns `apps/worker/src/{auth,oauth}/**`, `Env.ts`, `index.ts`,
wrangler files, `packages/db/migrations/0006_*`, `schema/auth.ts`, mobile `settings/{AccountSection,settingsCopy}` until ≈ 14:40.
GM-1 (shared only) may start now; GM-2…GM-6 start after STLS's 0006 commit (migration 0007 numbers after it; `Env.ts`,
`index.ts`, `wrangler.jsonc` edits in GM-3/GM-4 must land on the committed tree). GM-6's `IntegrationsSection.tsx`/
`integrationsCopy.ts` are adjacent to STLS-5's `AccountSection.tsx`/`settingsCopy.ts` — different files, no shared symbol.

## Tasks
| id | title | role / model | depends on | files (exclusive) | box | status |
| --- | --- | --- | --- | --- | --- | --- |
| GM-1 | Shared: `garmin.ts` entities, `Provider` + `"garmin"`, `ExportFailureReason` + `token_rejected`, `GarminConnectRequest`, `GarminTokenRejected`, `ProviderStatus.imports` (optionalKey), ids, `EntityName`/`SyncTable`, `row.ts`, `sync.ts` members, `GarminCursor` | engineer / sonnet | — | `packages/shared/src/{garmin.ts,garmin.test.ts,integrations.ts,integrations.test.ts,ids.ts,common.ts,row.ts,sync.ts,index.ts}` | 20 min | todo |
| GM-2 | DB: `schema/garmin.ts`, migration 0007, `SyncStore` registries, `GarminImportRepo`, `IntegrationRepo.{setCursor,listActive}`, worker `sync/SyncStore.ts` wrap, `Sync.push` forbids the two tables | engineer / opus | GM-1, STLS 0006 committed | `packages/db/src/schema/{garmin.ts,index.ts,integration.ts (comment)}`, `packages/db/migrations/0007_garmin_import.sql` + `meta/`, `packages/db/src/sync/SyncStore.ts` (+ new `SyncStore.garmin.test.ts`), `packages/db/src/repositories/{GarminImport.ts,GarminImport.test.ts,Integration.ts,Integration.test.ts,index.ts}`, `apps/worker/src/sync/{SyncStore.ts,Sync.ts,Sync.test.ts}`, `apps/worker/src/testing/workerdSetup.ts` (comment) | 20 min | todo |
| GM-3 | Worker: `GarminApi` (http + console), config/env `GARMIN_MODE`, `GARMIN_BASE_URL`, `GARMIN_CONSOLE_FAIL`, JWT `exp` decode, list-item mapping (`sportOf`), wrangler vars | engineer / sonnet | GM-1, STLS committed | `apps/worker/src/integrations/{GarminApi.ts,GarminApi.test.ts}`, `apps/worker/src/{Config.ts,Config.test.ts,Env.ts,cloudflareEnv.d.ts}`, `apps/worker/wrangler.jsonc`, `wrangler.test.jsonc`, `apps/worker/src/testing/fixtures.ts` | 20 min | todo |
| GM-4 | Worker: `GarminPull` (drain/drainUser, cursor, re-exchange, revocation), `scheduled.ts` second drain, connect/disconnect handlers + `IntegrationsApi` routes, status `imports` | engineer / opus | GM-2, GM-3 | `apps/worker/src/integrations/{GarminPull.ts,GarminPull.test.ts,GarminPull.workerd.test.ts,scheduled.ts}`, `apps/worker/src/api/{IntegrationsApi.ts,IntegrationsHandlers.ts}`, `apps/worker/src/api/Routes.edge.test.ts`, `apps/worker/src/app.ts` (layers only) | 20 min | todo |
| GM-5 | App data: local migration v4, `LocalStore` members, `FeedRepo` → `FeedItem`, `useDailyHealth`, `DataExport` | engineer / opus | GM-1 | `apps/mobile/src/store/{migrations.ts,migrations.test.ts}`, `apps/mobile/src/services/{LocalStore.ts,FeedRepo.ts,FeedRepo.test.ts,DailyHealthRepo.ts,DailyHealthRepo.test.ts,DataExport.ts,DataExport.test.ts}`, `apps/mobile/src/hooks/{useFeed.ts,useDailyHealth.ts}`, `apps/mobile/src/runtime.ts` (layer line) | 20 min | todo |
| GM-6 | App UI: Settings Garmin row + `GarminCard` + `[provider].tsx` branch + copy; `Integrations.ts` connectGarmin/disconnectGarmin; `ImportedCard` + feed rows + imported detail route; Today `HealthStrip` | engineer / opus | GM-5 (FeedItem, hook), GM-1 names; STLS committed | `apps/mobile/src/components/integrations/{GarminCard.tsx,ProviderList.tsx}`, `apps/mobile/src/components/settings/{integrationsCopy.ts,integrationsCopy.test.ts}`, `apps/mobile/src/services/{Integrations.ts,Integrations.test.ts}`, `apps/mobile/src/hooks/useIntegrations.ts`, `apps/mobile/app/settings/integrations/[provider].tsx`, `apps/mobile/src/components/feed/{ImportedCard.tsx,feedGroups.ts,feedGroups.test.ts,feedSelection.ts,feedSelection.test.ts}`, `apps/mobile/app/(tabs)/{feed.tsx,today.tsx}`, `apps/mobile/app/activity/imported/[id].tsx`, `apps/mobile/src/components/today/HealthStrip.tsx`, `apps/mobile/src/components/TodayReady.tsx` (the `banner` prop only; `TodayReadyProps` there), `apps/mobile/src/ui/iconPaths.ts` (+ sport glyphs), `apps/mobile/CLAUDE.md` Layout lines | 20 min | todo |
| GM-7 | Docs: `local-dev.md` §GARMIN_MODE, `deploy.md` §O2, worker `CLAUDE.md`, hand §10 paragraph to the legal sheet (`docs/tasks/v5-legal.md` Assumes) | engineer / sonnet | GM-3, GM-4 | `docs/design/local-dev.md`, `docs/design/deploy.md`, `apps/worker/CLAUDE.md`, `docs/tasks/v5-legal.md` (one Assumes line) | 10 min | todo |
| GM-R | Cross-package review: design §5 line by line; `grep -rn "token\|key" apps/worker/src/integrations/Garmin*.ts apps/worker/src/api/IntegrationsHandlers.ts` shows no interpolation of a secret into a log/error; `grep -rn "imported_activity\|daily_health" apps/worker/src/mcp` = 0; push `forbidden`; Effect rules | reviewer / opus | GM-4, GM-6 | read-only | 25 min | todo |
| GM-D | Designer check of GM-6's screenshots against design §6–§8 (widths at 390, strip 36 high, card 170, 1280 columns) | designer (fable) | GM-6 | read-only + `docs/tasks/v5-garmin.md` Log | 10 min | todo |
| GM-Q1 | Local e2e per design §11 with `GARMIN_MODE=console`; screenshots 390 + 1280 to the review gallery | qa / sonnet | GM-R clean | Log only | 20 min | todo |
| GM-Q2 | Measured, provider mode with the owner's TEST key read from `$S/secrets/garmin.token` (never into a repo file or log): ≥ 1 real `imported_activity` row; `startedAt` = Garmin's start ±1 min; today's `totalCalories` = Garmin Connect's number; `DELETE` soft-deletes all rows (`SELECT count(*) … WHERE deleted_at IS NULL` = 0); then report "O1 due" | qa / sonnet | GM-Q1 | Log only | 15 min | todo |

Parallel groups: {GM-1} → (after STLS 0006 commit) {GM-2, GM-3, GM-5} → {GM-4, GM-6} → {GM-7} → GM-R ∥ GM-D → GM-Q1 → GM-Q2 → O1.
Case-collision check 13:17 (`ls <dir> | tr A-Z a-z | sort | uniq -d`): `garmin.ts` (shared, db schema) vs `GarminApi.ts`/`GarminPull.ts`
(worker) are in different directories; `GarminCard.tsx` has no sibling `garminCard.*`; `DailyHealthRepo.ts` no sibling. No ties.

## Frozen contracts
- §1 schemas and names: `Provider`, `ExportFailureReason + "token_rejected"`, `GarminConnectRequest`, `GarminTokenRejected` (400, reasons
  `rejected | not-configured | unreachable`), `ProviderStatus.imports?` `{ lastPullAt, lastError, activities, days }`, `ImportedActivity`,
  `DailyHealth`, `ImportedSport`, `sportOf`, `GarminCursor`, ids, `SyncTable` + `importedActivity`/`dailyHealth`, `ROW_TABLE` names.
- §2 table/index names; `GarminImportRepo.{upsertActivities,upsertDays,softDeleteAll,counts}`; `IntegrationRepo.{setCursor,listActive}`.
- §3 env names, `GarminApi.{exchange,profile,activities,daily}`, `GarminApiError`, `GarminPull.{drain,drainUser}`, `GARMIN_MAX_USERS_PER_RUN = 4`.
- §4 routes; §6 `FeedItem`/`FeedRow "Imported"`; §7 `useDailyHealth(localDate): Option<DailyHealth>`; §8 copy table.

## Assumes (cited)
- Garmin facts: G1 Observation table (host, exchange endpoint, 401/400 shapes, activity list paging, usersummary daily fields) and
  G1 Answer (24 h JWT, key lifetimes, no rate headers, terms). Still `VERIFY:` (design §0): list-item field names in `$S/garmin/spec.json`,
  the `steps` key, the activity URL.
- `IntegrationsStatus` already loops `Provider.literals` (`apps/worker/src/api/IntegrationsHandlers.ts`, `Effect.forEach(Provider.literals`),
  so adding the literal yields a Garmin row with zero export counts; `PROVIDER_NAMES: { [P in Provider] }` (`integrationsCopy.ts`) and
  `ProviderListProps.strava` force the compile errors that guide GM-6.
- `integration.scope` is a free `text NOT NULL` column written on upsert (`packages/db/src/schema/integration.ts`, `scope: text("scope")`);
  Strava reads it nowhere but the row (`grep -n "scope" apps/worker/src/integrations/*.ts` — GM-2 confirms before reusing it as the cursor).
- `REFRESH_MARGIN = { hours: 1 }` and `nextAttempt`/`failureOutcome` live in `apps/worker/src/integrations/ExportQueue.ts` (export-only change if GM-4 reuses them).
- Synced-table write path with `server_seq` from `sync_clock`: `packages/db/src/sync/SyncStore.ts` (`apply`), db.md §3; GM-2 writes imports through it, never raw INSERT.
- `Sync.push` rejection shape: `RejectReason` literals `forbidden | missingParent | immutableFieldChanged | invariantViolated` (`packages/shared/src/sync.ts`).
- Local migrations append-only, `MIGRATIONS = [v1, v2, v3]` (`apps/mobile/src/store/migrations.ts`), `table(name, columns)` + `dirtyIndex(name)` helpers there.
- Today states `Loading | Empty | Failed | Ready` (`apps/mobile/app/(tabs)/today.tsx`, `Match.tagsExhaustive`); `TodayReady` takes `accessory`/`footer` — GM-6 adds `banner`.
- Feed: `FeedRepo.read → ReadonlyArray<Activity>`, `useFeed(limit)`, `FeedRow` union `Header | Card` (`feedGroups.ts`); tests that change: `feedGroups.test.ts` `toEqual` rows, `FeedRepo.test.ts` returned arrays, `feedSelection.test.ts` input type (design §6).
- Scheduled handler subrequest ceiling 50 on Workers Free (ADR-0018 Context, Cloudflare docs 2026-10-26) → 4 users × ≤ 10 calls.

## Log
- 13:18 · architect: ADR-0023, design, sheet written; G1 landed 13:10 and the design was rebased on its facts (key→JWT, list paging, usersummary).

---

# Briefs (paste-ready; every brief: permissions = edit only the listed files; `pnpm check` output in the report; no `git`)

### GM-1 — Shared schemas (sonnet, 20 min)
Design `docs/design/garmin.md` §1 verbatim. Add `packages/shared/src/garmin.ts` (`ImportedSport`, `ImportedActivity`, `DailyHealth`
+ Insert/Patch per `program.ts`, `sportOf`, `GarminCursor`), `ids.ts` two brands, `common.ts` `EntityName` + `SyncTable`, `row.ts`
codecs + `ROW_TABLE`/`ROW_KEYS`, `sync.ts` `SYNC_TABLES` + `SyncChange` members, `integrations.ts` additive (`Provider`,
`ExportFailureReason`, `GarminConnectRequest`, `GarminTokenRejected`, `ProviderStatus.imports` optionalKey), `index.ts` exports.
Tests: `garmin.test.ts` decode/encode round trips incl. Option fields and `sportOf("running") === "running"`, unknown → `"other"`;
existing `integrations.test.ts` fixtures still pass unchanged (optionalKey). Done: `pnpm check` green; report the list of exported names.
Time box: 20 min.

### GM-2 — DB + sync registries (opus, 20 min; after STLS 0006 commit)
Design §2. Tables with `rowColumns()` + `userSeqIndex` + the unique indexes; migration `0007_garmin_import.sql` via drizzle-kit;
`SyncStore.ts` registries for both tables (encode, no parents, wrap); `GarminImportRepo` writing through `SyncStore.apply`;
`IntegrationRepo.setCursor/listActive`; worker `Sync.push` rejects `importedActivity`/`dailyHealth` changes with `forbidden`
(test). Confirm `scope` is unused by Strava beyond storage (grep in the brief's Assumes) and write the column comment.
Done: `pnpm check` green; `SyncStore.garmin.test.ts` proves upsert idempotency (same externalId twice → 1 row, `server_seq` advanced)
and that a pull after `softDeleteAll` returns `deletedAt: Some`. Time box: 20 min.

### GM-3 — GarminApi + config (sonnet, 20 min; after STLS commit)
Design §0 + §3. `GarminApi` port with `layerHttp` and `layerConsole`; `Config` fields `garminMode`, `garminBaseUrl`, `garminConsoleFail`;
`Env.ts`/`cloudflareEnv.d.ts`/`wrangler.jsonc` (local `console`, production `provider` + base URL) / `wrangler.test.jsonc`. Read list-item
field names from `$S/garmin/spec.json` (scratchpad; `jq '.paths["/activitylist-service/activities/search/activities"]'`) and record them
in the mapper's comment + design §0 (Log line). JWT `exp` decode without verification (`Timestamp`), fallback `now + 23 h`.
Never read `$S/secrets/*`. Tests: http layer against a stubbed `fetch` (401 → `token_rejected`, 429 → `rate_limited`, item mapping,
`exp` decode); console fixture deterministic. Done: `pnpm check` green. Time box: 20 min.

### GM-4 — GarminPull + handlers + routes (opus, 20 min)
Design §3 (pull algorithm, budget, cursor, revocation) + §4 routes + §5 checklist. `scheduled.ts` second drain with its own `catchCause`;
`IntegrationsApi` two endpoints; handlers (`limit("garmin-connect:…")`, exchange → profile → seal → upsert → `drainUser` 5 s →
`ProviderStatus`); `imports` in status from `GarminImportRepo.counts` + cursor. Workerd test: console layer, one cron call → 2 activities
+ 7 days present; connect twice → one row; `DELETE` → rows soft-deleted; status `imports.activities === 2`. Log lines contain
`userId` and `reason` only (test asserts no `Bearer`/key substring in captured logs). Done: `pnpm check` green. Time box: 20 min.

### GM-5 — App data layer (opus, 20 min)
Design §6 (`FeedItem`), §7 (`useDailyHealth`), §9 (migration v4, `LocalStore` members, `DataExport`). Update the three tests named in §6
to the `FeedItem` wrapper (`toEqual` rows become `{ _tag: "session", activity }`). `DailyHealthRepo.today(localDate)`. Done: `pnpm check`
green; `migrations.test.ts` asserts `user_version === 4` and both tables exist; `FeedRepo.test.ts` interleaves one imported row by
`startedAt`. Time box: 20 min.

### GM-6 — App UI (opus, 20 min; after STLS commit)
Design §6 `ImportedCard` + `FeedRow "Imported"` + `app/activity/imported/[id].tsx`; §7 `HealthStrip` in Today `Empty` and `Ready`
(`TodayReady` `banner` prop); §8 `ProviderList` Garmin row, `GarminCard`, `[provider].tsx` branch, copy table, `Integrations.ts`
`connectGarmin/disconnectGarmin`, `useIntegrations` `garmin`. Width arithmetic per §6/§7 tables. Try the activity URL once (§0 VERIFY;
no link if it does not open). Done: `pnpm check` green; `ui-check` on web :8790 with `GARMIN_MODE=console`: screenshots 390 + 1280 of
integrations list, garmin card (disconnected, connected), feed with an imported card, imported detail, Today with strip, to the review
gallery; report measured card height and strip height. Time box: 20 min.

### GM-7 — Docs (sonnet, 10 min)
`local-dev.md` §GARMIN_MODE (+ `GARMIN_CONSOLE_FAIL`), `deploy.md` §O2 vars, worker `CLAUDE.md` layout lines for `GarminApi.ts`/`GarminPull.ts`,
and one Assumes line in `docs/tasks/v5-legal.md` quoting design §10 verbatim. Time box: 10 min.

### GM-R / GM-D / GM-Q1 / GM-Q2 — see the task table rows (criteria are complete there); boxes 25 / 10 / 20 / 15 min.
- 14:31 · GM-D (fable): FIX (3 items + 1 re-shoot) — feed stat labels kcal/Avg bpm → Calories/Avg HR (bare numbers ratified); Garmin list subtitle 3 lines at 390 → 2; connected body breaks "2 / activities" → NBSP; About card in H1/H2/H4 shows the Strava-only text but ABOUT_BODIES scope wiring landed 14:30 after the shots → re-shoot proves it. HealthStrip, imported detail, "Connecting… up to 30 s" ratified

## GM-F1 — Garmin cron pull inside the Workers Free CPU budget

Log
- 2026-10-27 15:04–15:10 engineer: `GARMIN_PAGE_SIZE` 200 → 50, `GARMIN_MAX_USERS_PER_RUN` 4 → 1, new `GARMIN_WINDOW_DAYS = 10`: the activity query spans 10 days from `activitiesSince` and a fully read window moves the cursor to the day after it (capped at yesterday). Needed because the old "re-read the cut window from offset 0" never got past 2 pages (100 activities at the new size). Back-fill test: 120 activities over 3 runs (60 / 90 / 120, cursor 10-07 / 10-17 / 10-26), 9 / 2 / 2 Garmin calls, 2 import writes per run. Lean decode confirmed (already declared only the mapper's keys) + a test with noisy keys. Prod CPU recipe in deploy.md §Garmin.

## GM-F2 — cron CPU: slim layer, one runtime per isolate

- 2026-10-27 15:22–15:29 engineer: `integrations/scheduled.ts` now exports `scheduledLayer(env)` (only the drains' ports, one D1 client, no Better Auth/OAuth/MCP/HttpApi) and `makeScheduled(layer)` (lazy `ManagedRuntime`, built on the first tick, reused); `index.ts` builds it once at module scope; `runScheduled` removed. Tests: `scheduled.test.ts` (build once across two runs, both drains each run, Garmin survives an export defect, failed build resolves), `runtime.bench.test.ts` (Node proxy medians full=2.36 ms previous=0.47 ms slim=0.28 ms). Production cpuTime check owed by the Lead (deploy.md §Garmin CPU check).
