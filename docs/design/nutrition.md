# Nutrition — design (ADR-0025; plan Amendment 20)

Normative for `docs/tasks/v6-nutrition.md`. Pattern sources: `docs/design/garmin.md` (synced table added after
the fact), `docs/design/feed.md` §5 (desktop columns), `docs/design/mcp.md` (tool shape). All names below are
checked against `packages/shared/src/*.ts` at 13:57 unless marked `VERIFY:`. Research note
`docs/research/2026-10-27-nutrition-tracking.md` did not exist at design time; every constant it may change is
marked `VERIFY:` with the research question.

## 1. Shared schemas (`packages/shared/src/nutrition.ts` new; `user.ts`, `ids.ts`, `common.ts`, `mcp.ts` additive)
`ids.ts`: `export const FoodEntryId = Uuid.pipe(Schema.brand("FoodEntryId"))`.
`common.ts`: `EntityName` + `"foodEntry"` (before `"location"`); `SyncTable.pick([...])` + `"foodEntry"`.
`nutrition.ts`:
```ts
export const Meal = Schema.Literals(["breakfast", "lunch", "dinner", "snack", "supplement"])
export const FoodSource = Schema.Literals(["mcp", "manual", "quick_add"])
const Kcal = Schema.Number.check(Schema.isInt(), Schema.isBetween(0, 10_000))
const Grams = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(5_000))
export const FoodItem = Schema.Struct({
  name: Label,                                        // "Grilled chicken breast"
  portion: Label,                                     // "1 breast, ~180 g" — free text, Claude's words
  grams: Schema.OptionFromNullOr(Grams),
  kcal: Kcal,
  proteinG: Grams, carbsG: Grams, fatG: Grams,
  fibreG: Schema.OptionFromNullOr(Grams),
  confidence: Schema.OptionFromNullOr(Schema.Number.check(Schema.isBetween(0, 1))),
})
export const FoodItems = Schema.Array(FoodItem).check(Schema.isMinLength(1), Schema.isMaxLength(20))
export const Totals = Schema.Struct({ kcal: Kcal, proteinG: Grams, carbsG: Grams, fatG: Grams })
/** Sum of the items, rounded: kcal to int, grams to 0.1. Pure; the row's totals MUST equal it (SyncStore check). */
export const totalsOf = (items: ReadonlyArray<FoodItem>): Totals
export class FoodEntry extends Schema.Class<FoodEntry>("@tanren/shared/FoodEntry")({
  ...rowFields(FoodEntryId),
  loggedAt: Timestamp,                                // when eaten (Claude passes it; default = now)
  meal: Meal,
  source: FoodSource,
  items: FoodItems,
  ...Totals.fields,                                   // denormalised: kcal, proteinG, carbsG, fatG
  note: Schema.OptionFromNullOr(Note),
}) {}
export const FoodEntryInsert = FoodEntry.mapFields(Struct.omit(ROW_COLUMNS))   // pattern: program.ts
export const FoodEntryPatch = …                                                 // pattern: program.ts
```
`user.ts` (profile):
```ts
export const NutritionGoal = Schema.Literals(["gain_muscle", "lose_weight", "maintain"])
export const ActivityLevel = Schema.Literals(["sedentary", "light", "moderate", "active", "extra"])
export const Sex = Schema.Literals(["male", "female"])
export const NutritionProfile = Schema.Struct({
  goal: NutritionGoal,
  bodyWeightKg: Schema.Number.check(Schema.isBetween(30, 300)),
  heightCm: Schema.OptionFromNullOr(Schema.Number.check(Schema.isBetween(120, 230))),
  birthYear: Schema.OptionFromNullOr(Schema.Int.check(Schema.isBetween(1920, 2020))),
  sex: Schema.OptionFromNullOr(Sex),
  activityLevel: ActivityLevel,
  /** ADR-0025 §1: add Garmin `activeCalories` to the day's budget (floored at 0). Default false. */
  eatBackActive: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false)),
    Schema.withConstructorDefault(Effect.succeed(false))),
  /** Manual overrides; None = derived by `nutritionTargets` (§4). */
  kcalTarget: Schema.OptionFromNullOr(Schema.Int.check(Schema.isBetween(800, 8000))),
  proteinTargetG: Schema.OptionFromNullOr(Schema.Int.check(Schema.isBetween(20, 500))),
})
ProfileFields.nutrition = Schema.OptionFromOptionalNullOr(NutritionProfile, { onNoneEncoding: null })
  .pipe(Schema.withConstructorDefault(Effect.succeed(Option.none())))   // same shape as activeLocationId
ProfilePatch.nutrition = Schema.optionalKey(Schema.OptionFromNullOr(NutritionProfile))   // null clears
```
`row.ts`: `ProfileRow` + `nutrition: Schema.NullOr(jsonColumn(NutritionProfile))` — `jsonColumn` is
`Schema.fromJsonString(Schema.toEncoded(field))` (`row.ts:22`), so the null wraps it; encode default `null` like
`activeLocationId` (`nutrition: profile.nutrition ?? null` in the `encode` transform). `FoodEntryRow = Schema.Struct({ ...wireRecord(FoodEntry.fields)
.fields, items: jsonColumn(FoodItems) }).pipe(Schema.decodeTo(FoodEntry))`; `ROW_TABLE.foodEntry = "food_entry"`,
`ROW_KEYS.foodEntry`. `sync.ts`: `SYNC_TABLE_ORDER` + `"foodEntry"` (last), `SyncChange` + `member("foodEntry",
FoodEntry)`. Tests pinned on the table list that change: `sync.test.ts` (`SYNC_TABLE_ORDER` length/`toEqual`
list → + `"foodEntry"`), `row.test.ts` (`ROW_TABLE` keys), `packages/db/src/schema/parity.test.ts` (table set).
Pure helpers in `nutrition.ts`: `nutritionTargets` (§4), `insights` (§5), `QUICK_ADD` (§7), `dayTotals(entries)`.

## 2. DB + sync (`packages/db/src/schema/nutrition.ts`; migration `0008_nutrition.sql`, after 0007)
`food_entry`: `...rowColumns()`, `logged_at TEXT NOT NULL`, `meal TEXT NOT NULL`, `source TEXT NOT NULL`,
`items TEXT NOT NULL` (JSON), `kcal INTEGER NOT NULL`, `protein_g REAL NOT NULL`, `carbs_g REAL NOT NULL`,
`fat_g REAL NOT NULL`, `note TEXT`; indexes `userSeqIndex`, `food_entry_user_logged_idx (user_id, logged_at)`.
`profile`: `ALTER TABLE profile ADD COLUMN nutrition TEXT` (nullable; existing rows = None).
Exhaustive consumers (one owner each, see tasks): `packages/db/src/sync/SyncStore.ts` (`RowByTable`, encode map,
no parent, invariant: `totalsOf(items)` equals the row totals → `RejectReason "invariantViolated"`, pattern
`programEnrollment`), `apps/worker/src/sync/SyncStore.ts` wrap, `apps/worker/src/testing/workerdSetup.ts`
("0000 to 0008"), mobile `migrations.ts` v5 (`table("food_entry", …)` all scalar + `items` TEXT; index
`food_entry_logged ("loggedAt")`; `dirtyIndex`; `ALTER TABLE profile ADD COLUMN nutrition TEXT`), `LocalStore.ts`
member, `DataExport.ts` (+ table). The app writes `food_entry` (quick-add) → it syncs both ways, unlike Garmin's.
Repo `packages/db/src/repositories/FoodEntry.ts` (`FoodEntryRepo`):
```ts
listRange: (userId, range: { from: Timestamp; to: Timestamp }) => Effect<ReadonlyArray<FoodEntry>, PersistenceError>  // live rows, loggedAt in [from, to)
put:       (userId, rows: ReadonlyArray<FoodEntry>) => Effect<void, PersistenceError | Forbidden>                      // via SyncStore.apply (server_seq from sync_clock, db.md §3)
softDelete:(userId, id: FoodEntryId) => Effect<boolean /*existed*/, PersistenceError>                                 // via SyncStore.apply
```
`DailyHealthRepo` (packages/db — `VERIFY:` GM-2's repo name; `GarminImportRepo` per garmin.md §2) needs a read
`listDays(userId, from: LocalDate, to: LocalDate)`: add it in `packages/db/src/repositories/GarminImport.ts`
AFTER GM-2 commits (task N-S1), never in parallel with the Garmin team.

## 3. MCP tools (`apps/worker/src/mcp/nutritionTools.ts` new; `mcp.ts` contracts; `MCP_TOOLS` + 4 names)
Day boundaries use `profile.timezone` (as `get_overview` does `VERIFY:` — if it uses UTC today, nutrition uses the
profile zone and says so). `LocalDate` = `common.ts` `LocalDate`.
```ts
export const LogFoodInput = Schema.Struct({
  loggedAt: Schema.optionalKey(Timestamp), meal: Meal, items: FoodItems, note: Schema.optionalKey(Note) })
export const DayTotals = Schema.Struct({ date: LocalDate, eaten: Totals, burned: Schema.OptionFromNullOr(Kcal),
  activeBurned: Schema.OptionFromNullOr(Kcal), steps: Schema.OptionFromNullOr(Count),
  burnedAsOf: Schema.OptionFromNullOr(Timestamp),         // daily_health.updatedAt — "as of HH:MM" (ADR-0025 §1)
  targets: Schema.OptionFromNullOr(Schema.Struct({ kcal: Kcal, proteinG: Grams, goal: NutritionGoal })),
  /** budget = targets.kcal + (eatBackActive ? max(activeBurned, 0) : 0); kcalLeft = budget − eaten.kcal */
  budgetKcal: Schema.OptionFromNullOr(Kcal),
  kcalLeft: Schema.OptionFromNullOr(Schema.Int), proteinLeftG: Schema.OptionFromNullOr(Schema.Number),
  entries: Schema.Array(FoodEntry) })
export const LogFoodResult = Schema.Struct({ entry: FoodEntry, day: DayTotals })
export const GetNutritionDayInput = Schema.Struct({ date: Schema.optionalKey(LocalDate) })      // default today
export const GetNutritionDayResult = DayTotals
export const DeleteFoodEntryInput = Schema.Struct({ id: FoodEntryId })
export const DeleteFoodEntryResult = Schema.Struct({ deleted: Schema.Boolean })
export const GetWeekReviewInput = Schema.Struct({ weekStart: Schema.optionalKey(LocalDate) })  // any weekday; default = this week's Monday (profile zone)
export const WeekReview = Schema.Struct({
  weekStart: LocalDate, days: Schema.Array(DayTotals).check(Schema.isLength(7)),
  eatenKcal: Kcal, burnedKcal: Schema.OptionFromNullOr(Kcal), daysWithBurn: Count,
  netKcal: Schema.OptionFromNullOr(Schema.Int),          // Σ(eaten − burned) over daysWithBurn
  proteinAvgG: Grams, daysOnKcalTarget: Count, daysOnProteinTarget: Count, daysLogged: Count,
  workoutsDone: Count, workoutsPlanned: Count,             // sessions with finishedAt in week / planned sessions of the plan week
  insights: Schema.Array(Schema.Struct({ rule: InsightRule, text: Label })) })
```
`Count`: no such export in `packages/shared` (grep 14:06, garmin.md §1 named it loosely) → N-F0 defines
`export const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))` in `nutrition.ts` unless GM-1 landed one
under another name (`grep -n "isGreaterThanOrEqualTo(0)" packages/shared/src/garmin.ts`) — reuse, never duplicate.
Annotations (`server.ts` `ANNOTATIONS`, `writeToolAnnotations`): `log_food` `{ readOnlyHint: false, idempotentHint:
false, destructiveHint: false }`, `delete_food_entry` `{ false, true, true }`, both read tools `kind: "read"`.
"On target" (also §5): kcal within −15 % … +5 % of `kcal` target for `lose_weight`, −5 % … +15 % for
`gain_muscle`, ±10 % for `maintain`; protein ≥ target. A day with no entries is not "on target" and not "logged".
Descriptions (verbatim, the engineer pastes):
- `log_food`: "Log one meal, snack or supplement as a list of food items with calories and macros. Use this when
  the user describes or photographs food. Estimate from the photo or description. For each item first state
  the portion in household units and grams in `portion` (plate ≈ 26 cm, fist ≈ 1 cup, palm ≈ 100 g cooked
  meat, thumb ≈ 1 tbsp; e.g. '1 bowl, ~300 g'), then derive kcal, proteinG, carbsG, fatG from that portion.
  Add a separate cooking-fat item (oil, butter, sauce) when food looks fried, roasted, dressed or sauced.
  Prefer a slightly high estimate for fat-rich dishes: photo estimates run 250–350 kcal low per meal, mostly
  hidden fat. Set `confidence` 0–1 per item (0.9 packaged/labelled, 0.6 typical home plate, 0.3 unclear).
  Never ask the user for weights or labels — pick the most likely portion; precision is not needed. `meal` from the time
  of day if not stated (05–10 breakfast, 11–14 lunch, 17–21 dinner, else snack; shakes/creatine/vitamins =
  supplement). `loggedAt` defaults to now; pass the time if the user ate earlier. Returns the entry and the
  day's totals vs targets: tell the user kcal and protein left in one line."
- `get_nutrition_day`: "Calories eaten (sum of logged food), burned (Garmin daily total incl. BMR, null when no
  Garmin data yet; today's value is partial until midnight), steps, targets from the profile's nutrition goal,
  and what is left, for one local date (default today in the profile timezone). Lists the entries so you can
  correct or delete one (delete_food_entry)."
- `get_week_review`: "Mon–Sun review for the week containing weekStart (default this week): per-day totals,
  eaten vs burned, net balance over the days Garmin covered, protein average, days on target, workouts done vs
  planned, and rule-based insights. Use it to answer 'how did my week go' and to suggest next week's changes."
- `delete_food_entry`: "Soft-deletes one food entry by id (from log_food or get_nutrition_day). Not undoable."
- `update_profile` description += " nutrition ({ goal: gain_muscle|lose_weight|maintain, bodyWeightKg,
  heightCm?, birthYear?, sex?, activityLevel: sedentary|light|moderate|active|extra, eatBackActive?: boolean
  (default false: add Garmin active calories to the day's budget), kcalTarget?, proteinTargetG? }; null turns
  nutrition tracking off). Targets are derived from the goal and body facts unless kcalTarget / proteinTargetG
  are set. Ask for weight and goal only; the rest is optional."
- `get_nutrition_day` adds after "partial until midnight": "`burnedAsOf` is the time of the last Garmin pull;
  `budgetKcal` already includes the eat-back adjustment when the profile enables it."
`ToolDeps` gains `FoodEntryRepo`, `GarminImportRepo` (read), `SessionRepo`/`PlanRepo` (already there for workouts).

## 4. Targets (`nutritionTargets(profile: NutritionProfile, today: LocalDate): { kcal: number; proteinG: number }`, pure)
Source: `docs/research/2026-10-27-nutrition-tracking.md` §Formulas (Lead ruling 14:02, ADR-0025 Overrides).
BMR: Mifflin-St Jeor when `heightCm`, `birthYear`, `sex` are all Some: `10·w + 6.25·h − 5·age + (male ? 5 : −161)`,
age = year(today) − birthYear; else fallback `22 · w` (research: a 14-day mean of Garmin `totalKilocalories` beats
any formula — v2 option, not v1). TDEE = BMR × `{ sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725,
extra: 1.9 }` (primary source unverified in the note; convention). Goal factor: `lose_weight ×0.80` (Helms 2014),
`maintain ×1.00`, `gain_muscle ×1.10` (Iraki 2019). Floor 1200. kcal rounded to the nearest 10. Protein g/kg:
`lose_weight 2.2`, `gain_muscle 1.8`, `maintain 1.6` (ISSN 2017), rounded to 5. Overrides win:
`kcal = Option.getOrElse(p.kcalTarget, derived)`, same for protein.
Pinned test values (today = 2026-10-27): male 85 kg 180 cm born 1990 moderate gain → BMR 1 800 (850 + 1 125 − 180 + 5) → TDEE 2 790
→ ×1.10 = 3 069 → **3 070** (corrected 2026-10-27 by N-F0; the earlier 1 807.5 / 3 080 was an arithmetic slip); protein 85 × 1.8 = 153 → **155**. Fallback 85 kg no height, light, lose →
1 870 × 1.375 = 2 571.25 × 0.80 = 2 057 → **2 060**; protein 187 → **185**. Maintain 70 kg sedentary, no
height → 1 540 × 1.2 = 1 848 → **1 850**; protein **110** (112 → 110). Floor case: 40 kg sedentary lose → 845.6 →
**1 200**.

## 5. Insights (`insights(week: WeekInput): ReadonlyArray<Insight>`, pure, ≤ 3 returned, first match per group)
`InsightRule = Schema.Literals([...])` of the eight ids. Inputs: today's `DayTotals`, the 7 `DayTotals` ending today,
`workoutsDone/Planned`. Copy is exact; numbers formatted with a thin space thousands separator ("1 420").
| id | when (today unless said) | text |
| --- | --- | --- |
| `protein_short` | targets Some, `proteinLeftG ≥ 30` and local hour ≥ 15 | "Protein {n} g short — a shake covers it" (n = proteinLeftG rounded to 5) |
| `protein_hit` | `proteinLeftG ≤ 0` | "Protein target hit" |
| `kcal_over` | `kcalLeft < −100` | "{n} kcal over target today" (n = −kcalLeft) |
| `kcal_under_lose` | goal lose, hour ≥ 20, `kcalLeft > 300` | "{n} kcal under — on track for the deficit" |
| `kcal_under_gain` | goal gain, hour ≥ 20, `kcalLeft > 300` | "{n} kcal to go — add a meal to hit the surplus" |
| `nothing_logged` | hour ≥ 12 and `entries` empty | "Nothing logged yet — send Claude a photo of your next meal" |
| `week_streak` | `daysOnKcalTarget ≥ 5` in the 7 days | "{n} of 7 days on target this week" |
| `week_protein_low` | 7-day `proteinAvgG < 0.8 × proteinTarget` and `daysLogged ≥ 3` | "Protein averaged {n} g, target {t}: plan a protein source per meal" |
Groups: protein (`protein_short`, `protein_hit`), kcal (3 rules), logging, week (2). Order shown: kcal, protein,
logging, week. No targets (`nutrition` None) → only `nothing_logged`. Strip shows the first insight; Health shows ≤ 3.

## 6. Screens (Forge; 390: content 358, Card inner 326; 1280: `Page frame="wide"` 1216, feed.md §5)
Route inventory additions (`apps/mobile/CLAUDE.md` Layout, integration task): `health.tsx` (`/health`),
`health/add.tsx` (quick-add, `presentation: "modal"`), `settings/nutrition.tsx`. States per route: `/health`
`Loading | Off | Ready` (Off = `nutrition` None → `EmptyState icon="target" title="Set a nutrition goal"
body="Tanren derives your calorie and protein targets from it" action={{ label: "Set goal", onPress → /settings/nutrition }}`);
`/health/add` `Ready | Saving`; `/settings/nutrition` `Loading | Ready`. All three keep `wide` at desktop; `Off`
and `Loading` render inside the same frame (UI-D rule).
**Today strip** `src/components/today/NutritionStrip.tsx`, rendered directly under `HealthStrip` (Empty and Ready
states; Ready via `TodayReady banner` = `<><HealthStrip/><NutritionStrip/></>` stacked `space.sm`); hidden when
`nutrition` None and no entries today. Pressable → `/health`.
```
┌ surfaceRaised radius.md ───────────────────────────────┐
│ (fork) Nutrition                       620 kcal left   │  label · caption accent, tabular
│        Eaten 1 420 · Burned 1 840 · Protein 96/170 g   │  caption muted
│        Protein 75 g short — a shake covers it          │  caption (first insight; omitted when none)
└────────────────────────────────────────────────────────┘
```
| row | slots | width at 358 | height |
| --- | --- | --- | --- |
| 1 | `Icon name="fork" size=16` · `Text variant="label"` · spacer · `Text variant="caption" tone="accent" tabular` | 16 + 8 + 62 + ≥ 8 + ≤ 90 = ≤ 184 ✓ | 18 |
| 2 | `caption muted` (burned part dropped when None → "Eaten 1 420 · Protein 96/170 g") | ≤ 46 chars × 6.5 = 299 ≤ 334 ✓ | 18 |
| 3 | `caption` default | ≤ 334 | 18 (0 when none) |
Height 8 + 18 + 18 + 18 + 8 + 2 border = 72 (54 without an insight). `Icon` glyph `fork` is new in
`iconPaths.ts` (24-grid, stroke 2, like `flame`); accessibilityLabel = the three lines joined by ", ".
**Health** `app/health.tsx`: `Page` + `AppBar title="Health"` with trailing `IconButton icon="plus"` → `/health/add`
and `icon="settings"` → `/settings/nutrition`. Sections (gap `space.xl`):
| section | primitive | width at 390 | height |
| --- | --- | --- | --- |
| hero | `StatRow variant="tile" items=[Eaten "1 420", Burned "1 840"/"—", Left "620", Protein "96 g"]` labels "kcal eaten", "kcal burned", "kcal left", "protein" | (358 − 3·8)/4 = 83.5 ≥ 72 ✓ | `sizes.statTile` 72 |
| 7 days | `DayBars` (new, `src/components/health/DayBars.tsx`): 7 columns, each eaten (accent) + burned (border tone) bar, day letter below; `accessibilityLabel` per column | col (358 − 6·8)/7 = 44.3 → 44; bars 18 + 4 + 18 = 40 ≤ 44 ✓ | 120 + 4 + 16 label = 140 |
| protein days | `ListRow title="Protein target" subtitle="5 of 7 days"` + `SegmentBar total=7 filled=5` below in the row's `children` slot — `VERIFY:` ListRow has no children; else a `Card padding=16` with `headline` + `SegmentBar` | 326 | 22 + 8 + 8 + 32 = 70 |
| insights | ≤ 3 `Banner tone="neutral" title=<text>` (`VERIFY:` `BannerTone` has `neutral`/`info`; else `Card`) | 358 | 56 each |
| week review | `Card`: `title2` "This week" + `StatRow variant="plain" direction="column"` items On target "4 / 7", Avg balance "−310 kcal/day" (or "—" when `daysWithBurn = 0`), Protein hit "5 / 7", Workouts "3 / 4" | 326 | 28 + 12 + 4·28 = 152 + 32 pad |
| activities | Garmin `ImportedCard` list for the week (GM-6 component; consumed, not changed) | 358 | 170 each |
| food log | `ListGroup` of `ListRow title=<items[0].name + (n>1 ? " +n" : "")> subtitle="12:40 · 540 kcal · 38 g protein" trailing=<IconButton icon="trash" tone="danger" accessibilityLabel="Delete">` (`VERIFY:` IconButton `tone`; else `color` prop) | 358 − 44 − 12 = 302 text ✓ | 60 (two-line row) |
Delete = immediate soft delete (`updatedAt = now`, dirty) with a `Banner` "Entry deleted" + `action` Undo (15 s,
restores `deletedAt = null`). Desktop 1280 `ColumnsView main=[hero, DayBars, food log] side=[insights, week review,
activities] split=<feed.md §5's Detail split>` — `VERIFY:` `ColumnSplit` literal names in `ColumnsView.tsx`.
**Quick-add** `app/health/add.tsx`: `TextInput` search (48, `radius.md`, like sign-in's input) → `ListGroup` of
`QUICK_ADD` matches (`ListRow title=name subtitle="{kcal} kcal · {proteinG} g protein · {portion}" chevron`),
tap → inline editor: `Stepper` for the multiplier (0.5 steps, 0.5–5, label "×1.5 = 2 scoops"), `SegmentedControl`
meal (5 values; at 358 = 71.6 each ≥ 44 ✓), `Button variant="primary" size="lg" label="Add 360 kcal"` (56).
Writes `FoodEntry { source: "quick_add", items: [item × multiplier], loggedAt: now }` through the mobile
`FoodEntryRepo` and pops.
**Settings → Nutrition** `app/settings/nutrition.tsx` + `src/components/settings/NutritionSection.tsx`
(`ListRow title="Nutrition & goals" subtitle=<goal label · "2 800 kcal · 170 g"> chevron` inserted after
`EquipmentSection` in `app/settings.tsx`): `SegmentedControl` goal (3), `Stepper` weight (0.5 kg), optional
`Stepper`s height/birth year, `SegmentedControl` sex (2 + "skip"), activity as five radio `ListRow`s with
subtitles (as landed: activity has 5 values, and a 5-option `SegmentedControl` scrolls at 358), derived targets shown as `StatRow tile` 2 items ((358 − 8)/2 = 175 ✓) with "Edit" → override
`Stepper`s (kcal 50 steps, protein 5); a `ListRow title="Eat back active calories" subtitle="Adds Garmin active
calories to the day's budget" trailing=<Switch>` (RN `Switch`, 44 tap; default off; hidden when Garmin is not
connected — `useIntegrationsOverview()` garmin `state !== "connected"`; the row announces as a switch through
`ListRow checked`, the Switch itself is hidden from assistive tech). The strip's and hero's burned value carries
"as of HH:MM" from `burnedAsOf` in the accessibility label and as a `label`-variant suffix on Health only.
Saves via `ProfileRepo.save({ nutrition: Option.some(...) })`
(`apps/mobile/src/services/ProfileRepo.ts` `save(patch: ProfilePatch)`); "Turn off" → `nutrition: None`.
Theme: both; measured screenshots at 390 and 1280, light and dark: Today with both strips, Health Ready, Health
Off, quick-add, settings nutrition (gallery badges **N1–N6**).

**§6 amendment (as landed, 2026-10-27; nutri-food truth-up, nutri-today D7/D9/D10/D11 ratified by the Lead).** The
table's `VERIFY`s resolved: there is no `Banner tone="neutral"` (insights are `Banner info`) and no `IconButton tone`
prop (the food-log trash uses the plain `IconButton`). Health hero: four tiles, 2×2 on phone (4-up dense truncated
"kcal eaten"), one dense row from tablet up. Week card: a 2×2 grid of two `StatRow plain` rows (`plain` ignores
`direction`). `DayBars`: burned bar `textMuted` (not the border tone; ≥ 3:1 in both schemes), a `surface` track per
column, a legend row "Eaten / Burned", bars 18 wide (28 at desktop), 164 high in all (legend 16 + 8 + bars 120 + 4 +
letter 16). Desktop 1280: `Columns 7/5` inside `Page wide`, main/side 658/470 (as `/activity`). Quick-add meal picker:
five `ToggleChip`s in a radiogroup (a 5-option `SegmentedControl` scrolls at 358). Designer findings F1–F5:
`docs/design/reviews/UI-NUTRI-r1.md`.

## 7. Quick-add catalog (`packages/shared/src/nutrition/quickAdd.ts`; `QUICK_ADD: ReadonlyArray<QuickAddItem>`)
`QuickAddItem = { id: string (slug), name: Label, portion: Label, grams: Option<number>, kcal, proteinG, carbsG, fatG,
meal: Meal (default), aliases: ReadonlyArray<string> }`; search = case-insensitive substring on name + aliases,
sorted by name. Values below are typical label values and are **not frozen**: N-F0 verifies every row against
USDA FoodData Central (CC0; `https://fdc.nal.usda.gov/api-guide`, DEMO_KEY 30 req/h) before writing the data
and records the FDC id per row in a comment; a row it cannot verify is dropped, not guessed. Open Food Facts
(ODbL, share-alike) is the v2 barcode option, called live, never mirrored into D1 (research §Food data).
| id | name | portion | g | kcal | P | C | F | meal | aliases |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| whey-scoop | Whey protein shake | 1 scoop in water, 30 g | 30 | 106 | 23.4 | 1.9 | 0.5 | supplement | shake, protein |
| whey-milk | Whey shake with milk | 1 scoop + 300 ml 2 % milk | 335 | 258 | 33.5 | 16.5 | 6.5 | supplement | shake |
| protein-bar | Protein bar | 1 bar, 60 g | 60 | 220 | 20 | 22 | 7 | snack | bar |
| creatine | Creatine monohydrate | 5 g | 5 | 0 | 0 | 0 | 0 | supplement | creatine |
| casein | Casein shake | 1 scoop, 30 g | 30 | 110 | 24 | 3 | 1 | supplement | |
| egg | Egg | 1 large, 55 g | 55 | 78 | 6.3 | 0.6 | 5.3 | breakfast | eggs |
| egg-whites | Egg whites | 100 g | 100 | 52 | 11 | 0.7 | 0.2 | breakfast | |
| oats | Oats | 60 g dry | 60 | 230 | 8 | 40 | 4 | breakfast | oatmeal, porridge |
| banana | Banana | 1 medium, 120 g | 120 | 105 | 1.3 | 27 | 0.4 | snack | |
| apple | Apple | 1 medium, 180 g | 180 | 95 | 0.5 | 25 | 0.3 | snack | |
| greek-yogurt | Greek yogurt | 200 g | 200 | 130 | 20 | 8 | 0.8 | breakfast | yoghurt, skyr |
| cottage | Cottage cheese | 200 g | 200 | 200 | 24 | 7 | 8 | snack | curd |
| chicken | Chicken breast, cooked | 100 g | 100 | 165 | 31 | 0 | 3.6 | lunch | |
| beef | Lean beef, cooked | 100 g | 100 | 220 | 27 | 0 | 12 | dinner | steak |
| salmon | Salmon, cooked | 100 g | 100 | 206 | 22 | 0 | 13 | dinner | |
| tuna | Tuna, canned in water | 1 can, 120 g | 120 | 130 | 29 | 0 | 1 | lunch | |
| rice | White rice, cooked | 100 g | 100 | 130 | 2.7 | 28 | 0.3 | lunch | |
| potato | Potato, boiled | 200 g | 200 | 170 | 4 | 38 | 0.2 | dinner | potatoes |
| bread | Whole-grain bread | 1 slice, 40 g | 40 | 100 | 4 | 17 | 1.5 | breakfast | toast |
| pasta | Pasta, cooked | 150 g | 150 | 235 | 8 | 46 | 1.4 | dinner | |
| milk | Milk 2 % | 250 ml | 250 | 125 | 8.5 | 12 | 5 | snack | |
| almonds | Almonds | 30 g | 30 | 175 | 6.4 | 6.5 | 15 | snack | nuts |
| peanut-butter | Peanut butter | 1 tbsp, 16 g | 16 | 95 | 4 | 3 | 8 | snack | |
| olive-oil | Olive oil | 1 tbsp, 14 g | 14 | 120 | 0 | 0 | 14 | dinner | oil |
| coffee-milk | Coffee with milk | 1 cup | 200 | 40 | 2 | 3 | 2 | breakfast | latte, cappuccino |
| beer | Beer | 500 ml | 500 | 215 | 2 | 18 | 0 | snack | |
Test pins (as landed by N-F0, 2026-10-27): 23 items (casein, protein bar, creatine dropped: not verifiable in USDA SR
Legacy), unique ids, every `totalsOf([item])` equals the row, `searchQuickAdd("shake")` returns 2 (whey-scoop, whey-milk).

## 8. End-to-end recipe (QA, N-Q1 local; N-Q2 production)
Local: worker `pnpm dev` (`GARMIN_MODE=console` for the fixture burn) + web; sign in; Settings → Nutrition → goal
gain, 85 kg, moderate, no height → shows "3,190 kcal · 155 g" (§4 fallback: 22 × 85 = 1,870 × 1.55 = 2,898.5 ×
1.10 = 3,188.35 → 3,190; protein 85 × 1.8 = 153 → 155); add 180 cm, born 1990, male → "3,070 kcal · 155 g" (§4's
Mifflin pin); MCP Inspector or the
`McpRoute.workerd.test.ts` harness: `tools/call log_food { meal: "lunch", items: [{ name: "Chicken rice bowl",
portion: "1 bowl", kcal: 650, proteinG: 45, carbsG: 70, fatG: 15 }] }` → `day.kcalLeft = 2420` (Mifflin; 2540 on the
fallback; eat-back off); app sync → Today strip "2,420 kcal left · Eaten 650"; Health hero and food log show the entry;
quick-add Whey ×1 (106 kcal, §7) → strip 2,314 left; delete the bowl from the log → Undo → still there; with
Garmin connected (`GARMIN_MODE=console`, or the month seed's 7 `daily_health` rows) the Health burned bars show; `get_week_review` →
`daysLogged = 1`, `workoutsPlanned` = this week's plan count. Production (owner): Claude app → photo of a meal →
"log it" → Claude calls `log_food` → Today strip updates after the next sync (≤ 1 min foreground). Screenshots
N1–N6 both themes, both widths.

## 9. Assumes (cited; read against the source before the charters)
- `DailyHealth.totalCalories` = Garmin `totalKilocalories` (`docs/design/garmin.md` §0 "totalCalories = active +
  bmr" — the spec's `usersummary/daily` carries `totalKilocalories` directly, `$S/garmin/spec.json`; GM-3 may map
  either: same number) and `activeCalories`, `steps`, `restingHeartRate`; no sleep field (`garmin.md` §1).
- `daily_health` rows are server-written, pull-only, one per `(userId, provider, date)` (`garmin.md` §2, §9).
- Today's Garmin row is re-read every 5-min run (`garmin.md` §3 `healthThrough = today − 1 d`), so today's burn is
  partial until the day ends → §3's "partial" wording and ADR-0025 §1's "left vs target".
- `Profile` JSON columns pattern: `locations: jsonColumn(Locations)` and `activeLocationId: Schema.NullOr`
  with an encode default (`packages/shared/src/row.ts` `ProfileRow`); `ProfilePatch` is built from bare field
  schemas, not `ProfileFields` (`user.ts` comment above `ProfilePatch`) → `nutrition` follows both.
- `ProfileRepo` (db) has only `get`/`put`; `update_profile` reads, merges, puts (`apps/worker/src/mcp/writeTools.ts`
  `updateProfile.run`: `profileRepo.get` then the patch) → the `nutrition` key rides the same merge.
- Mobile `ProfileRepo.save(patch: ProfilePatch)` exists (`apps/mobile/src/services/ProfileRepo.ts`) → Settings
  writes through it; `useProfile` hook exists (`apps/mobile/src/hooks/useProfile.ts`).
- `Tool` = `{ name: McpToolName, kind, description, input, output, run(userId, input) }`; `server.ts` registers
  `readTools`/`writeTools` by scope and reads `ANNOTATIONS[tool.name]` exhaustively ("a new `MCP_TOOLS` name
  without an entry is a compile error", `server.ts:77`) → N-S2 adds four annotation entries.
- `SyncStore` rejects with `RejectReason "invariantViolated"` (pattern `programEnrollment`,
  `packages/db/src/sync/SyncStore.program.test.ts`) → the totals check reuses it.
- Sessions complete when `finishedAt` is Some (ADR-0018 §4 + TODAY-FIN writer) → `workoutsDone` counts those;
  `workoutsPlanned` = planned sessions of the active plan's week containing `weekStart` (`PlanRepo.listWeeks`,
  `tools.ts activePlanSummary`).
- Primitive props verified 13:57 (`grep -n "readonly" apps/mobile/src/ui/*.tsx`): `ListRow {title, titleVariant,
  subtitle, leading, icon, trailing, chevron, tone, onPress}`; `Card {onPress, tone, padding}`; `StatRow {items,
  variant bare|tile|plain, direction, dense, valueVariant}`; `Button {label, variant, size, icon, loading,
  disabled}`; `Banner {tone, title, body, action, onDismiss}`; `SegmentBar {total, filled, accessibilityLabel}`;
  `Text {variant, tone, tabular, headingLevel}`. Icons present: `flame zap calendar grid book chart target timer
  clock plus minus trash settings warning check info` — `fork` is NEW (N-M1).
- Garmin team owns (until its commit) `common.ts, sync.ts, row.ts, SyncStore.ts, migrations.ts, LocalStore.ts,
  DataExport.ts, HealthStrip.tsx, TodayReady.tsx` (`docs/tasks/v5-garmin/team-garmin.md` Owned paths) → v6
  foundation N-F0 starts at the hand-off commit, not before.
