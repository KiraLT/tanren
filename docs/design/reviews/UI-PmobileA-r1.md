# UI-PmobileA round 1 — designer review (fable, 2026-10-26)

Spec: `docs/design/ui-polish.md` §3 Today/Player/Plan/Programs, §4 rubric. Inputs: `UI-PmobileA-r1-*-390-{light,dark}.png`, measure JSON (390). Note: the pasted `plan-390.json` is a copy of the Today JSON (Decrease Weight… buttons); Plan numbers below are ruler-measured on the PNG.

## Today — score 4, accepted (variants `today` and `today-setup`)
- T1 setup row: measured 60 at top 72 (spec 56, header at ≈136 ✓). 60 is ListRow's natural two-line height (headline 22 + subhead 20 + 2·8 + 2); accept 60, spec arithmetic was off. No change.
- T3: blocks 92/92 ✓ (spec 92), hairline gone, 24 gap ✓, Log set 64 ✓. "Weight · kg" caption still under the numeral (spec: "kg" `caption` muted right of the numeral).
- T4: current row `rowBackground(selected)` ✓ light and dark, trailing tabular ✓.
- T2: pills still 6-px dots (both AppBar and header show the same dots; keep one row later).
- Fills the viewport, 107.5 dominant, light/dark consistent. Next: → desktop: `SetDots` pills 10×6 r3 gap 4, current 16×6 accent (T2); → desktop: `Stepper` unit caption slot (`caption` muted on the numeral baseline, "kg") (T3).

## Player — score 3 (borderline 2: theme inconsistency), not accepted
- P1 space-between ✓: ring 318–538 = 220 ✓, pause top 652, Next caption, Finish 772–828 (16 above edge ✓). Rest variant: ring same 318–538 ✓, Skip rest 708, pause 620 ✓.
- P2: pause 64 ✓, prev/next 48 ✓, gap 32 ✓ (centres 107/195/283). **Light: the pause disc is invisible** — `backgroundColor: colors.surfaceRaised` on the page background; dark shows it. Fix in mobile-A files: `variant="filled"` on the pause `IconButton` and drop the explicit `backgroundColor` (`filled` draws a `colors.surface` disc, the same fill the Finish `secondary` button uses, visible in both themes). Spec correction: §3 Player 2 "surfaceRaised" → `surface`.
- P3: "Next · Crunch 25 s" caption ✓ 20 high.
- P4 clock 56 in ring 220 stroke 12 (spec 64/68, stroke 10) → desktop: `type.clock = { fontSize 64, lineHeight 68, display, tabular }`; ring stroke 12 → 10 in mobile-A after the token lands.
- Next: (1) pause disc fix above; (2) P4; (3) nothing else — layout is right.

## Plan — score 2, not accepted (finding applied, new defect visible)
- PL1 rest rows 52 ✓ one line "Tue 20 · Rest" ✓. PL2 items one line, tabular trailing ✓; today row 168 (spec ~150 for 4 items; fixture has 5 → 5·24 + 22 + 26 = 168, accept).
- Defect: 6 of 20 item names truncate ("Romanian …", "Bulgarian Sp…", "Standing C…", "Dumbbell …", "Incline Dum…", "Conventional…"). Name slot = 358 − 32 − 72 (`DATE_COLUMN.phone`) − 12 − trailing ≈ 118 → ≈ 112 px. The owner reads plans by name; an ellipsis hides the exercise.
- Fix (mobile-A, `PlanDayRow.tsx`): item rows span the card's inner width *under* the date column (date column beside the title row only): name slot 326 − 8 − 140 (widest trailing "4 × 12–15 · 107.5 kg" at `subhead` tabular) = 178 ≥ "Bulgarian Split Squat" ≈ 150 ✓; keep `numberOfLines={1}` as a guard. Row height unchanged (168 / 5 items).
- PL3 week stat row (Sessions · Sets · Volume, 3 × 108) stays round 2. Header rhythm 16 / 24 ✓.

## Programs — enrolled score 4, accepted; not-enrolled score 3
- Enrolled: Start 56 at 157 ✓, 7 rows 52 ✓, "0 of 30 done" accent ✓, fills viewport, dark consistent. Ring 44 empty grey (PR1) → desktop: `ProgressRing` children slot (day number `headline`, stroke 3).
- Not enrolled (`programs-390`): card ends y ≈ 400, void 444/844 = 53 % (> 25 %, rubric 3). Not in §3 [M]; add in round 2 (ProgramHome.tsx, mobile-A): label "What's inside" (28) + grouped list of the first 7 days (name + minutes, 7 × 52 = 364) under the card → content ends ≈ 816 ✓; the §3 Programs 3 stat row (30 days · 15 min · 7 exercises, 3 × 108) is optional at 390.

## Round 2 priority (not-done items, judged on what is visible)
1. Player pause disc (mobile-A, no dependency) and Plan name truncation (mobile-A) — both regressions of this round.
2. Programs not-enrolled "What's inside" list (mobile-A, no dependency) — the only 390 screen with a trailing void.
3. Plan 3 week stat row (mobile-A, `weekSummary` in `planFormat.ts`).
4. → desktop, worth it: `SetDots` pills (Today 2, the noisiest element on the most-used screen) > `ProgressRing` children (Programs 1, hero of its screen) > `type.clock` (Player 4, 56 in a 220 ring reads fine; lowest). Skip: `Stepper` "kg" caption (Today 3) — "Weight · kg" under the numeral is acceptable; not worth a src/ui change this round. IconButton 48/64 sizes already achieved via `style` width/height; no primitive change needed.

Pair verdict: NOT PASS (Player 3, Plan 2). Round 2 fixes are all inside mobile-A's files.
