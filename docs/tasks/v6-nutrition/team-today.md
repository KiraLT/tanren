# Team charter: Nutrition Today + Health (v6, ADR-0025)
Status: skeleton 2026-10-27 14:09 (architect) · team-lead prep 14:46–15:0x on HOLD · Lead sheet: `docs/tasks/v6-nutrition.md` (team "nutri-today": mission, owned paths, frozen contracts, Assumes — normative) · Design: `docs/design/nutrition.md` §1, §3–§6

Mission: data layer on device (food entries, day/week aggregates), `NutritionStrip` on Today, `/health` root-stack route with
hero, `DayBars`, protein days, insights, week review, Garmin activities list, desktop columns (§6).
Owned (exclusive; charter + Lead rulings of the HOLD message):
`apps/mobile/src/services/{FoodEntryRepo,FoodEntryRepo.test,NutritionRepo,NutritionRepo.test}.ts`,
`apps/mobile/src/services/runtime.ts` (layer lines; the charter's `src/runtime.ts` does not exist — `ls` 14:50),
`apps/mobile/src/hooks/{useNutritionDay,useNutritionWeek}.ts`, `apps/mobile/src/components/today/NutritionStrip.tsx`,
`apps/mobile/src/components/health/{DayBars,HealthHero,WeekReviewCard,InsightList}.tsx` + pure helpers
`{dayBarMath,dayBarMath.test,nutritionText,nutritionText.test}.ts` (Decision D1), `src/hooks/useFoodEntryActions.ts` (D5), `apps/mobile/app/health/index.tsx` (Lead ruling:
`/health` is a root-stack route, not a tab; nutri-food owns `app/health/add.tsx`), `apps/mobile/app/(tabs)/today.tsx` (strip lines),
`apps/mobile/src/ui/iconPaths.ts` (+ `fork` glyph only), `apps/mobile/CLAUDE.md` (team-lead only: our section + Status, Edit).
Read-only (consume, never edit): Garmin `HealthStrip.tsx`, `TodayReady.tsx` (`banner?: ReactNode`), `ImportedCard.tsx`,
`importedText.ts` (`grouped`), `FeedRepo`, `GarminCard`, `integrations/**`, `useDailyHealth`, `DailyHealthRepo`,
`ImportedActivityRepo`; N-F0's `packages/shared/**`, `store/{migrations,seed}.ts`, `LocalStore.ts`, `DataExport.ts`;
`ProfileRepo`, `PlanWeekRepo`, `useHistory` (`useStoreRead`, `HistoryState`), `src/ui/**` except `iconPaths.ts`.
Adjacent (another stream's, live): Garmin W3 fix rounds (their mobile files above); N-F0 (shared + `LocalStore`/`migrations`/
`DataExport`); nutri-server (`packages/db`, `apps/worker`); nutri-food (`app/health/add.tsx`, `app/settings/nutrition.tsx`,
`app/settings.tsx` one row, `app/_layout.tsx` modal line, `components/health/{FoodLog,QuickAddSheet}*`, `components/settings/
{NutritionSection,nutritionCopy}*`) — FoodLog is wired into `/health` by INT-N, not by us.
Ports: web **9032** (probed 14:46: `ps -ef | grep "port 903"` empty, `curl localhost:9032` refused); re-probe at GO. Never
8787/8790/8081/8991/9011/9012/9021/9031/9033.
Forbidden (every brief): dependency changes, root config, files outside owned paths, `git commit|push|reset|checkout`, `rm -r*`,
`wrangler deploy|login|secret|d1 execute --remote|d1 migrations apply --remote|deploy --dry-run`, `eas *`, reading `.env*`;
servers via pid file + guarded kill + `ps` re-check.
Registry growth (granted): one-line fills in exhaustive consumers outside the owned paths (e.g. a `Record<IconName, …>` test for
`fork`) — listed as `registry:` lines in interims and the report.

## Task table
| id | title | role/model | depends | wave | box | status |
| --- | --- | --- | --- | --- | --- | --- |
| N-M1 | Data layer: `FoodEntryRepo`, `NutritionRepo.day/week`, hooks, runtime layers, `fork` glyph | engineer/opus | N-F0 | W1 | 20 | done (ad0efd02a935d6990, r4) |
| N-M2 | `NutritionStrip` + `nutritionText` + Today wiring; ui-check 390 hidden state | engineer/opus | N-F0 (N-M1 signatures frozen below) | W1 | 20 | done (a002b44fc43fe77f5) |
| N-M3 | `/health` Loading/Off/Ready, sections §6, `DayBars`, columns ≥ 900; ui-check Off 390 + 1280 | engineer/opus | N-M1 (+ N-M2 `nutritionText`) | W2 (Lead Q1: budget 2) | 20 | done (a5c4adb11d3e0efea, r3) |
| REV-1 | Rolling review of N-M1 + N-M2 | reviewer/opus | N-M1, N-M2 | W2 | 6 | done APPROVE |
| REV-2 | Rolling review of N-M3 W2 | reviewer/opus | N-M3 | W3 | 8 | done APPROVE |
| N-MC | Capture N1–N3 (390/1280 × light/dark, Ready with data) on 9032 against a local worker on **9035** seeded with N-S1's `month.ts` nutrition rows = resume of N-M3 (Part B) | engineer (resume) | N-M3, N-S1 seed in tree | W3 | 14 | done (12 shots + N2 re-shoot) |
| N-MR | Delta review (N-M2, N-M3, fixes) = final review | reviewer/opus | N-M2, N-M3 | W3 | 10 | done APPROVE (2 delta passes) |
| N-MD | Designer verdict on N-MC shots (architect-as-designer) | architect/fable | N-MC | W3 | 10 | done N1/N2/N3 PASS 4 (N2 after r2) |
| FIX | review + designer fix rounds (resumes of the owners) | — | REV-1, N-MR, N-MD | W3/W4 | 10 | done (N-M1 r1–r4, N-M2 r1, N-M3 r2–r3) |
Overlap is promised only inside a wave (one message per wave, `run_in_background: true` boolean, ack checked).
Time box 75 from GO: W1 20 → REV-1 ∥ N-MC 10 → N-MR ∥ N-MD 10 → FIX 10 → root gate + CLAUDE.md 5 (≈ 55 + slack).

## Frozen contracts
From the Lead sheet: shared `FoodEntry`, `dayTotals`, `nutritionTargets`, `insights`, `DayTotals` field names (§3) — exact symbol
names pasted from N-F0's report at GO (below). Team-internal, frozen at prep 14:58 (N-M2/N-M3 build against them in parallel):
- `FoodEntryRepo` — FROZEN 14:59 (relayed to nutri-food via the Lead). File `apps/mobile/src/services/FoodEntryRepo.ts`,
  `class FoodEntryRepo extends Context.Service<FoodEntryRepo, FoodEntryRepoShape>()("@tanren/FoodEntryRepo")`, `static layer`
  (needs `LocalStore | CurrentUser | IdGenerator`), in `runtime.ts` `AppLayer`. Exported input type
  `type FoodEntryDraft = Omit<FoodEntryInsert, "kcal" | "proteinG" | "carbsG" | "fatG">` = `{ loggedAt: DateTime.Utc; meal: Meal;
  source: FoodSource; items: FoodItems; note: Option<Note> }` (shared `FoodEntryInsert` = `FoodEntry` minus `ROW_COLUMNS`
  `id,userId,createdAt,updatedAt,deletedAt`). The REPO assigns `id` (IdGenerator), `userId` (`ownerId(CurrentUser)`), `createdAt =
  updatedAt = now`, `deletedAt = None`, and the four totals = `totalsOf(items)` (SyncStore invariant); writes `{ dirty: true }`.
  `insert(draft: FoodEntryDraft) → Effect<FoodEntry, StoreError>`;
  `list(range: { readonly from: DateTime.Utc; readonly to: DateTime.Utc }) → Effect<ReadonlyArray<FoodEntry>, StoreError>` (live rows,
  `loggedAt` in [from, to), `loggedAt` asc; a day's entries reach the UI as `NutritionDay.day.entries` — no `listDay`);
  `softDelete(id: FoodEntryId) → Effect<boolean, StoreError>` (true = a live row was deleted: `deletedAt = updatedAt = now`, dirty;
  false = missing or already deleted); `restore(id: FoodEntryId) → Effect<boolean, StoreError>` (true = a deleted row came back:
  `deletedAt = None`, `updatedAt = now`, dirty; false otherwise). `StoreError` from `./SqlDriver`.
- `NutritionRepo` (`src/services/NutritionRepo.ts`): `day(localDate) → Effect<NutritionDay, StoreError>` with
  `NutritionDay = { readonly day: DayTotals; readonly insights: ReadonlyArray<Insight> /* ≤ 3, group order */ }`;
  `week(weekStart: LocalDate /*Monday*/) → Effect<HealthWeek, StoreError>` with
  `HealthWeek = { readonly review: WeekReview; readonly activities: ReadonlyArray<ImportedActivity> /* week, startedAt desc */ }`.
- Hooks: `useNutritionDay(localDate) → HistoryState<NutritionDay>`, `useNutritionWeek(weekStart) → HistoryState<HealthWeek>`
  (both on `useStoreRead`, `src/hooks/useHistory.ts:37`; re-read on every `StoreEvents` change).
- `nutritionText.ts` (N-M2; N-M3 imports): `kcalText(n) → "1,420"` (separator per Lead answer Q2), `asOfText(at: DateTime.Utc) →
  "as of 14:05"` (device zone), `burnedText(day) → "Burned 1,840" | "Burned: no data"`, `stripLines(nd: NutritionDay) →
  { value: string /* "620 kcal left" | "120 kcal over" | "1,420 kcal" (no targets) */; detail: string; insight: Option<string>;
  accessibilityLabel: string }`.

## Assumes (cited; re-read at 14:50 against the tree)
- `useDailyHealth(localDate) → Option<DailyHealth>` (`src/hooks/useDailyHealth.ts`, GM-5); `DailyHealthRepo` has ONLY
  `today(localDate)` (`src/services/DailyHealthRepo.ts:12`) → `NutritionRepo` reads `daily_health` for a date range with its own
  SELECT (no edit to the Garmin file). Same for `imported_activity` (`ImportedActivityRepo` has only `byId`, `:11`).
- `TodayReady banner?: ReactNode` exists (`src/components/TodayReady.tsx:44`, rendered `:218`); `(tabs)/today.tsx:80`
  `ReadyHealthStrip` passes it with the gutter, `:94` Empty renders `<HealthStrip />` → the fallback (strip above `TodayReady`) is not needed.
- `HealthStrip` formats with `grouped` (comma: `importedText.ts:16`, "1,840 kcal") — design §5 says thin space → Lead Q2.
- `BannerTone = "info" | "success" | "danger"` (`ui/Banner.tsx:10`, no `neutral`) → insights `Banner tone="info"`.
- `ListRow` has no `children` (only `ListGroup` does, `ui/ListRow.tsx:39`) → protein days = `Card padding=16` + `headline` + `SegmentBar`.
- `IconButton {icon, accessibilityLabel, onPress, size, variant: "plain"|"filled", disabled}` (no `tone`).
- `ColumnSplit = "7/5" | "6/6" | "5/7"` (`ui/columns.ts:5`); `Page {aside, split, wide, sectionGap, padded, header}`; activity detail
  (feed.md §5) = `Page wide` + `Columns 7/5` → `/health` Ready at desktop = `Page wide` + `Columns split="7/5"`.
- `ImportedCard({ activity, onPress })` (`feed/ImportedCard.tsx:11`); imported detail route `/activity/imported/[id]`.
- `ProfileRepo.get: Effect<Option<Profile>>`, `save(patch)` (`services/ProfileRepo.ts:25,30`); `ownerId(CurrentUser)`
  (`CurrentUser.ts:161`); `LocalStore.write(rows, { dirty })` (`LocalStore.ts:102`); test driver `nodeSqlDriverLayer` from
  `SqlDriver.testing` (pattern `DailyHealthRepo.test.ts:11`).
- `PlanWeekRepo.currentWeek: Effect<Option<PlanWeekView>, StoreError, CurrentTimeZone>` (`PlanWeekRepo.ts:71`) → `workoutsPlanned`;
  `workout_session.finishedAt` (`store/migrations.ts:90`) → `workoutsDone`; `weekStartOf` (local Monday, `progressMath.ts:26`),
  `localDateOf(new Date())` (`planFormat.ts:38`).
- vitest runs `src/**/*.test.ts` in `node` only (`vitest.config.ts:7–8`) → no `.test.tsx`; component tests are pure-helper tests (D1).
- Typed routes on (`app.json:41`); `.expo/types/router.d.ts` regenerates on `CI=1 expo start` after a route file is added.
- Day boundaries on device = device zone (as Today/HealthStrip); MCP uses `profile.timezone` (server). Same for the owner (one zone).
- Gallery badge prefix `N` is free (`gallery.json` prefixes: A AD D DW F FW G K L LA LM LW M MW OA P Q R S T W X).
- N-F0 provides at GO: `FoodEntry`, `FoodEntryId`, `FoodItem(s)`, `Totals`, `totalsOf`, `dayTotals`, `nutritionTargets`, `insights`
  (+ input type), `InsightRule`, `DayTotals`, `WeekReview`, `NutritionProfile` on `Profile.nutrition`, `LocalStore` member
  `foodEntry`, mobile v5 `food_entry` table.

## Lead rulings folded into every brief
Budget = goal intake (`kcalLeft = targets.kcal − eaten`; Garmin burn does not raise it) · Garmin `totalCalories` is information,
shown "as of HH:MM" (`burnedAsOf`) · "Burned: no data" when no `daily_health` row · `eatBackActive` default off (only then
`budget += max(activeBurned, 0)`) · insights ≤ 3 in §5 group order (kcal, protein, logging, week) · `/health` root-stack route
`app/health/index.tsx` · no legacy (plan Amendment 23; engineer.md 17) · engineer.md 15 (barrel / CLAUDE.md line last;
engineers do not write `apps/mobile/CLAUDE.md`) · registry growth granted · designer verdict + capture per `ui-check`
(shots `docs/design/screens/UI-NUTRI-*`, badges `N1…`, rows fragment `UI-NUTRI-rows.html`, `gallery.mjs` plain run).

## Decisions (for the Lead to ratify)
- D1 · Component "tests" are pure-helper tests: `DayBars.test` → `components/health/{dayBarMath,dayBarMath.test}.ts` (not `dayBars.ts`: TS1261 case collision with `DayBars.tsx` on macOS) (column model:
  heights, labels, a11y text); the strip's "snapshot test of three lines" → `nutritionText.test.ts` (vitest is node, `*.test.ts` only).
- D2 · `NutritionRepo` reads `daily_health`, `imported_activity`, `workout_session`, `food_entry` with its own range SELECTs;
  Garmin's single-row repos are consumed as-is, not extended.
- D3 · `/health` 7-day bars = the Mon–Sun week containing today (same window as `get_week_review` and the week card); future days
  render as empty columns with their letter. RATIFIED by the Lead 14:56 (Q5).
- Lead answers 14:56: Q1 budget 2 (N-M1 ∥ N-M2, then N-M3) · Q2 commas (shared `formatInt`, N-F0 switched) · Q3 no in-app demo
  seed; captures use the local worker + N-S1's `packages/db/src/seed/month.ts` nutrition rows (capture waits for them) · Q4 consume
  shared, never fork · Q5 yes. Programs team will add `<TodayPrograms />` to `(tabs)/today.tsx` via the Lead → our edits additive.
- D4 · Insights for a day use shared `InsightInput.week` = the 7 days ENDING that date (nutrition.ts:276), while the bars and the
  week card use Mon–Sun (D3): `NutritionRepo.day` reads date−6…date, `.week` reads Mon…Sun.

- D5 · FoodLog wiring into `/health` done in-team (Lead relay 15:31) with a new hook `src/hooks/useFoodEntryActions.ts`
  (`softDelete`/`restore` → Promise<boolean>, never rejects, requests a sync) — INT-N checklist item removed.
- D6 · In-team grants: N-M1 one line in `src/hooks/useHistory.ts` (`StoreRead` requirement `| NutritionRepo`, deletes the duplicate
  `useNutritionRead`); N-M3 the `HEALTH_ROUTE` cast removal in N-M2's `NutritionStrip.tsx`.
- D7 · Week review card = two `StatRow plain` rows of two (StatRow `plain` ignores `direction`, `StatRow.tsx:54`; four slots of 72.5
  truncate "−310 kcal/day") — design §6 height 152 → amendment for the Lead/architect; designer scores the 2x2.
- D8 · Strip: rows 2–3 indented 24 (under "Nutrition"); value "1,420 kcal eaten" when no targets; "Burned: no data" kept (overrides
  §6's drop); "as of" in the a11y label only on Today, visible on /health under the hero.

## Escalations
- 15:35 · grant ask: export `useHealthLine()` from Garmin's `HealthStrip.tsx` (REV-1 R3: today.tsx duplicates its visibility rule).
- 14:59 · Q4 gap: shared `dayTotals(entries)` returns only `Totals` (nutrition.ts:113); no builder for the full `DayTotals`
  (targets, budget, kcalLeft, proteinLeftG, burned from the row). Requested from the Lead → N-F0: `buildDayTotals({ date, entries,
  health: Option<DailyHealth>, nutrition: Option<NutritionProfile> }): DayTotals` (pure; shared by N-S2 and N-M1).
  RESOLVED 15:01: N-F0 exports `buildDayTotals(input: DayTotalsInput)` (nutrition.ts:194–211) with exactly that input.
- Capture worker port: charter names only web 9032; N-MC needs a local worker → takes **9035** after a probe (band 903x; 9031
  server, 9033 food, 9034 left free for INT).

## Integration checklist (outside our paths only)
- [ ] `apps/mobile/CLAUDE.md` Layout route inventory · INT-N adds `health/{index,add}.tsx`, `settings/nutrition.tsx` (one line) · `grep -n "health/" apps/mobile/CLAUDE.md`.

## Log
- 2026-10-27 14:09 · skeleton written (architect).
- 2026-10-27 14:53 · HOLD: prepared at 14:53 (`date`; interim to Lead with Q1–Q5) (team-lead opus) — charter/design/Garmin files read, port 9032 free, briefs `$S/nt/{N-M1,N-M2,N-M3}.md`
  (S = team-lead scratchpad `/private/tmp/claude-501/-Users-lukas-Documents-Personal-tanren/2f72436e-0cd5-4397-8737-fd4699a2ee88/scratchpad`).
- 15:07 · GO received (box start; hard stop 16:22). Lead rulings: budget 2 engineers; commas; no demo seed; consume shared; Mon–Sun.
- 15:09→15:16 · N-M1 · engineer/opus · ad0efd02a935d6990 · 182k tok · 52 tools · r0 · DONE: FoodEntryRepo (frozen sig confirmed), NutritionRepo, hooks, AppLayer, fork; 27 tests.
- 15:09→15:21 · N-M2 · engineer/opus · a002b44fc43fe77f5 · 169k tok · 67 tools · r0 · DONE: NutritionStrip, nutritionText (11 tests), today.tsx; gate green 1147; hidden-state ui-check 9032.
- 15:23→15:33 · N-M3 · engineer/opus · a5c4adb11d3e0efea · 174k tok · 62 tools · r0 · DONE: /health 4 states, DayBars/Hero/WeekReview/InsightList, dayBarMath (12 tests); Off ui-check 390/1280; gate green 1175.
- 15:23→15:25 · REV-1 · reviewer/opus · a57ed8e9b11e3699d · 88k tok · 13 tools · APPROVE, 6 should (R1 capture, R2 useStoreRead, R3 strip rule dup, R4 COUNT decode, R5 tombstone tests, R6 cast) + 4 nits.
- 15:35 · W3: N-M1 r1 resume (actions hook first; R2 w/ 1-line useHistory grant, R4, R5, R7–R9) ∥ N-M3 resume (A: FoodLog wiring + cast removal granted; B: capture N1–N3 on 9035/9032) ∥ REV-2.
- 15:35→15:37 · REV-2 · reviewer/opus · acc3606376c579f4c · 92k tok · 11 tools · APPROVE; S1 Off-vs-week-failure, S2 week card 2x2 (decision), nits today label, DAYS dup → N-M3 addendum 15:37.
- 15:37 · N-M1 interim: useFoodEntryActions in src/hooks/useFoodEntryActions.ts.
- 15:35→15:38 · N-M1 r1 · ad0efd02a935d6990 · 212k tok cum · 27 tools · r1 · DONE: useFoodEntryActions, R2 (useHistory +2/−1 granted), R4, R5 (+5 tests), R7 liveFoodEntries, R8 (repo methods need CurrentTimeZone — ratified), R9; own 17 tests green.
- 15:38 · N-M2 r1 resume (a002b44fc43fe77f5): useHealthLine export in HealthStrip.tsx (Lead grant 15:38, shared with Garmin committed) + today.tsx dedupe.
- 15:38→15:39 · N-M2 r1 · a002b44fc43fe77f5 · 207k tok cum · 13 tools · r1 · DONE: useHealthLine exported from HealthStrip.tsx (shared with Garmin, committed), today.tsx dedupe; ui-check = r0.
- 15:40 · REV-1 delta pass (resume a57ed8e9b11e3699d) on N-M1 r1 + N-M2 r1; N-M3 A+B still running (a5c4adb11d3e0efea).
- 15:41→15:42 · REV-1 delta · a57ed8e9b11e3699d · 107k tok cum · 7 tools · APPROVE (R2–R5, R7–R9 fixed; nits: flip error type, no actions test).
- 15:42→15:43 · N-M1 r2 · ad0efd02a935d6990 · 254k tok cum · 10 tools · DONE: StoreError typed, `flipAndSync` in FoodEntryRepo.ts + 2 tests (19 own green).
- 15:43 · CLAUDE.md (apps/mobile) section "v6 nutrition: Today strip + /health" written by team-lead (Edit).
- 15:35→15:47 · N-M3 resume A+B (= N-MC) · a5c4adb11d3e0efea · 252k tok cum · 91 tools · DONE: FoodLog wired, Off on week Failed, "Today," label, WEEK_DAYS, cast removed (granted), hero 2x2 on phone; 12 shots N1–N3 + rows; gallery.mjs missing 0/dup 0; seed gap (seed.ts:94 skips food, no daily_health) → Lead escalation 15:48.
- 15:48→15:49 · N-MR · reviewer/opus · a4b1ac5af10ef22c6 · 102k tok · 11 tools · APPROVE; should: useFoodEntryActions runPromise → runPromiseExit.
- 15:48→15:51 · N-MD · architect/fable · a109a2600fe63fe78 · 92k tok · 21 tools · N1 PASS 4 · N3 PASS 4 · N2 FIX 3 (F1 burned textMuted, F2 track, F3 legend, F4 barWidth 28 desktop, F5 shared copy → Lead).
- 15:51 · FIX wave: N-M3 r2 (F1–F4 + re-shoot N2, hard box 13) ∥ N-M1 r3 (runPromiseExit, 4).
- 15:52 · N-M1 r3 · ad0efd02a935d6990 · 5 tools · DONE: runPromiseExit in useFoodEntryActions; 7 FoodEntryRepo tests green.
- 15:51→15:55 · N-M3 r2 · a5c4adb11d3e0efea · 306k tok cum · 19 tools · DONE: F1–F4 + legend aria-hidden; N2 re-shot ×4; tsc 0; health tests 40 green.
- 15:56→15:57 · N-MD r2 · a109a2600fe63fe78 · 105k tok cum · 8 tools · N2 PASS 4×4 (F1–F4 done); r1 N1/N3 PASS stand.
- 15:56 · team-lead root `pnpm check`: plugins ✓, biome ✓ (651 files), shared/db/mobile typecheck ✓; red only apps/worker `src/mcp/server.ts(107,7)` TS2740 ANNOTATIONS missing program tools (programs/nutri-server streams). Mobile vitest `Test Files 99 passed (99) · Tests 1186 passed (1186)`.
- 15:56 · N-MR delta 2 (resume a4b1ac5af10ef22c6) on DayBars F1–F4 + runPromiseExit.
- 15:58 · N-MR delta 2 · a4b1ac5af10ef22c6 · 110k tok cum · 5 tools · APPROVE (nits: skeleton 164, CLAUDE.md DayBars height → both fixed).
- 15:58 · N-M1 r4 · F5 copy in packages/shared/src/nutrition.ts + test (Lead grant; shared with N-F0 done); shared 38 tests green.
- 15:58→15:59 · N-M3 r3 · DAY_BARS_HEIGHT skeleton; `<TodayPrograms />` in today.tsx Empty + Ready (Lead relay; shared with programs, imports untracked TodayPrograms.tsx).
- 16:00 · team-lead gates: `pnpm -F @tanren/mobile check` biome ✓ 366 files, tsc red only `src/components/programs/programEdit.test.ts(189,68)` (programs); mobile vitest `Test Files 101 passed (101) · Tests 1212 passed (1212)`; shared vitest `29 / 514 passed`. CLAUDE.md section + Status written. Team report 16:01 (box 54 of 75 min).
