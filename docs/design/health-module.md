# Health module — Today card and `/health` hero (HM-D, 2026-10-27)

Replaces nutrition.md §6 "Today strip" and garmin.md §7 "Today strip" (both strips are deleted, plan
Amendment 23) and nutrition.md §6 "Health" hero. Trigger: the owner on production Today (16:07): "Looks
terrible, where is the designer? Did you see how Apple Fitness e.g. looks?". Mockups: HTML in
`docs/design/mockups/health-module/` (not the app), shots `docs/design/screens/HM-{A,B}-{today,health}-{390,1280}-{light,dark}.png`,
gallery rows `screens/HM-rows.html`. Status: **proposed**; default if the owner does not pick is §3 (merge).

## 0. Research (what the daily summary looks like elsewhere)
- Apple Fitness: three concentric rings (Move/Exercise/Stand), each a colour that never changes meaning, ring fills
  clockwise from 12, over-goal keeps going round; big rounded numerals beside the rings, caption "of 600 kcal";
  no data = grey track, never a dash. Hierarchy: one object (rings) + one numeral group + small stats under.
- Apple Health: one metric per card, large numeral + unit in smaller type, colour per category, "No data" in
  muted text on an empty chart, never an empty tile.
- Garmin Connect: 270° gauge arcs (Body Battery, steps) with the numeral inside the arc, goal at the arc end;
  week = 7 bars with the goal line; stale values carry a "as of" time in caption.
- Oura / Whoop: one score ring, large numeral centred, three labelled contributors under it as thin horizontal bars
  (label left, value right, bar below) — the bar carries the ratio, the numeral the fact.
- MyFitnessPal: "Calories remaining = goal − food + exercise" as the headline equation; a single ring with
  "Remaining" inside; macros as three small rings with "g left" under; exercise burn eaten back is shown as its own
  line, not hidden in the budget.
- Common: the headline is what is LEFT (actionable), colours are fixed per metric, goals make rings/bars (no goal →
  numeral only), absence is a grey track plus a muted caption, numerals are tabular and ≥ 2× the label size.

## 1. Directions
- **A "Rings"** (Apple Fitness): a 104 px double ring (outer eaten / budget in `accent`, inner protein / target in
  `success`) beside "LEFT TODAY" + `display` numeral + budget caption; a three-stat row (Eaten · Burned · Protein);
  one caption line (insight · steps · resting bpm). `/health`: the same ring at 176 (240 at 1280) with a `numeral`
  72 "left"; week = seven 40 px day rings.
- **B "Gauge"** (Garmin / Whoop): a 240° gauge (200 px, 240 at 1280) with the `numeral` inside ("1,650 / kcal
  left"); under it three labelled bars (Eaten amber, Protein green, Burned neutral with "as of 14:05"); steps · bpm
  caption. `/health`: gauge 260/320 beside the bars; week = seven vertical bars, over-budget day in `danger`.
- **Merge (default)**: A's double ring, numeral group and three-stat row on Today and as the `/health` hero, with
  B's week bars (the existing `DayBars`, over-budget bars in `danger`) and B's "as of HH:MM" freshness caption.

## 2. Data (read on device; all symbols verified by grep 16:12)
`DayTotals` (`packages/shared/src/nutrition.ts`, `export const DayTotals`): `eaten: Totals {kcal, proteinG, …}`,
`burned: Option<Kcal>`, `activeBurned`, `steps: Option<Count>`, `burnedAsOf: Option<Timestamp>` (written by
`buildDayTotals` from `health.updatedAt`, same file), `targets: Option<DayTargets {kcal, proteinG, goal}>`,
`budgetKcal`, `kcalLeft: Option<Int>`, `proteinLeftG`, `entries`. Resting heart rate is not in `DayTotals`: `/health`
reads `DailyHealth.restingHeartRate` (`packages/shared/src/garmin.ts`) from `HealthWeek.health` through
`restingHrWeek` (`src/components/health/healthWeekMath.ts`); Today never shows it (Amendment 26). Whether Garmin is
connected comes from `useGarminConnected()` (`src/hooks/useIntegrations.ts`). `DayTotals` comes from
`useNutritionDay(localDateOf(new Date()))` (`src/hooks/useNutritionDay.ts`, state `Ready` → `NutritionDay.day`).
Numbers: `formatInt` (`packages/shared/src/nutrition.ts`). Insights: `insights(input)` ≤ 3, first one shown on Today.

## 3. Merge spec — Today module `src/components/today/HealthModule.tsx`
Placement: 390 — above the planned session, `marginTop: space.lg`, Card (content 358, inner 326); 1280 — the
right column's (496) first card, inner 464. Pressable (whole card) → `/health`; `usePressableInteraction`
hover/pressed = `surface` → `surfaceRaised` (the `Card onPress` default). `accessibilityRole="button"`,
`accessibilityLabel` = the text equivalent in §6.
```
┌ Card ──────────────────────────────────────────────┐
│ ◎◎  (104)      LEFT TODAY            label          │  row 1: 104 high
│                1,650                 display 34/38   │
│                of 3,070 kcal budget  caption         │
│ • EATEN        BURNED        • PROTEIN    label      │  row 2: 16 + 22 = 38, gap-top 12
│ 1,420          1,840         96 / 155 g   headline   │
│ as of 14:05 · 8,420 steps · 52 bpm resting  caption  │  row 3: 18, gap-top 8
│ Protein 59 g short — a shake covers it      caption  │  row 4: 18, gap-top 4 (first insight; 0 when none)
└────────────────────────────────────────────────────┘
```
| row | slots (left → right) | width at 326 (390) | width at 464 (1280) | height |
| --- | --- | --- | --- | --- |
| 1 | `HealthRings size=104` · gap 16 · text block (`label` 16 + `display` 38 + `caption` 18 = 72, centred vertically) | 104 + 16 + 206 = 326 | 104 + 16 + 344 = 464 | 104 |
| 2 | 3 × `HealthStat` (flex 1, gap 8; first slot takes the rounding remainder) | 104 + 8 + 103 + 8 + 103 = 326 | 150 + 8 + 149 + 8 + 149 = 464 | 38 |
| 3 | `caption muted` one line, `numberOfLines={1}` | ≤ 44 chars × 6.5 = 286 ≤ 326 | ≤ 464 | 18 |
| 4 | `caption` (text colour) one line | ≤ 326 | ≤ 464 | 18 or 0 |
Card height: 16 + 104 + 12 + 38 + 8 + 18 + 4 + 18 + 16 = 234 (+ Card border as the `Card` primitive draws it);
212 without an insight. Stat slot content: label ≤ 8 chars (52 px + 14 px dot) and value "96 / 155 g" = 22 + 50 =
72 ≤ 103 ✓. Dots: 8 px circles (`accent` before Eaten, `success` before Protein, none before Burned).
Ring geometry: outer r = 52 − 5 = 47 (stroke 10 = `stroke.ring`), inner r = 47 − 10 − 4 = 33, track `border`.

## 4. Merge spec — `/health` hero `src/components/health/HealthHero.tsx` (route order unchanged: hero, DayBars, WeekReviewCard, InsightList, FoodLog)
390 (content 358, no card, column layout, all centred): `HealthRings size=176 stroke=12` (outer r 82, inner 66);
gap 16; text block `label` 16 + `numeral` 72/76 + `caption` 18 = 110; gap 16; stat row 3 × `HealthStat
valueVariant="title"` (label 16 + title 30 = 46; 118 + 8 + 116 + 8 + 116 = 358, centred text). Hero height 176 +
16 + 110 + 16 + 46 = 364; then `rhythm.heroToSection` 24 to "This week".
1280 (left column 696): row layout `HealthRings size=240 stroke=14` (outer r 113, inner 95) · gap 32 · text block
424 wide (label, numeral, caption left-aligned, then the stat row 136 + 8 + 136 + 8 + 136 = 424 at gap-top 16).
Hero height 240. `DayBars` (right column at 1280, under the hero at 390) adds: a bar whose day's `eaten.kcal` >
`budgetKcal` (both Some) is `danger`, else `accent`; the `WeekReviewCard` text stays.

## 5. Primitives (new, `src/ui/`; exported from `src/ui/index.ts`)
`HealthRings` (`src/ui/HealthRings.tsx`; no sibling differs only by case — `ls src/ui | tr A-Z a-z | sort | uniq -d`
prints nothing): react-native-svg `Svg`/`Circle` like `ProgressRing.tsx`, geometry from `ringGeometry`/`clamp01`
(`src/ui/controls.ts`), no animation.
| prop | type | meaning |
| --- | --- | --- |
| `size` | `104 \| 176 \| 240` | outer diameter |
| `stroke` | `number` | both rings' stroke (10 / 12 / 14); inner radius = outer − stroke − 4 |
| `outer` | `{ progress: number; tone: "accent" \| "danger" }` | eaten / budget; `danger` when over budget (clamped to 1) |
| `inner` | `{ progress: number; tone: "success" }` | protein / target |
| `empty` | `boolean` | no targets: both arcs at 0 (tracks only), `accessibilityValue` omitted |
| `accessibilityLabel` | `string` | e.g. "Eaten 46 percent of budget, protein 62 percent of target" |
| `children` | `ReactNode` | optional centred overlay (unused in §3/§4; kept for parity with `ProgressRing`) |
`accessibilityRole="image"` (two values, one progressbar role would misreport). Tone → colour via
`useTheme().colors[tone]`.
`HealthStat` (`src/components/health/HealthStats.tsx`, one file, two exports `HealthStat`, `HealthStatRow`):
| prop | type |
| --- | --- |
| `label` | `string` (rendered uppercase `label`, `textMuted`) |
| `value` | `string` (`formatInt`-ed; "—" when None) |
| `unit` | `string \| undefined` (caption after the value: " / 155 g", " kcal") |
| `dot` | `"accent" \| "success" \| undefined` |
| `valueVariant` | `"headline" \| "title"` (Today / hero) |
| `valueTone` | `"neutral" \| "danger" \| "muted"` (over budget / stale burned) |
`HealthStatRow({ items: readonly [HealthStatProps, HealthStatProps, HealthStatProps], align: "start" | "center" })`
is the flex-1 gap-8 row. Pure helpers in `src/components/today/healthModuleMath.ts` (no `HealthModuleMath.tsx`
sibling): `ringFractions(day) → { eaten: Option<number>; protein: Option<number>; over: boolean }`,
`heroNumber(day) → { label: string; value: string; tone: "neutral" | "danger"; caption: string }`,
`metaLine(day, now: Date, zone: DateTime.TimeZone, trackerConnected: boolean) → string` (row 3),
`freshnessLine(day, now, zone, trackerConnected) → string` (the `/health` caption: `metaLine` without steps),
`isStale(burnedAsOf, now, zone?) → boolean`; in `src/components/health/nutritionText.ts`
`healthStats(day, stale, variant: "headline" | "title")` → the three `HealthStatProps` (Today `headline`, hero `title`,
which adds "kcal" after Eaten and a present Burned).

## 6. State matrix (Today module and hero use the same table)
| state (source) | rings | numeral group | stats | row 3 | module shown? |
| --- | --- | --- | --- | --- | --- |
| all present (`targets` Some, `burned` Some, entries > 0) | eaten/budget `accent`, protein/target `success` | LEFT TODAY · `kcalLeft` · "of {budget} kcal budget" | 1,420 · 1,840 · 96 / 155 g | "as of HH:MM · steps · bpm resting" | yes |
| over budget (`kcalLeft` < 0) | outer full, `danger` | OVER TODAY · "−220" tone danger · same caption | Eaten tone danger | same | yes |
| nothing logged (entries = 0, targets Some) | outer 0, inner 0 | LEFT TODAY · budget · "nothing logged yet" | 0 · burned · 0 / 155 g | same | yes |
| Garmin off (`burned` None, targets Some) | as above | kcalLeft from budget (no eat-back) | Burned "—" | "No tracker connected" (steps/bpm dropped) | yes |
| waiting for Garmin (connected, no `daily_health` row for the day yet, e.g. before the first pull) | unchanged | kcalLeft from budget (no eat-back) | Burned "—" | "Waiting for Garmin" | yes |
| no profile (`targets` None), Garmin on | `empty` (tracks only) | BURNED TODAY · `burned` · "Set a goal for a budget" | Eaten (entries sum) · Burned · Protein "96 g" (no target) | "as of HH:MM · steps · bpm" | yes |
| no profile, Garmin off, nothing logged | — | — | — | — | **hidden** (Today); `/health` keeps its `Off` EmptyState |
| stale `burnedAsOf` (`isStale` = local date of `burnedAsOf` ≠ today) | unchanged | unchanged | Burned `valueTone="muted"` | "as of yesterday HH:MM · …" | yes |
Loading / Failed of either hook: module not rendered (as both strips today). Text equivalent (`accessibilityLabel`):
"Health today: {label} {value}; eaten {n}; burned {n or no data}; protein {n} of {target} g; {meta}".

## 7. Colour, type, motion, accessibility
- `accent` = eaten (the number the owner acts on and the brand accent), `success` = protein (a goal you reach),
  `danger` = over budget, `text`/`textMuted` = burned (no target, informational), `border` = tracks. Contrast of arcs
  on `surface`: light `#C2410C`/`#F6F6F7` 5.0:1, `#1E7F3C` 4.9:1; dark `#FFB020`/`#181B1F` 9.6:1, `#4ADE80` 10.3:1 (≥ 3:1 ✓).
- Type: `label` (uppercase, letterSpacing 0.6), `display` 34/38 (Today numeral), `numeral` 72/76 (hero), `headline`
  / `title` for stats, `caption` for meta and insight; all numerals `tabular`. No new fonts.
- Motion: none (static arcs; `motion` tokens unused). Haptics none.
- Every number through `formatInt`; the ring has a text equivalent (§6); hit box = the whole card ≥ 44 px.
- Icons: none inside the module (the ring is the glyph); the Health app bar keeps `plus`.

## 8. Verification (for the engineers' done-criteria)
`/today` and `/health` at 390 × 844 and 1280 × 900, light and dark, states: all present, Garmin off, no profile,
nothing logged, over budget (seed the offline store; dev user per nutrition.md §8). `getBoundingClientRect` of the
Today card = 358 × 234 ± 2 at 390 and 431 (training day, aside) to 536 (rest day) wide at 1280;
`document.querySelectorAll("h1").length === 1` on `/health` (Today has 6 by design: workout title + exercise pages); `ab errors` empty; shots `UI-HM-{today,health}-{state}-{w}-{theme}.png` + rows `screens/HM-rows.html` §2.

## 9. Not decided / VERIFY
- `VERIFY:` `Card` primitive's border per scheme (grep `borderWidth` in `src/ui/Card.tsx` found none; the ±2 in §8
  covers it). `DailyHealth` field names verified in `healthWeekMath.ts` (`restingHeartRate`).
- Week rings (direction A2) are not built unless the owner picks A; a seven-day ring row is 7 × 40 + 6 × 8 = 328 ≤ 326?
  No — 2 px over the Card inner at 390 (would need 38 px rings); recorded so the A pick does not inherit the slip.


## Addendum (Lead, 2026-10-27 16:22) — plan Amendment 26
Owner: "I think you can drop bpm from UI — or do you think we need it somewhere?" Decision: resting heart rate is **not shown on the Today module** in any direction (the caption line carries steps only); it stays on `/health` as one small weekly stat (7-day average with the trend arrow, `HealthStat` size `sm`) — a recovery signal worth a glance, not a daily headline. HM-1/HM-2 briefs apply this; the A/B mockups predate it.
