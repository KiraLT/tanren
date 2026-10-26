# UI-Pdesktop round 1 (foundation) — designer review, 2026-10-26

**Verdict: another round.** D1 lands exactly (1280: margin 32, page 1216, 696/496 and 496/696; 1440: page 1360, margin 40, 780/556; 900: page 836, 364/448 clamped, `columnsFor` comment documents the 472 → 448 clamp, so ui-polish D1's "472" is the unclamped figure, not a bug). No page overflow (`sw == innerWidth` everywhere; `ovf` 1–2 = chip rows / pager, horizontal inside their own scroll). Dark theme consistent with light on all four shots checked (today, library, progress-detail, settings). Rubric (b) not verifiable: no 390 JSON was pasted — **VERIFY** before accepting. Round 1 could only move columns, so scores below are the screens' *current* finish; the ≥ 4 bar is for round 2–3.

| Screen @1280 | Score | Fill of first 800 (fullest col) | What still fails |
|---|---|---|---|
| Today | 3 | aside 91 % (main 74 %, ends y 590) | 72 numeral, "Rest" caption, 26 % void under main |
| Plan | 3 | main 77 % (aside 33 %, ends 262) | aside = one card then void |
| Programs | 2 | 45 % (card ends 358) | 600 column; header + rule also 600 wide |
| Library | 3 | list 100 % (pane 0 %: 648 × 720 placeholder) | empty pane; chip rows hard-clipped at x 496 |
| Progress | 3 | side 100 % | map 176 alone with 500 px beside it |
| Settings | 3 | 75 % (both cols end 600) | label→group 12 / group→label 32; spec §3 Settings 3 accepts this screen once D5 lands |
| Library detail | 2 | main 41 % + button fixed at 730; side 35 % | 400 px void between chip and fixed Add; hero/map split 240 px apart |
| Progress detail | 3 | 100 % | map 144 orphaned in 470 col; 104 header illustration |
| Location | 3 | side 100 % (main 40 %, ends 322) | left form column stops at 322 |
| Player | 2 | 27 % (empty state) | 600 column, 600-wide header; no CTA |

900: Today 3, Library **2**, Progress **2** (364 list column → thumb rows wrap title+subtitle to 2+2 lines, rows 100 high), Programs 2. 1440: Today 3 (stepper row 650 px between − and +; numeral floats), Library 3.

## Regressions / flags
1. **900 thumb lists wrap** (Library, Progress): inner 300 = 56 thumb + 12 + 232 text; 17-px titles need ≈ 270. Not a round-1 break (clamp did its job) but it is the first thing the owner will see at tablet-desktop. Fix in `columns.ts`: below 1024 page width, any split resolves to 6/6 (900 → 404/408, text 276).
2. **Narrow `Page` narrows the header**: Programs/Player nav + rule span 600 while every other screen spans the page. Fix in `Page.tsx`: header always `columns.page` at desktop; only the body is capped at `contentMaxWidth`.
3. Chip rows clip at the column edge without fade (Library 1280/900/1440). Desktop branch in `CatalogFilterBar`: `flexWrap: "wrap"` when breakpoint is desktop (column ≥ 364 holds 2–3 rows).
4. Dark: illustrations sit on a lighter tile (owner asked for no bg). Consistent everywhere, so not a regression; log for the owner.

## Round-2 worklist (desktop). First: flags 1 + 2 (both `src/ui`, free now), then in this order.
- **Today** → desktop branch in `ExercisePage` (mobile-A file): numeral `type.numeralLg` 96/100 + Stepper `xxl` (block 92 → 128 each); 3-up `StatRow` *Rest 3:00 · Done 0/5 · Volume 0 kg* replaces the caption; header illustration `illustrationLg` 176. Also cap the control block at `maxWidth 560` centred (1440 shot) — token `sizes.controlMaxWidth: 560` in `tokens.ts` (desktop) → mobile-A adopts.
- **Programs** → `ProgramHome` (mobile-A): `Page wide` + `Columns 6/6`; left EnrolCard with illustration 176 + `display` title; right 7-day "What's inside" list + StatRow *30 days · 15 min · 7 exercises* (slots 166).
- **Player** → `PlayerView` (mobile-A): empty state gets `Button xl` "Open Programs" (hit 56) under the copy; enrolled state ring 280 + `type.clock` 64/68 (spec Player 5). Header full width via flag 2.
- **Library** → `app/(tabs)/library.tsx` + `CatalogDetail` (mobile-B): preselect first row; inline hero 176 + 16 + 176 + 16 + meta 248 = 632 ✓; filter bar sticky (D2 VERIFY).
- **Library detail** → `app/library/[catalogId].tsx` (mobile-B): Add button in flow 24 below the chip (`Button xl`, width 696); side hero `illustrationXl` 240 + 16 + map 176 = 432 ✓ (no gap between them).
- **Plan** → `PlanWeek`/`PlannedSessionCard` (mobile-A): aside = selected-day card + 3 stacked 72-px stat tiles (tabular), sticky.
- **Progress** → `components/progress/ExerciseDetail` (mobile-B): `layout="split"` when side inner ≥ 584 (632 ✓); 900 stays stacked. **Progress detail**: illustration 176; map 176 + a 2-tile StatRow (e1RM, sessions) beside it in the 470 column (176 + 16 + 278).
- **Location** → `app/settings/location/[id].tsx` (mobile-B): `Columns 4/8` at desktop (389/803 at 1216, both ≥ 364) so the form column stops looking abandoned; else leave.
- **Settings**: no change (spec); D5 is mobile-B's. Re-score after D5.

Every item above except flags 1–2 and the `controlMaxWidth` token lives in a mobile pair's file: desktop may only start it after that pair's round is logged accepted (ui-polish §4 ordering rule). Round-2 PASS needs ≥ 4 on all 10 at 1280 plus Library/Progress at 900.
