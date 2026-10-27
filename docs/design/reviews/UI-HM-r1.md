# UI-HM r1 — designer verdict on the built health module (HM-DR, 2026-10-27 16:47)

Scored against `docs/design/health-module.md` §3–§7 + Addendum (no resting HR on Today, sentence-case labels) and
the owner's reference (Apple Fitness summary: one ring object, one numeral group, small stats under, colours fixed
per metric, grey track when empty). Shots: `docs/design/screens/UI-HM-{today,health}-*` (16). Engineers' numbers
read as given (Today card 358 × 236 / 431 wide at 1280, no-profile 214; hero 364 at 390, row ≥ 640 with ring 240).
Not re-reported: insight "75 g short" vs "78 / 155 g" (HM-4), dead `asOfText` export (consumed by F2 below), CLAUDE.md.

## Verdict

| module | 390 light | 390 dark | 1280 light | 1280 dark | verdict |
| --- | --- | --- | --- | --- | --- |
| Today card (`HealthModule`) | 4 | 4 | 4 | 4 | PASS |
| /health hero (`HealthHero`) | 4 | 4 | 4 | 4 | FIX (F3, cosmetic, one line) |
| /health week block (DayBars + meta + resting HR + Protein target + This week) | 3 | 3 | 2 | 2 | FIX (F1, F2) |

Today card: this is the Apple pattern — 104 double ring, "Left today" over a 34 numeral, three labelled stats with
colour dots that match the arcs, a muted freshness line and one bold insight; the no-profile state keeps grey
tracks and swaps the headline to "Burned today / Set a goal for a budget" exactly as §6. Dark `#FFB020` / `#4ADE80`
arcs on `surface` read at a glance. 236 vs spec 234 is the Card border. **1280 at 431: no change** — the three stat
slots are 150 wide, nothing wraps, the card is the aside's natural first object. Why not 5: the stat row is one
line of `headline` numbers; Apple's are heavier, but at 326 a bigger value would fight the 34 numeral. Accepted.

/health hero: ring 176 / 240 with stroke 12 / 14 is the right ring-to-size ratio, the 72 numeral owns the screen,
the over state (full `danger` outer arc, "-79" in `danger`, eaten value in `danger`) is unmistakable in both
schemes. One flaw: the unit after each value ("kcal", "bpm", "/ 155 g") renders in the display face (the nested
`Text` inherits the `title` font family), so "969 kcal" reads as a condensed-bold "kcal" — a wrong-font tell the
owner will notice next to the Today card, where the same stat (headline = platform font) shows "/ 155 g" correctly.

/health week block: 390 — after the chart, "as of 27 Oct 16:37 · 9,568 steps", then a bare "Resting HR · 7-day
average" label and a "51 bpm" numeral float left-aligned between the chart and the Protein target card: an orphan
stat with no surface, exactly the text-stat pattern the owner rejected. 1280 — the chart, meta and resting HR sit
in the 658 main column under the hero while the 431 side column holds one insight and "This week" and then ≈ 550
px of nothing; the page does not fill (owner, Amendment 7). The spec (§4) put `DayBars` in the right column.
**Ruling: right column at 1280**, phone order unchanged (hero, bars, protein, insights, review, food).

## Fix list (ranked; one engineer round)

| # | file · component | change |
| --- | --- | --- |
| F1 | `app/health/index.tsx` Ready layout | Desktop: `Columns split="7/5" main={stack([hero, protein, foodLog])} side={stack([insights, review, bars, activities])}`; phone: `stack([hero, bars, protein, insights, review, activities, foodLog])` (route order §4 kept). Side inner is 431: columns (431 − 6·8)/7 = 54 ≥ 2·18 + 4 = 40 ✓, 28-px bars would need 60 ✗ → bars are 18 px everywhere: delete the `barWidth` prop from `DayBars` and `WeekBars` and the `desktop ? 28 : 18` call (no-legacy; supersedes UI-NUTRI-r1 F4). Done when the 1280 side column shows insight, This week, chart, meta, F2 card (≈ 70 + 150 + 164 + 18 + 78 = 480 high) and the main column shows hero, Protein target, food log. |
| F2 | `app/health/index.tsx` `WeekBars` meta + resting HR | Replace the bare `HealthStat` row with a `Card padding={rhythm.cardPadding}` holding a row `gap: space.sm` of two `HealthStat valueVariant="title"`: slot 1 label "Steps today", value `formatInt(day.steps)` ("—" when None); slot 2 label "Resting HR · 7 days" (19 chars ≈ 124 px ≤ 159), value `restingHrText`, unit "bpm", tone `muted` under 3 days as now. Widths: 390 inner 326 = 159 + 8 + 159; 1280 side inner 399 = 196 + 8 + 195 (first slot takes the remainder). Height 16 + 16 + 30 + 16 = 78. The caption under the bars becomes `asOfText(...)` from `health/nutritionText.ts` (freshness only; steps moved into the tile, so the number is not shown twice) — `metaLine` and its tests (`healthModuleMath.test.ts` "as of 14:05 · 8,420 steps", lines 188–216) are unchanged because Today keeps using it. VERIFY the `asOfText` argument shape against `day`'s `burnedAsOf` (grep `burnedAsOf` in `healthModuleMath.ts`). |
| F3 | `src/components/health/HealthStats.tsx` unit | The unit is a baseline sibling, not a nested span: value + unit in `View style={{ flexDirection: "row", alignItems: "baseline", gap: space.xs }}`, unit `Text variant="caption" tone="muted" tabular` (platform font). Trim the leading space from every unit string at the call sites: `HealthHero.tsx` " kcal" → "kcal", " / 155 g" → "/ 155 g"; `index.tsx` " bpm" → "bpm"; `HealthModule.tsx` the same "/ 155 g". Computed `fontFamily` of the unit equals the `caption` family in both schemes (not the display face). No test pins the unit strings with the leading space (grep `" kcal"\|" bpm"` in `src/components/**/*.test.ts` prints nothing at 16:46; re-run after the edit). |

Re-measure after the fix: 390 `/health` block order hero → chart (legend at top) → "as of HH:MM" caption → 78-px
two-tile card → Protein target; 1280 side column `[~785, 77, 431, ≈ 480]`, main column has no chart; unit glyphs in
the platform font. Re-shoot `UI-HM-health-{ready,over}-{390,1280}-{light,dark}` (8); Today shots stand.
