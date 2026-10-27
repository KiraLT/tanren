# v6 — Nutrition (ADR-0025, plan Amendment 20) · company mode

Design: `docs/design/nutrition.md` (normative; § refs below). Research: `docs/research/2026-10-27-nutrition-tracking.md`.
Hand-off point: **the Garmin team's commit** that lands GM-2 (shared sync members, `SyncStore`, migration 0007) and
GM-5 (mobile `migrations.ts` v4, `LocalStore`, `DailyHealthRepo`, `useDailyHealth`); N-F0 starts after it. GM-6's
`HealthStrip.tsx` + `TodayReady banner` must be in HEAD before N-M2 wires the strip (probe below if it is not).
v6 consumes from Garmin: `DailyHealth` (`totalCalories`, `activeCalories`, `steps`, `updatedAt`), mobile
`useDailyHealth(localDate)` + `DailyHealthRepo`, db `GarminImportRepo` (adds `listDays`, N-S1), `ImportedCard`.
Disjoint from LEGAL-2b (`api/{AccountApi,AccountHandlers}.ts`, `settings/{DataSection.tsx,dataCopy.ts}`,
`services/AccountErasure.ts`, `components/legal/**`) — the privacy sentence is INT-N's last step, after LEGAL-2b lands.
Models: opus for schemas/sync/MCP/screens, sonnet for data, copy, docs, QA. Boxes ≤ 20 min. Gate: `pnpm check`.

## Order
```
N-F0 (foundation, serial, 20) ─► team nutri-server  (N-S1 → N-S2 ∥ N-S3 → N-SR → N-SQ)   paths: packages/db, apps/worker
                              ─► team nutri-today   (N-M1 ∥ N-M2 → N-M3 → N-MR/N-MD)      paths: mobile store/services/hooks, Today strip, /health
                              ─► team nutri-food    (N-Q1 ∥ N-Q2 → N-QR/N-QD)              paths: /health/add, food log component, settings nutrition
                              ─► INT-N (wire, route inventory, privacy sentence, gate, N1–N6 shots) ─► INT-R ∥ N-QA
```

## N-F0 — Foundation (engineer, opus, 20 min) · starts at the hand-off commit
Files: `packages/shared/src/{nutrition.ts,nutrition.test.ts,nutrition/quickAdd.ts,nutrition/quickAdd.test.ts,ids.ts,common.ts,
user.ts,user.test.ts,row.ts,row.test.ts,sync.ts,sync.test.ts,mcp.ts,mcp.test.ts,index.ts}`, `packages/db/src/schema/parity.test.ts`
(table set only), `packages/db/src/sync/SyncStore.ts` (+ `SyncStore.nutrition.test.ts`), `apps/worker/src/sync/SyncStore.ts` (wrap),
`apps/mobile/src/store/{migrations,migrations.test}.ts` (v5), `apps/mobile/src/services/{LocalStore,DataExport,DataExport.test}.ts`.
Does: design §1 schemas + `totalsOf`, `dayTotals`, `nutritionTargets` (§4, the five pins as tests), `insights` (§5, one
test per rule + "≤ 3, group order"), `QUICK_ADD` (§7: verify each row against USDA FDC, FDC id in a comment, drop what
cannot be verified; tests: unique ids, `totalsOf` equality, `search("shake")` = 3); §2 sync members in every
exhaustive consumer; `SyncStore` invariant (totals = `totalsOf(items)` → `invariantViolated`); mobile v5 migration;
`mcp.ts` contracts §3 + `MCP_TOOLS` + 4 names (server `ANNOTATIONS` becomes a compile error until N-S2 — add the
four entries in `writeToolAnnotations`/`ANNOTATIONS` as the last step so the gate is green; `server.ts` is then yours
for those lines only).
Assertions that change: `sync.test.ts` `SYNC_TABLE_ORDER` list (+ `"foodEntry"` last); `row.test.ts` `ROW_TABLE` keys;
`parity.test.ts` table set (+ `food_entry`, profile + `nutrition`); `migrations.test.ts` version count (4 → 5) and the
`food_entry` column list; `user.test.ts` any `toEqual` on a full `Profile` encoded shape (+ `nutrition: null`).
Done: gate green; report lists each pinned target value's test, the FDC ids, and the exact symbol names exported.

## Team nutri-server (team-lead; charter `docs/tasks/v6-nutrition/team-server.md`)
Mission: migration 0008, `FoodEntryRepo`, `GarminImportRepo.listDays`, the four MCP tools with the §3 descriptions
verbatim, `update_profile` description extension, memory ports, workerd test through `McpRoute`.
Owned: `packages/db/src/schema/{nutrition.ts,index.ts,user.ts}`, `packages/db/migrations/0008_*` + `meta/`,
`packages/db/src/repositories/{FoodEntry,FoodEntry.test,GarminImport,index}.ts`, `apps/worker/src/mcp/{nutritionTools,
nutritionTools.test,nutritionTools.workerd.test,writeTools,server}.ts`, `apps/worker/src/repos/**` (memory ports),
`apps/worker/src/testing/workerdSetup.ts` ("0000 to 0008"), `apps/worker/CLAUDE.md` (tool list line, marker `shared with Lead`).
Frozen contracts: design §1–§3 as landed by N-F0 (names from its report), `RejectReason "invariantViolated"`, `ToolDeps`.
Assumes: `ProfileRepo` has `get`/`put` only (`packages/db/src/repositories/Profile.ts`) → `update_profile` merge path
unchanged; `DailyHealth` fields per `garmin.md` §1; `server.ts:77` exhaustive annotations.
- **N-S1** (opus, 15): schema `food_entry` + `profile.nutrition` column, `drizzle-kit generate` → 0008, `FoodEntryRepo`
  (§2 signatures, writes through `SyncStore.apply`), `GarminImportRepo.listDays(userId, from, to)`, memory ports.
  Done: repo tests (listRange half-open, softDelete returns false twice, foreign user `Forbidden`), workerdSetup line.
- **N-S2** (opus, 20): `nutritionTools.ts` — `logFood`, `getNutritionDay`, `getWeekReview`, `deleteFoodEntry` with the
  §3 descriptions verbatim; `budgetKcal`/`kcalLeft`/`burnedAsOf` per §3 comments; week = Mon–Sun in `profile.timezone`
  (`VERIFY:` how `get_overview` derives "today"; name the helper); `workoutsDone` = sessions `finishedAt` Some in the
  week, `workoutsPlanned` = planned sessions of the active plan's week; `insights` from shared. Done: unit tests per
  tool incl. "no Garmin row → burned null, kcalLeft still Some", "eatBackActive adds active, floored at 0",
  "delete twice → deleted false"; `update_profile` description extended; `nutrition` key round-trips.
- **N-S3** (sonnet, 10): `nutritionTools.workerd.test.ts` through `McpRoute` (`tools/list` has 13 names; `log_food` →
  `day.kcalLeft`; read scope cannot call `log_food`), `apps/worker/CLAUDE.md` tool line.
- N-SR review (opus, 10) → fix (10) → N-SQ: `wrangler dev` + Inspector `log_food` → `get_nutrition_day` → `delete_food_entry`.
Box 70. Ports worker **9031** (`ps -ef | grep "port 903"` first).

## Team nutri-today (team-lead; charter `docs/tasks/v6-nutrition/team-today.md`)
Mission: data layer on device (food entries, day/week aggregates), `NutritionStrip` on Today, `/health` route with hero,
`DayBars`, protein days, insights, week review, Garmin activities list, desktop columns (§6).
Owned: `apps/mobile/src/services/{FoodEntryRepo,FoodEntryRepo.test,NutritionRepo,NutritionRepo.test}.ts`, `apps/mobile/src/hooks/
{useNutritionDay,useNutritionWeek}.ts`, `apps/mobile/src/runtime.ts` (layer lines), `apps/mobile/src/components/today/NutritionStrip.tsx`,
`apps/mobile/src/components/health/{DayBars,DayBars.test,HealthHero,WeekReviewCard,InsightList}.tsx`, `apps/mobile/app/health.tsx`,
`apps/mobile/app/(tabs)/today.tsx` (strip lines), `apps/mobile/src/ui/iconPaths.ts` (+ `fork` glyph only).
Read-only: `HealthStrip.tsx`, `TodayReady.tsx` (GM-6), `ImportedCard.tsx` (consumed), `useDailyHealth` (consumed).
Frozen: shared `FoodEntry`, `dayTotals`, `nutritionTargets`, `insights`, `DayTotals` field names (§3); `FoodEntryRepo`
(mobile) `list(range)`, `insert(entry)`, `softDelete(id)`, `restore(id)` for team nutri-food's log component.
Assumes: `useDailyHealth(localDate) → Option<DailyHealth>` (`garmin.md` §7, GM-5); `TodayReady banner?: ReactNode`
(GM-6) — if not in HEAD at N-M2 start, render the strip in `(tabs)/today.tsx` above `TodayReady` and log it.
- **N-M1** (opus, 15): `FoodEntryRepo` (dirty writes, `_dirty=1`, LWW fields), `NutritionRepo.day(localDate)` →
  `DayTotals` (joins `daily_health` via `DailyHealthRepo`, profile `nutrition` via `ProfileRepo.get`), `.week(weekStart)` →
  `WeekReview` minus MCP-only fields; hooks subscribe to `StoreEvents`. `fork` glyph. Done: repo tests on the
  in-memory driver (`SqlDriver.testing`): totals, eat-back floor, no-Garmin day, week with 2 logged days.
- **N-M2** (opus, 20): `NutritionStrip` (§6 arithmetic, 72/54 high, press → `/health`), wired under `HealthStrip` in
  Empty + Ready; hidden when `nutrition` None and no entries. Done: ui-check at 390 with a seeded entry
  (`store/seed.ts` is NOT yours — seed through `FoodEntryRepo.insert` in a `__DEV__` probe or the test harness) shows
  "… kcal left"; snapshot test of the three text lines incl. the burned-None variant.
- **N-M3** (opus, 20): `/health` Loading/Off/Ready, sections per §6 table, `ColumnsView` at ≥ 900, `IconButton`s to
  `/health/add` and `/settings/nutrition` (routes may 404 until nutri-food lands — fine, the links are the contract).
  Done: ui-check 390 + 1280, Off state shows `EmptyState` inside the same frame; `DayBars` a11y label per column.
- N-MR review (opus, 10) ∥ N-MD designer pass (fable, 10, screenshots N1–N3) → fix (10). Box 75. Web port **9032**.

## Team nutri-food (team-lead; charter `docs/tasks/v6-nutrition/team-food.md`)
Mission: quick-add sheet, food log list with delete + Undo, Settings → Nutrition & goals (§6 last three blocks).
Owned: `apps/mobile/app/health/add.tsx`, `apps/mobile/app/settings/nutrition.tsx`, `apps/mobile/app/settings.tsx` (one row),
`apps/mobile/src/components/health/{FoodLog,FoodLog.test,QuickAddSheet,QuickAddSheet.test}.tsx`,
`apps/mobile/src/components/settings/{NutritionSection,nutritionCopy,nutritionCopy.test}.ts(x)`, `apps/mobile/app/_layout.tsx`
(modal `presentation` line for `health/add` only).
Frozen: `QUICK_ADD` + `search` (§7), `FoodEntryRepo` mobile signatures (nutri-today N-M1 — consume via the shared
interface; until it lands, develop against a `FoodEntryRepo` test layer and integrate at INT-N), `ProfileRepo.save(ProfilePatch)`,
`NutritionProfile` (§1), `nutritionTargets` (§4). `FoodLog` is rendered by `/health` (nutri-today) — export
`FoodLog({ entries, onDelete, onRestore })` as a pure component; nutri-today imports it at INT-N.
- **N-Q1** (opus, 20): `QuickAddSheet` + `/health/add` modal (search, list, inline editor, `Button "Add 360 kcal"` label
  computed from multiplier), `FoodLog` with delete + 15 s Undo `Banner`. Done: tests — search filters, multiplier scales
  all four totals, Undo restores; ui-check 390.
- **N-Q2** (opus, 20): `NutritionSection` row + `/settings/nutrition` (§6: goal, weight, optional facts, activity,
  derived targets tile, override, eat-back `Switch` when Garmin connected, Turn off). Done: `nutritionCopy.test` pins the
  goal labels and the subtitle "2 800 kcal · 170 g" format; saving writes `profile.nutrition`; ui-check 390 + 1280.
- N-QR ∥ N-QD (fable, screenshots N4–N6) → fix. Box 60. Web port **9033**.

## INT-N — Integration (engineer, opus, 20) → INT-R (reviewer, 10) ∥ N-QA (qa, sonnet, 20: design §8 recipe)
Wire `FoodLog` into `/health`; `apps/mobile/CLAUDE.md` Layout: `health.tsx`, `health/add.tsx`, `settings/nutrition.tsx`
+ services/hooks lines; `docs/design/legal.md` §1 + `legalCopy.ts` one sentence ("If you log food, Tanren stores the
items, calories and macros you or Claude entered; they sync to our server like your workouts and are deleted with your
account.") — only after LEGAL-2b's commit; full gate; gallery N1–N6 (390/1280 × light/dark) republished in place;
`docs/handoff.md` state. Done: §8 local recipe passes end to end; report names the three VERIFY answers (Garmin daily
growth seen in production rows, `jsonColumn` nullable, `ColumnSplit` names).

## Deferred (charter lines)
Sleep/body battery (no `daily_health` column; needs GarminPull change — Garmin follow-up). Apple Health burn. Barcode
search (Open Food Facts, live). 14-day Garmin mean as TDEE (research). Per-food analytics. MCP photo upload (Claude
sees the photo; the tool takes items).

## Log
- 2026-10-27 14:08 · architect: ADR-0025 + design + this sheet written; Lead ruling 14:02 applied (eat-back toggle,
  goal factors, protein g/kg, USDA verification, photo wording).
