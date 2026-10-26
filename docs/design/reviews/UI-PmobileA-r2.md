# UI-PmobileA round 2 — designer review (fable, 2026-10-26)

Spec: `docs/design/ui-polish.md` §3 Today/Player/Plan/Programs, §4 rubric. Inputs: `UI-PmobileA-r2-*-390-{light,dark}.png`, measure JSON (390). Verdict: **PASS** — all screens ≥ 4.

## Today — 4, accepted (unchanged from r1)
Blocks 92/92, Log set 64 at 433, selected row + tabular trailing ✓. Pills still 6-px dots (SetDots `variant="pill"` is in round 3). Nothing else to change.

## Player — 4, accepted
Pause 64×64 at 652 with a visible `surface` disc in light (246,246,247) and dark (24,27,31) ✓ (r1 defect fixed); prev/next 48 at 660, gap 32 ✓; ring 220 at 318–538 ✓; Next caption ✓; Finish 56 at 772 ✓; rest variant: pause 620, Skip rest 708 ✓. Clock is `numeral` 72/76 inside the 220 ring (spec `clock` 64/68, stroke 12 → 10): round 3 as planned. Nothing else.

## Plan — 4, accepted
- PL1 rest rows 52 one line ✓. PL2 items full width, 0 of 20 names truncated ✓ (r1 defect fixed), trailing tabular ✓.
- PL3 stat row 358 × 66 at 186, slots 109 (spec 108 ✓): `caption` labels over `headline` values, tabular ✓.
- Session day header: two-line date block ("Mon" `headline` / "19 Oct" `caption`) beside the title. Rows now ≈ 178 (r1 168). Verdict: **make it one line** — "Mon 19" `headline` (accent on today) in the 72 date column + title `headline` + status trailing, items 8 below spanning the width. Every row's first line then has the shape of the rest rows ("Tue 20 · Rest"); saves 22 px per session row (178 → 156, 4 rows → 88 px); the second `headline` ("Mon" vs "Upper A") stops competing. Optional for acceptance, worth doing in round 3.
- Gap stat row → card: card top 262 − stat row bottom (186 + 66 = 252) = 10; D5 says group → next group 24 (`space.xl`). VERIFY on the box model and set to 24 if the 66 is the full row box.

## Programs — not-enrolled 4, enrolled 4, accepted
- Not enrolled: card ends ≈ 400, "What's inside" label + 7 rows × 52 (Day 7 · Recovery · 6 min ✓), content ends ≈ 828 → the void is gone ✓.
- Enrolled: unchanged from r1 (Start 56 at 157, rows 52, "0 of 30 done" accent ✓). Ring 44 empty → round 3 `ProgressRing` children (day number `headline`, stroke 3).

## Round 3 changes, priority order (all mobile-A files; src/ui tokens have landed)
1. Today 2: `SetDots variant="pill"` in `ExercisePage` header (10×6 r3 gap 4, current 16×6 accent). Keep the AppBar 6-px exercise dots as they are (different meaning).
2. Programs 1: `ProgressRing` 44 with the day number `headline` inside, stroke 3, in `DayCard`.
3. Player 4: `Text variant="clock"` (64/68 tabular) for the countdown; ring stroke 12 → 10.
4. Plan: session day header one line (date `headline` in the 72 column, title `headline`, status trailing; items 8 below) → row 156; stat row → card gap 24 (`space.xl`) if measured 10.
5. Nothing on Today's blocks, Player layout or Programs lists — do not touch.
