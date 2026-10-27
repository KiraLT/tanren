# ADR-0025: Nutrition tracking — food via MCP, burn from Garmin, goals on the profile

Status: accepted (Lead decision under plan Amendment 3; owner words in plan Amendment 20, 2026-10-27 13:52).
Design: `docs/design/nutrition.md`. Tasks: `docs/tasks/v6-nutrition.md`.

## Context
The owner wants calories and macros "like MyFitnessPal" with the least effort: he photographs a meal in the
Claude app and Claude logs it through MCP; manual entry is only for shakes, bars and supplements. Garmin
(ADR-0023) already imports a `daily_health` row per day with `totalCalories` (= Garmin `totalKilocalories`,
BMR + active) and `activeCalories`. He asked whether our logged workouts would double-count, wants Today to
show burned vs eaten with insights, a Health view, goals (gain muscle / lose weight / maintain) with protein
tracking, and a weekly review. "I dont need max precision, but I want it to make as easy as possible."

## Decision
1. **Budget = goal intake; Garmin burn is information.** The number the owner eats against is the target
   from the goal (§3). For a day with a `daily_health` row, "burned today" is Garmin's `totalCalories`
   (`totalKilocalories` = BMR + active, as of the last pull, shown with its time) next to it. Our logged
   strength sessions never add calories: the watch worn in the gym already counted them in the daily total
   (research note §Garmin; MyFitnessPal's linked-tracker adjustment is the same idea — tracker burn replaces
   manual exercise, and double counting arises only from manual entries without a time window). An optional
   **"Eat back active calories"** toggle on the nutrition profile (default OFF) adds `activeCalories` to the
   budget, floored at 0 — MFP's adjustment without the negative branch. Without a Garmin row the app shows
   "Burned: no data" — no BMR estimate in v1. Net (eaten − burned) is reported only for days Garmin covered.
   `VERIFY:` whether Garmin's daily value grows during the day (research note: unverified); the production
   5-min cron rows answer it in a day — the UI says "as of HH:MM" either way.
2. **One synced table `food_entry`** (`foodEntry`; one row = one meal or photo) with `items` as a JSON column
   and denormalised totals (kcal, protein, carbs, fat); `source` ∈ `mcp | manual | quick_add`; soft delete;
   LWW sync like every user-owned table. No food catalog table, no external food API in v1 (v2 option: Open
   Food Facts barcode lookup — free, no key; `VERIFY:` research §"food data sources").
3. **Goals live on `profile`** as one JSON column `nutrition` (nullable; `None` = nutrition off, nothing
   rendered). It holds the goal, body facts (weight, optional height/birth year/sex, activity level) and two
   optional manual overrides. Targets are **derived on read** by a pure function in `packages/shared`
   (Mifflin-St Jeor when height/age/sex are present, else 22 kcal/kg; × activity multiplier 1.2–1.9; goal
   factor ×0.80 lose / ×1.00 maintain / ×1.10 gain; protein 2.2 / 1.6 / 1.8 g/kg — research note §Formulas:
   Helms 2014, Iraki 2019, ISSN 2017; the multipliers' primary source is unverified there) and replaced by the
   override when set. Stored overrides survive formula changes; derived defaults follow the weight.
4. **MCP is the main entry.** Four new tools: `log_food`, `get_nutrition_day`, `get_week_review`,
   `delete_food_entry`; `update_profile` gains the `nutrition` key (no separate `set_nutrition_goal`: one
   profile writer, one description). `log_food` answers with the day's running totals against the targets so
   Claude can say "620 kcal left". Tool descriptions teach the photo estimate (portion first, then kcal and
   macros, state confidence, never ask for weights).
5. **Quick-add is data, not a service**: ≈ 24 common foods/supplements in `packages/shared` searched by name
   on device; tap → entry with an editable portion multiplier.
6. **Health is a root-stack route `/health`, not a sixth tab.** The tab bar stays at the Forge five
   (`APP_NAV`, ui-direction-final §6); Today's nutrition strip is the daily entry point and opens Health;
   Settings gains "Nutrition & goals" (`/settings/nutrition`). Health = today's four numbers, 7-day eaten vs
   burned bars, protein days, the week review card, Garmin activities, the food log with delete, quick-add.
7. **Insights are eight rules** computed on device from the week's rows (design §5); no LLM in the app.

## Consequences
- Migration 0008 (after Garmin's 0007): `profile.nutrition TEXT NULL`, new `food_entry` table. Every
  exhaustive sync consumer (`SyncTable`, `SYNC_TABLE_ORDER`, `SyncChange`, `ROW_TABLE/ROW_KEYS`, both
  `SyncStore`s, mobile `migrations.ts` v5, `LocalStore`, `DataExport`) gains one member — the foundation
  task owns them and starts only after the Garmin team's GM-2/GM-5 commits (same files).
- Days without Garmin show no burn and no net; the owner sees "left vs target" everywhere, which is the
  number that drives eating decisions anyway.
- Claude's estimates are approximate; `confidence` is stored per item and the Health copy says "estimated".
- Privacy text (ADR-0024 §1) needs one sentence on food data; done by integration after LEGAL-2b lands.
- Garmin's own `consumedKilocalories` field is ignored (we never write to Garmin); sleep is not in
  `daily_health` v1 → Health shows steps/resting HR only; sleep is a Garmin follow-up (design §9).

## Alternatives considered
- Estimate burn (BMR + session MET) when Garmin is absent: more code, false precision, rejected for v1.
- Add workout calories on top of Garmin: double counts whenever the watch is worn, which is the owner's case.
- A `food_item` catalog table + per-item rows: enables analytics per food, but the owner logs photos; one row
  per meal with JSON items is what Claude produces and what the log shows.
- Separate `nutrition_goal` table: a 1:1 with profile; a JSON column follows the `locations` precedent.
- Sixth tab: breaks the five-glyph tab bar and desktop `AppBar` nav; Health is read a few times a week.
- Open Food Facts search in v1: network dependency and a search UI for a path the owner says he will barely use.

## Overrides
- 2026-10-27 14:02 (Lead, mid-box, with the research note): "budget = goal intake; Garmin 'burned today'
  (`totalKilocalories` = BMR + active) is shown as information next to it; an optional 'eat back active
  calories' toggle (default OFF) adds `activeKilocalories` to the budget, floored at 0; Tanren strength
  sessions never add calories … gain +10 % default, cut −20 % default, protein 1.6 / 1.8 / 2.2 g/kg for
  maintain / gain / cut … quick-add values verified against USDA FoodData Central before freezing; Open Food
  Facts is the v2 search option, called live, not copied … tool description: portion first (hand/plate
  references), add a cooking-fat item, lean high on fatty dishes, never ask for weights." Changed: §1 (toggle,
  "as of" wording), §3 (goal factors, protein), design §1 `eatBackActive`, §3 `log_food` description, §4, §7.

## Not decided here
Sleep/body-battery import, barcode scanning, Apple Health burn, exporting food to Garmin — later amendments.
