# UI-PmobileB round 2 — designer review (fable, 2026-10-26)

Spec: `docs/design/ui-polish.md` §3 Library / Library detail / Progress / Progress detail / Settings / Location, §4 rubric. Inputs: `UI-PmobileB-r2-*-390-{light,dark}.png` (22, all opened in both schemes), measure JSON (8 screens, 390). Pixel runs (pngjs) on the PNGs where the JSON has no entry. Dark tiles behind illustrations are the ratified `UI-P-left` item (IMG-7) and are not scored.

## Claims checked (engineer → measured)
1. Chip pitch 40: Filter sheet dark chips at x = 40 → 243 / 283 / 323 / 363 … (32 + 8) ✓ (the engineer's 277/317/357 is the same pitch from another origin); Location 303 / 343 / 383 and 505 / 545 / 585 ✓, light identical (+2 px page offset).
2. Tooltip pill: first bar x 32–168 = **137** ✓, last bar 231–357 = **127** ✓; both schemes; no ellipsis in any of the four PNGs ("0 kg · wk of 7 Sep", "0 kg · This week" complete). Pill 26 high + border; clamped inside the card ✓.
3. Estimated 1RM: header "Estimated 1RM" + trailing "105 kg" on one row ✓; blank above gone (header cap 649–660, first line pixel 681 → ≈ 12 after the 22 line box ✓); markers y 700–746 inside the 72 SVG; "28 Sep" / "19 Oct" captions under the end markers ✓. Card 632–781 = 150 (was ≈ 196).
4. Tabular: Recent-session rows "Set n" caption + "75 kg × 8" headline in the leading slot, digits align down the column ✓; Best-set tile unchanged ✓.
5. Library rows: dividers at 268 / 333 / 398 … pitch 65 = 64 + hairline ✓ (122 of 126 JSON rows 64; filtered 51 of 52); the 74-px rows are two-line *titles* ("… Overhead Triceps Extension", "Thoracic Extension on Foam R…"). Subtitle clamp: "Chest, Shoulders · Dumbbell, Ben…" (3 of 9 rows in the first viewport cut mid-word). "At Gym" outlined accent 28 high (174–202), "All" the only filled pill ✓.
6. Settings preset rows "Preset · 36 items" / "Preset · 5 items" / "Preset · Bodyweight only" ✓.
7. Library detail: "Last done 24 Oct · 75 kg × 8" `subhead` muted 657 under the chip (607–628); nohistory variant shows the chip only ✓.

## Library — score 4, accepted
- L1 ✓ (search 48, muscle row 32, count row 28, first row 204), L2 ✓ 64 / inset 84, L3 ✓; filtered state (reshot from the current export, old Progress tab gone) "52 exercises · Clear filters · At Gym" ✓; sheet pitch 40 ✓.
- Next: (1) `catalogFormat.ts` clamp at a separator, not a character: cut at the last `, ` or ` · ` ≤ 33 and append "…" ("Chest, Shoulders · Dumbbell…" not "Dumbbell, Ben…"); test the three first-viewport strings. (2) The two 74-px title rows are acceptable (the first word identifies the exercise); a 1-line title is desktop's call. → desktop: `ListRow` `titleLines?: 1 | 2` and `subtitleLines?: 1` (default unchanged) so the char clamp can go; 33 chars at 15 px is width-fragile (a wide-glyph string re-wraps to 74).

## Library detail — score 4, accepted
- LD1 ✓ "Where it fits": chip + Last-done row when history exists; chip only otherwise. Void chip→button 667→776 = 109 px (13 %) with history, 581→776 = 195 px (23 %) without — both under 25 %. Hero 176 + 144, meta row, steps unchanged ✓.
- Next (tone, optional): give the Last-done row the meta-row grammar — leading clock glyph 16 `textMuted` + label, 16 under the chip — so it reads as a fact, not a stray caption.

## Progress (list) — score 4, carried from r1
- No r2 shot; `app/(tabs)/progress.tsx` is untouched this round (the diff is `ExerciseDetail`/`ChartHover`/`Sparkline`). Stands at r1's 4.

## Progress detail — score 4, accepted
- PD1 ✓ (tiles 158 × 174 / 184 × 174, numeral 56, PR badge). PD2 ✓ 137 / 127 ≤ 180, no truncation. PD3 ✓ 72 sparkline, end dates, trailing 105 kg, no blank. PD4 ✓ tabular 52-px rows (293 / 346 / 399).
- First viewport: header, two tiles, Volume, 1RM, "Recent sessions" label at 812 — full ✓; one dominant element (105) ✓.
- VERIFY (not scored): Volume and 1RM cards are 4 px shorter in dark (212 / 150 light vs 208 / 146 dark; tile row 165 vs 163): a scheme-dependent border or caption height in `ExerciseDetail`/`Sparkline`; find and make both schemes equal.
- Next: none for 390. (AppBar title "Progress" on an exercise page stays the feed team's `Stack.Screen` note.)

## Settings — score 4, accepted
- S1 ✓ 8 / 24 (card 108 under the "Account" line box; next label 24 under the card), S2 ✓ Sign out at the "Signed in" x, preset subtitles ✓. Rows 60 (ListRow natural, accepted in mobile-A r1). Dark identical.
- Next: none.

## Location editor — score 4, accepted
- LE1 ✓ pitch 40 (32 + 8), horizontal gap 8, label→group 8, group→label 24; LE2 ✓ "36 items selected", Active badge, Delete at 1511.
- Next: none. (Dark is 2 px higher than light from the name field down — same root as the progress-detail VERIFY above, cosmetic.)

## Verdict
**PASS** — library 4, library-detail 4, progress 4 (r1), progress-detail 4, settings 4, location 4. No round 3. Leftovers for the sheet, none blocking: `UI-P-left` dark backdrop (IMG-7); the subtitle separator clamp and the Last-done glyph are optional polish; `→ desktop:` ListRow `titleLines`/`subtitleLines`; the 2–4 px dark/light height drift is a VERIFY for the engineer's next touch of `ExerciseDetail`.
