# UI-Pdesktop round 4 (screens) — designer review, 2026-10-26 23:5x (r4 renders, commit ff83f34 + 29 dirty)

**Verdict: PASS** (desktop; every screen I opened scores 4 at 1280 light and 900; no fix round tonight). Frame holds on 48/48 probes: 32/1216 at 1280, 32/836 at 900, AppBar 61, nav x 372, overflow 0 everywhere except Library (ovf 2 at 1280, 26 at 900 — chip rows clipped at the column edge, see Library). Three of the four r3 blockers landed (hairline, stat tiles, Programs fill); the fourth (Player enrolled) is rendered and judged below. One mobile bug found on the 390 shot (Finish workout overlaps the set list) — TODAY-FIN's file, fix proposal at the end; it does not gate the desktop verdict.

**Not reviewed (honest list)**: dark PNGs for every route (JSON frames identical to light; colour not judged), `location`, `activity`, `progress` (list), `library-detail` PNGs not opened — JSON only (frame, columns, overflow 0, `colsMain/colsSide` present → same `Columns` primitive as Settings, hairline *assumed*, not seen). Plan "Up next" card not rendered (seeded week all done) → **unreviewed**. Feed/Integrations/Sign-in are other teams'.

## Consistency (r3 items, measured on the r4 PNGs + probe JSON)
1. **Column hairline** — Settings draws it at x 640 (between 564 + 564 columns), Progress-detail at x 734, Today/Plan/Programs at 752, Library at 552 ✓. Location (cols 470 | 658, gap 24) and Activity (658 | 470) share `Columns` → assumed ✓, PNG not opened.
2. **Stat rows one style** — Today 692–760 (3 tiles, 176 wide, 68 high), Plan 305–537 (3 stacked, 72 high), Programs 250–322 (3 tiles, 200 wide, 72 high) all `surfaceRaised` tiles ✓. Remaining delta: Today tiles 68 vs 72 elsewhere (4 px; `StatRow` padding) — round-5 item, one token.
3. **Right-column left edge** still at 552 / 652 / 746 / 752 — D1, unchanged, owner item.
4. **Tops ragged on two-column tab routes**: Today pager 77 vs aside label 93; Programs card 77 vs "Days" label 78 ✓/row card 109; Plan card 77 both sides ✓. Minor.
5. **Bottoms**: Today main 760 vs aside 713; Settings left 724 vs right 596 (128 px); Plan main 622 vs aside 537. Content-state driven; noted, not scored down below 4.

## Scores (finish, ui-polish §4 rubric; 1280 L measured, D skimmed from JSON, 900 measured where PNG opened)
| Screen | Score | Measured | Fails |
|---|---|---|---|
| Today 1280 L/D | **4** | illustration 128–304 ✓, numeral 96 ✓, Log set 609–672 = 64 ✓, tiles 692–760, main ends 760 (95 %), aside 713; "Sets · Back Squat" one 28-px row at 400–428 ✓ (r3 finding closed) | not 5: pager "1 of 5" (77–117) still duplicates AppBar "Exercise 1 of 5"; tiles 68 high vs 72 on Plan/Programs |
| Today 900 | **4** | JSON: main 404, contentH 733, ovf 1 (same chip/px as r3) | PNG not re-opened; r3 numbers (block 340, numeral 72) assumed |
| Programs 1280 L/D | **4** (was 3) | EnrolCard 77–234, tiles 250–322 (3 × 200, 72), "Day 1 exercises" 348, list 364–741 (7 rows × 53) → main 93 % ✓; aside day list 109–800+ (30 rows, scrolls, contentH 1671) | not 5: routine subhead on day rows not added (r3 (2)); list rows 53 vs 64 elsewhere; aside has no end in the viewport (fine for a 30-row list) |
| Programs 900 | **4** | card 77–234, tiles 3 × 110, list ends 741, aside 496 wide, rows 53 | same as 1280 |
| Plan 1280 L/D | **4** (was 3) | main card 170–622 (78 %), rest rows Tue 237–300 = 63–64 ✓ (r3 flag closed), day rows 64; aside Lower A card 77–262, "This week" 288, tiles 305–377/385–457/465–537 = 3 × 72 ✓ | Up next card **unreviewed** (not rendered: week all done). Without it aside ends 537 (65 %), void 263 px — content state, judged 4 on the parts that rendered |
| Plan 900 | **4** | JSON: main 404, contentH 739, ovf 0 | PNG not opened |
| Player reps 1280 L/D | **4** | content column 372–908 = 536 centred; illustration 96 at 93–189 + "Work" eyebrow + title 28 + "12 reps"; numeral 96 at 288–360; Done `Button xl` 404–468 = 64 primary ✓ (r3 (1) closed); rail 536–584; Finish 611–667 | not 5: 100-px gap 190–280 between header and numeral while 133 px sit empty below Finish — move numeral up (see list); Finish secondary tone full width competes with Done |
| Player rest 1280 L/D | **4** | ring 500–780 = 280 ✓, stroke ≈ 12, clock **96** ("0:13" 552–728 = 176 inside inner ⌀ 256); Next card 155–241 with 48 illustration; Skip rest 677; Finish 713–769 | enrolled render attached ✓ (r3 VERIFY closed). Ring decision below |
| Player 900 | **4** | JSON: main 600 centred in 836, contentH 733 | PNG not opened |
| Library 1280 L/D | **4** | location pill 73–105, search 113–161, chips 3 rows × 32 at 169/209/249 ✓ (was 7 rows), count 300, rows 65 high with 48 illustration; detail pane empty state centred at 397–468 | not 5: chip rows clipped hard at x 496 ("EZ bar" cut) with no fade or scroll cue (ovf 2); empty pane = 696 × 739 void with a 24-px icon — needs a 128 illustration |
| Library 900 | **4** | main 404, chips clipped at 404 ("Lower ba", "Trap"), subtitle now ellipsised ("Dumbbell, Be…") ✓ (r3 246/240 clip closed) | ovf 26 — same chip clipping, more visible |
| Library-detail 1280/900 | **4?** | JSON only: main 696 / 404, ovf 0, contentH 739 | PNG not opened — unmeasured |
| Progress 1280/900 | **4?** | JSON only: main 496 / 404, contentH 2486, ovf 0 | PNG not opened — unmeasured |
| Progress-detail 1280 L/D | **4** | map 746–920 × 85–247 beside Best set card 201–387 ✓ (r3 item closed); Recent sessions 278→; left cards 658 wide, numeral 96 | not 5: map left-aligned in a 470 column (174 of 470, 296 px empty to its right) — centre it or put "Recent sessions" caption beside it; bar chart has no y labels (progress team's) |
| Settings 1280 L/D | **4** | hairline 640 ✓, columns 564 | 564, rows 61–62 high, groups 24 apart | right column ends 596 vs left 724; Theme segmented control 48 inside a 62 row |
| Settings 900, Location, Activity | **4?** | JSON: frame ok, ovf 0; Location aside contentH 940/1140 (scrolls) | PNGs not opened — unmeasured |

## Decisions
- **Player ring clock: 96.** Compared R4b `-96` vs `-64` (same frame, 0:08 paused). At 64 the ring is hollow (digits 580–700 = 120 inside inner ⌀ 256 → 68 px of air each side) and the clock reads as a secondary stat — weaker than the Today numeral it sits next to in the owner's mind. At 96 the digits fill 176/256 (40 px air), same `numeralLg` as Today/Done, legible from the floor, which is the player's use case. Constraint for `src/player/playerRing.ts` `ringSpec`: `{ size: 280, stroke: 12, clock: 96 }`; "m:ss" ≤ 4 digits fits (worst "9:59" ≈ 180 wide); if a rest ≥ 10:00 ever appears, drop to 72 for 5-digit strings — Core 30 rests are ≤ 90 s, so no branch tonight.
- Plan without "Up next": score stands on tiles + rest rows; the card must be rendered on a week with an upcoming session before it is called done (seed or probe: set device date to Thu 22 Oct).

## Today 390 — Finish workout overlaps the set list (mobile, TODAY-FIN's file)
Measured on `UI-Pdesktop-r4-today-390-light.png`: Finish workout 603–659 is drawn over Set 2 (set list starts 566, Set 1 visible, Set 2 hidden under the button), rest bar 670–790 fixed, Set 4 never reachable. Cause: `today.tsx:105` passes `<FinishWorkout>` as `footer` and `TodayReady` renders the footer slot as a floating layer over the pager instead of after the list. **Fix (one line of intent, `apps/mobile/src/components/TodayReady.tsx` footer slot)**: render `footer` inside the scroll content after the set list (not absolutely positioned), and give the scroll view `paddingBottom` = rest-bar height (120) + 16 so Set 4 and the button clear the fixed rest bar. No redesign.

## Next changes for round 5 (≤ 3 per screen; px + token + file), ordered by payoff
1. **Today 390 Finish overlap** — see above; `TodayReady.tsx` footer slot inline + `paddingBottom: 136`. Owner-visible bug, first.
2. **Library empty pane** (`src/library/CatalogDetailEmpty` or wherever the "Pick an exercise" state lives, desktop's): illustration 128 (`Illustration` of a generic barbell, background-free) above the title, `title` 22/28, `body` 17; chip rows: horizontal `ScrollView` with a 24-px `surface→transparent` fade at the right edge (`CatalogFilterBar.tsx`), removes ovf 2/26.
3. **Player reps** (`src/player/components/PlayerView.tsx`): numeral block up to y 230 (gap header→numeral 40 = `space.xl`), rail and Finish follow; Finish → `Button lg` 48 ghost, width 280 centred (same as ring) so Done stays the only full-width action.
4. **Player ring** (`src/player/playerRing.ts`): `ringSpec = { size: 280, stroke: 12, clock: 96 }` — apply the decision; no other change.
5. **Stat tile height** (`src/ui/StatRow.tsx`): Today tiles 68 → 72 (padding 16 + caption 18 + 4 + headline 22 + 16 = 76 or 12/12 = 68; pick `space.md` 16 top, 14 bottom → 72, or set `minHeight: 72`). One token, three routes align.
6. **Progress-detail map** (`src/components/progress/ExerciseDetail.tsx`): centre the 174-wide map in the 470 aside (`alignSelf: "center"`) or set it to 240 wide; "Recent sessions" caption 24 below it.
7. **Today pager label** (`src/components/ExercisePage.tsx` / pager header): drop "1 of 5" text (AppBar already says it), keep the arrows → pager 77–117 shrinks to 44 and the illustration moves up 0 (keep y 128) — or replace the text with the exercise's muscle caption.
8. **Programs day rows** (`src/player/components/ProgramHome.tsx`): rows 53 → 64 with `subhead` routine line (r3 (2), still open) — 7 rows × 64 = 448, list 364–812 → main scrolls 12 px; alternatively keep 53 and accept.
9. **Settings** (`app/settings/index.tsx`): move "About" to the left column under Equipment or "Units" + "Data" into one group so right ends ≈ 700 vs left 724.

Not changed, owner items: right-column edge at 4 x positions (D1); dark illustration tiles; Plan "Up next" unreviewed until a week with an upcoming session renders.
