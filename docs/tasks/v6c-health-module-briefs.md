# HM — Today health module + /health hero (briefs, from `docs/design/health-module.md` §3–§8)

Start condition (FILE, not commit): `apps/mobile/app/(tabs)/today.tsx`, `src/components/today/NutritionStrip.tsx` and
`src/components/health/*` are final (the ≈ 16:30 v6 commit landed and the tree is green). Order: HM-1 → (HM-2 ∥ HM-3)
→ HM-4. Permissions line for every brief: edit only the listed files; `pnpm check` output in the report; no new
dependency (react-native-svg is installed and already draws `ProgressRing`). Owner pick: A, B or merge; these briefs
build the merge (health-module.md §3); if the owner answers "A" or "B" before HM-2 starts, the Lead swaps §3/§4 for §1's
A2/B1–B2 row (A2 week rings need 38 px rings, §9) — the primitives and tasks stay.

## HM-1 · `HealthRings` + `HealthStat` primitives + pure math · engineer/sonnet · Time box 20 min
Files: `apps/mobile/src/ui/HealthRings.tsx` (new), `src/ui/index.ts` (export), `src/components/health/HealthStats.tsx`
(new; `HealthStat`, `HealthStatRow`), `src/components/today/healthModuleMath.ts` + `healthModuleMath.test.ts` (new).
Spec: health-module.md §5 (every prop), §6 (state table drives the math), §7 (tones). Geometry via `ringGeometry` /
`clamp01` from `src/ui/controls.ts`; outer r = size/2 − stroke/2, inner r = outer − stroke − 4; both arcs start at 12
o'clock (`rotate -90`), `strokeLinecap="round"`, track `colors.border`; `accessibilityRole="image"`.
Tests (`.claude/rules/tests.md`, pure only): `ringFractions` for all present (0.4625 / 0.619, over false), over budget
(over true, eaten clamped 1), no targets (both None); `heroNumber` returns `{label:"Left today", value:"1,650", tone:
"neutral", caption:"of 3,070 kcal budget"}`, `{label:"Over today", value:"−220", tone:"danger"}`, `{label:"Burned
today"…}` without targets; `isStale` true for a `burnedAsOf` dated yesterday local, false for today; `metaLine` for the
four row-3 strings in §6 (steps/bpm via `formatInt`).
Done: `pnpm check` green; report ends with `## Exports` (exact symbol names + prop types) — HM-2/HM-3's GO payload.

## HM-2 · Today module, strips deleted · engineer/sonnet · Time box 20 min · after HM-1's Exports
Files: `src/components/today/HealthModule.tsx` (new), delete `src/components/today/HealthStrip.tsx` and
`NutritionStrip.tsx`, `apps/mobile/app/(tabs)/today.tsx` (wiring: one `<HealthModule style=…/>` where the two strips
and `useHealthLine` gap logic were, Empty and Ready states), `src/components/health/nutritionText.ts` + `.test.ts`
(delete `stripLines` and its tests if nothing else imports it — grep first; `asOfText`/`kcalText` stay),
`apps/mobile/CLAUDE.md` Layout line for Today.
Spec: health-module.md §3 (rows, widths 326/464, heights), §6 visibility (hidden only when targets None, burned None
and entries = 0; Loading/Failed of either hook → null), §7. Data: `useNutritionDay` + `useDailyHealth`
(`localDateOf(new Date())`), `insights` first item for row 4. Whole card pressable → `/health`.
Done: no file matches `grep -rn "HealthStrip\|NutritionStrip\|useHealthLine" apps/mobile`; ui-check `/today` at 390
and 1280, light + dark, states all-present and no-profile (store seed per nutrition.md §8): card
`getBoundingClientRect` 358 × 234 ± 2 at 390, 496 wide in the right column at 1280; `ab errors` empty; shots
`UI-HM-today-{state}-{w}-{theme}.png`; `pnpm check` green.

## HM-3 · /health hero + week bars tone · engineer/sonnet · Time box 20 min · after HM-1's Exports (∥ HM-2)
Files: `src/components/health/HealthHero.tsx` (rewrite), `src/components/health/DayBars.tsx` + `dayBarMath.ts` +
`dayBarMath.test.ts` (over-budget bar tone), `apps/mobile/app/health/index.tsx` only if the hero's props change.
Spec: health-module.md §4 (390 column layout, 1280 row layout with 240 ring and 424 text block), §6 (hero reuses
`heroNumber`/`ringFractions` from HM-1), §7. `DayBars`: a day with `eaten.kcal > budgetKcal` (both Some) renders
`colors.danger`, else `accent`; test the tone function with over / under / no-budget days (name the assertions in
`dayBarMath.test.ts` that change, if any — grep `toEqual` first).
Done: ui-check `/health` at 390 and 1280, light + dark, Ready (all present) and over-budget seeds; one `h1`;
hero height 364 ± 2 at 390 (ring 176 top to stat row bottom); `ab errors` empty; shots
`UI-HM-health-{state}-{w}-{theme}.png`; `pnpm check` green.

## HM-4 · Integration proof + gallery · qa/sonnet · Time box 15 min · after HM-2 and HM-3
Files: `docs/design/screens/HM-rows.html` (append a `UI-HM` section in the same format), `docs/design/reviews/UI-HM-r1.md`.
Run the §8 matrix end to end on one dev server (390 × 844, 1280 × 900, light/dark; states all present, Garmin off,
no profile, nothing logged, over budget, stale burnedAsOf via a seeded `updatedAt` of yesterday); check row 3/4 never
wrap (`scrollWidth === clientWidth` on the card); confirm `grep -rn "legacy\|old\|remove later" apps/mobile/src/components/today
apps/mobile/src/components/health` is empty; `node docs/design/gallery.mjs docs/design/screens/HM-rows.html` exits 0.
Done: review file lists each state × width × theme with PASS/FAIL and the measured card sizes; Lead publishes the rows.
