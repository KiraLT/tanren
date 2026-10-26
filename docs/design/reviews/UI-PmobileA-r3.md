# UI-PmobileA round 3 (final) — designer review (fable, 2026-10-26)

Spec: `docs/design/ui-polish.md` §3 Today/Player/Plan/Programs, §4 rubric. Inputs: `UI-PmobileA-r3-*-390-{light,dark}.png` (20 files), measure JSON (390, plan JSON now the plan's own). Verdict: **PASS** — all screens ≥ 4; pair stops per §4 stop rule. No light/dark hazard found: the setup row (`surface` group) and the pause disc are visible in both schemes; the dark `surfaceRaised` illustration tile has no light counterpart by design (light surfaceRaised = page bg).

## Today — 4, accepted (`today` and `today-setup`)
- T2 pills ✓: 10×6 r3 gap 4, current 16×6 accent under "Set 1 of 5"; AppBar exercise dots stay 6-px (different meaning, fine).
- T1 setup row: `surface` group, 358×60 at 72 (spec 56; ListRow two-line natural height, accepted in r1), header at 136 ✓, visible in light and dark ✓.
- T3/T4 unchanged from r1: blocks 92/92, Log set 64 at 433 (509 with setup), selected row + tabular trailing ✓.
- UI-P-left: "Weight · kg" caption still under the numeral; spec T3 wants "kg" `caption` muted on the baseline right of the numeral (needs a `Stepper` unit slot; low value, −0 px layout).

## Player — 5, accepted
Clock `clock` 64/68 ✓ (JSON 64px/68px/800 ×1), ring 220 at 318–538 stroke 10 ✓ (`RING_STROKE` local), empty header ring dropped ✓, pause 64 at 652 on a `surface` disc both schemes ✓, prev/next 48 at 660 gap 32 ✓, Next caption ✓, Finish 56 at 772 ✓; rest: pause 620, Skip rest 708 ✓. Nothing I would change at 390.

## Plan — 4, accepted
- Session header one line ✓ ("Mon 19" `headline`, today accent, title `headline`, status trailing); items 8 below, full width, 0/20 truncated ✓; rest rows 52 ✓.
- Stat row 358×66 at 186, slots 109 ✓; stat row → card gap 24 ✓ (r2's 10 fixed).
- UI-P-left: session day rows 172 vs 156 expected (title 22 + 8 + 5·24 + 2·11 padding = 172): the 16 is card vertical padding 11 vs 8 — cosmetic, keep.

## Programs — not-enrolled 4, enrolled 5, accepted
- Enrolled: ring 44 shows "1" (17/22/600) stroke 3 ✓, Start 56 at 157 ✓, 7 rows 52 ✓, "0 of 30 done" accent ✓.
- Not enrolled: card ends ≈ 400, label gap 24 ✓, "What's inside" 7 × 52 ends ≈ 836 ✓ (void gone).
- UI-P-left (not-enrolled): hero illustration 56 beside the title; a 104 `illustrationMd` hero would carry the card better (104 + 12 + 226 = 342 ≤ 326 inner? no — 104 + 12 + 210 = 326 ✓ with the title wrapping). Optional; desktop's Programs 3 [D] covers the 176 version.

## UI-P-left (for `docs/tasks/v3-design.md`)
1. Today 3: "kg" unit caption right of the numeral (Stepper unit slot; `src/ui`).
2. Plan 2: session row 172 (expected 156): card inner vertical padding 11 → 8 if `Card`/`ListGroup` exposes it.
3. Programs (not enrolled, 390): hero illustration 56 → 104 `illustrationMd`, optional.
4. Page scroll section gap 16 where D5 wants 24 (desktop to add a `gap` prop to `Page`; §3 amendment below).
