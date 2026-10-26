# UI-Pdesktop round 3 (screens) — designer review, 2026-10-26 22:3x (r5 renders)

**Verdict: another round.** Frame consistency holds (14/14 routes: frame 32/1216, AppBar 32/1216@61, nav at x 372; 1440 frame 40/1360; sign-in has no AppBar — other team, unauthenticated, accepted). Today reaches 4 at all three widths; Programs, Plan and Player stay at 3.

## Consistency (measured on the r5 PNGs + UI-Pdesk-r5-summary.txt)
Same frame on every route: gutters 32, AppBar 61 with the rule at y 60, tab titles at x 64, back/close titles at x 121 (Progress, Settings, Activity, Player all 121 ✓), first content element y 69–90 (Today pager 69, Programs/Library/Progress/Settings 77, Plan/Activity 80, Feed 90 — within one 24 step). Visible deviations the owner will still read as "different design":
1. **Column divider**: Today/Plan/Library/Progress/Feed/Library-detail draw a vertical hairline between the columns (x 752 or 552); Programs/Settings/Activity/Location/Progress-detail (`Columns` inside `Page`) draw none. Two column languages. → `src/ui/ColumnsView.tsx`: draw the same hairline (`hairline` 1 px, full body height) between any two desktop columns; one file, desktop's own.
2. **Stat rows** come in three styles: bare caption/headline (Today, Programs), a 3-up inside one card (Plan "This week" 305–380), four separate 72-high tiles (Feed, Activity). → one rule: bare only under a control block (Today); tiles (`surfaceRaised`, 72 high) everywhere else. Programs and Plan change (below).
3. Right-column left edge lands at four x positions (552 / 652 / 746 / 752) — D1 by design; not for this round, noted for the owner.
4. Dark: illustrations on a lighter tile (Today header, Programs hero) while light has none; consistent across screens, owner item from r1, unchanged.

## Scores (finish, §4 rubric)
| Screen | Score | Measured | Fails |
|---|---|---|---|
| Today 1280 L/D | **4** | illustration 128–304 = 176 ✓, numeral 96 ✓, control block 100–660 = 560 ✓, Log set 64, StatRow 692/713, main ends 725 (90 %), aside 730 | not 5: pager "1 of 5" (69–113) duplicates the AppBar "Exercise 1 of 5"; "Sets / Back Squat" still two rows 407/435 (finding 6 wants one 28-px label row) |
| Today 900 | **4** | main 404, block 340 < 440 → numeral 72, main ends 675 (91 %) | AppBar right slot starts 735, nav ends 723: 12 px, tight but no overlap |
| Today 1440 | **4** | block 150–710 = 560 centred in 780 ✓, main ends 725 of 900 (79 %), aside 730 | — |
| Programs 1280 L/D | **3** | card 77–462, list 113–488, bare stat row 524–556 → fill 70 %, void 244 px = 30 % > 25 % | tops ragged (card 77 vs label 86/card 113), bottoms ragged (462 vs 556), stat row weakest element on the page |
| Plan 1280 L/D | **3** | main card ends 616 (77 %); aside card 77–262, stat card 305–380 → aside 48 %, void 420 px | spec Plan 4 asked 3 stacked 72 tiles; a 75-high 3-up landed instead. Rest rows measure 63 (mobile-A [M]1 says 52) — mobile-A's, flag only |
| Player 1280 (empty) | **3** | header full width ✓ (r1 flag 2 fixed); CTA 207–255 = 48 high, secondary tone | spec: `Button xl` 56; the only action on the page is grey; enrolled state (ring 280, clock) **not rendered — VERIFY** before any PASS |

## Next changes (≤ 3 per screen; px + token + file)
- **Programs** (`src/player/components/ProgramHome.tsx`, mobile-A file, free): (1) stat row → three 72-high `surfaceRaised` tiles ((532 − 32)/3 = 166 each) under the list, gap 16 → right column ends ≈ 580; (2) day rows 52 → 64 with a `subhead` routine line ("Front · 7 exercises", from the day's items) → list 113–561, tiles 577–649 (81 %); (3) `caption` eyebrow "Program" above the EnrolCard at y 86 so both cards start at 113, and move the bare stat row out (it is item 1).
- **Plan** (`app/(tabs)/plan.tsx` / `PlanWeek` / `PlannedSessionCard`, mobile-A, free): (1) "This week" → 3 stacked 72 tiles, gap 16 (305 → 553); (2) add "Up next" group under it: the next upcoming session (Fri Upper B) as a compact card, items one line each (`subhead` + tabular trailing), ≈ 150 high → aside ends ≈ 730; (3) today's row items one line (mobile-A [M]2) if not yet in — check at 390 first.
- **Player** (`src/player/components/PlayerView.tsx`, mobile-A, free): (1) empty-state CTA `Button xl` primary, hit 56, width 280 (= ring); (2) Core 30 illustration 176 above "No workout today" (state ends ≈ 430); (3) render the enrolled state (tap Start Core 30, then /programs/play at 1280 L+D and 900) and paste ring/clock px — unverified ring 280, `type.clock` 64/68 or `numeralLg` 96 per spec Player 5.
- **Frame**: `ColumnsView.tsx` hairline (consistency item 1) — first item of the round, one file.

Round-4 PASS needs: hairline on every two-column route, Programs/Plan/Player ≥ 4 at 1280 L+D, player enrolled render attached, 390 JSON unchanged.
