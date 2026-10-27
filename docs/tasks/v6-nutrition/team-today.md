# Team charter: Nutrition Today + Health (v6, ADR-0025)
Status: skeleton 2026-10-27 14:09 (architect) · team-lead prep 14:46–15:0x on HOLD · Lead sheet: `docs/tasks/v6-nutrition.md` (team "nutri-today": mission, owned paths, frozen contracts, Assumes — normative) · Design: `docs/design/nutrition.md` §1, §3–§6

Mission: data layer on device (food entries, day/week aggregates), `NutritionStrip` on Today, `/health` root-stack route with
hero, `DayBars`, protein days, insights, week review, Garmin activities list, desktop columns (§6).
Owned (exclusive; charter + Lead rulings of the HOLD message):
`apps/mobile/src/services/{FoodEntryRepo,FoodEntryRepo.test,NutritionRepo,NutritionRepo.test}.ts`,
`apps/mobile/src/services/runtime.ts` (layer lines; the charter's `src/runtime.ts` does not exist — `ls` 14:50),
`apps/mobile/src/hooks/{useNutritionDay,useNutritionWeek}.ts`, `apps/mobile/src/components/today/NutritionStrip.tsx`,
`apps/mobile/src/components/health/{DayBars,HealthHero,WeekReviewCard,InsightList}.tsx` + pure helpers
`{dayBars,dayBars.test,nutritionText,nutritionText.test}.ts` (Decision D1), `apps/mobile/app/health/index.tsx` (Lead ruling:
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
| N-M1 | Data layer: `FoodEntryRepo`, `NutritionRepo.day/week`, hooks, runtime layers, `fork` glyph | engineer/opus | N-F0 | W1 | 20 | queued (HOLD) |
| N-M2 | `NutritionStrip` + `nutritionText` + Today wiring; ui-check 390 | engineer/opus | N-F0 (N-M1 signatures frozen below) | W1 | 20 | queued (HOLD) |
| N-M3 | `/health` Loading/Off/Ready, sections §6, `DayBars`, columns ≥ 900; ui-check 390 + 1280 | engineer/opus | N-F0 (signatures frozen below) | W1 (budget 3 asked) or W2 | 20 | queued (HOLD) |
| REV-1 | Rolling review of N-M1 (+ N-M2 if landed) | reviewer/opus | N-M1 | W2 | 6 | queued |
| N-MC | Capture N1–N3 (390/1280 × light/dark) = resume of the last UI engineer, own port 9032 | engineer (resume) | N-M2, N-M3 | W2/W3 | 10 | queued |
| N-MR | Delta review (N-M2, N-M3, fixes) = final review | reviewer/opus | N-M2, N-M3 | W3 | 10 | queued |
| N-MD | Designer verdict on N-MC shots (architect-as-designer) | architect/fable | N-MC | W3 | 10 | queued |
| FIX | review + designer fix rounds (resumes of the owners) | — | REV-1, N-MR, N-MD | W3/W4 | 10 | queued |
Overlap is promised only inside a wave (one message per wave, `run_in_background: true` boolean, ack checked).
Time box 75 from GO: W1 20 → REV-1 ∥ N-MC 10 → N-MR ∥ N-MD 10 → FIX 10 → root gate + CLAUDE.md 5 (≈ 55 + slack).

## Frozen contracts
From the Lead sheet: shared `FoodEntry`, `dayTotals`, `nutritionTargets`, `insights`, `DayTotals` field names (§3) — exact symbol
names pasted from N-F0's report at GO (below). Team-internal, frozen at prep 14:58 (N-M2/N-M3 build against them in parallel):
- `FoodEntryRepo` (mobile, `src/services/FoodEntryRepo.ts`; also nutri-food's contract):
  `list(range: { readonly from: DateTime.Utc; readonly to: DateTime.Utc }) → Effect<ReadonlyArray<FoodEntry>, StoreError>`
  (live rows, `loggedAt` in [from, to), `loggedAt` asc); `insert(input: <FoodEntryInsert minus totals>) → Effect<FoodEntry, StoreError>`
  (repo fills id, `userId` = `ownerId(CurrentUser)`, timestamps, totals = `totalsOf(items)`; dirty write);
  `softDelete(id: FoodEntryId) → Effect<boolean /*was live*/, StoreError>`; `restore(id: FoodEntryId) → Effect<boolean, StoreError>`.
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
- D1 · Component "tests" are pure-helper tests: `DayBars.test` → `components/health/{dayBars,dayBars.test}.ts` (column model:
  heights, labels, a11y text); the strip's "snapshot test of three lines" → `nutritionText.test.ts` (vitest is node, `*.test.ts` only).
- D2 · `NutritionRepo` reads `daily_health`, `imported_activity`, `workout_session`, `food_entry` with its own range SELECTs;
  Garmin's single-row repos are consumed as-is, not extended.
- D3 · `/health` 7-day bars = the Mon–Sun week containing today (same window as `get_week_review` and the week card); future days
  render as empty columns with their letter.

## Escalations
(none yet; prep questions Q1–Q5 in the HOLD interim)

## Integration checklist (outside our paths only)
- [ ] `app/health/index.tsx` · INT-N wires nutri-food's `FoodLog({ entries, onDelete, onRestore })` under the week card (main column at desktop) · ui-check `/health` shows the log rows.
- [ ] `apps/mobile/CLAUDE.md` Layout route inventory · INT-N adds `health/{index,add}.tsx`, `settings/nutrition.tsx` (one line) · `grep -n "health/" apps/mobile/CLAUDE.md`.

## Log
- 2026-10-27 14:09 · skeleton written (architect).
- 2026-10-27 14:53 · HOLD: prepared at 14:53 (`date`; interim to Lead with Q1–Q5) (team-lead opus) — charter/design/Garmin files read, port 9032 free, briefs `$S/nt/{N-M1,N-M2,N-M3}.md`
  (S = team-lead scratchpad `/private/tmp/claude-501/-Users-lukas-Documents-Personal-tanren/2f72436e-0cd5-4397-8737-fd4699a2ee88/scratchpad`).
