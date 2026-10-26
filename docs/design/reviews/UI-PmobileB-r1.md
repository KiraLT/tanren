# UI-PmobileB round 1 — designer review (fable, 2026-10-26)

Spec: `docs/design/ui-polish.md` §3 Library / Library detail / Progress / Progress detail / Settings / Location, §4 rubric. Inputs: `UI-PmobileB-r1-*-390-{light,dark}.png` (24), measure JSON (390, seeded month, both schemes). Pixel runs read from the PNGs where the JSON has no entry (chips, tooltip, figure colour). Note: `library-filtered-390-light.png` is from a stale export (old tab bar with Progress tab; `At Gym` still in the muscle row) — not judged; reshoot in r2.

## Library — score 4, accepted
- L1: first row top 148 content / 204 viewport (spec ≤ 160 ✓); search 48 + muscle row 32 + count row 28 ✓; "Filters" chip opens an RN `Modal` sheet (pageSheet look: 16 radius, scrim, "Filters / Done", Equipment + Kind groups, "Clear filters") ✓ — `@expo/ui` absent, the Modal is the spec's fallback. "Filters · n" filled when active ✓.
- L2: rows 64 ✓ (119 of 126); **7 rows 72–74** where the subtitle wraps ("Chest, Triceps · Smith machine, Bench"). Hairline at x = 84 content ✓.
- L3: count row "291 exercises" left + "At Gym" chip right, 28 high ✓. Chip row gap 8 ✓ (horizontal).
- Light/dark consistent except the dark thumb tiles (see Q1). Fills the viewport, names dominant.
- Next: (1) `numberOfLines={1}` on the row subtitle in `CatalogList.tsx` → every row 64. (2) optional: "At Gym" chip `outlined` with the pin in `accent` — two primary-filled pills ("All", "At Gym") 46 px apart still read as two selections.

## Library detail — score 3 (untouched baseline), not accepted yet
- Hero 176 + map 144 ✓, meta row ✓, steps group ✓, availability chip ✓; void between chip and button ≈ 190 px (22 % of 844, under the 25 % rule) but the §3 LD1 "Where it fits" block is round 2 as planned. Dark draws tiles behind both hero images, light behind neither (Q1).
- Next: LD1 — "Last done 18 Oct · 105 kg × 5" row under the chip when history exists, else only the chip (VERIFY the lookup by catalog id).

## Progress — score 4, accepted
- P1: rows 64 ✓ (14 of 14, tops 81 + 65·n), divider inset 84 ✓, date `caption` tabular right ✓; group 24 under the AppBar ✓. P2 summary line not added (optional) — not needed, the list fills the viewport.
- Next: none for 390.

## Progress detail — score 3, not accepted
- PD1 ✓: map tile 158 × 174 + Best-set tile 184 × 174 on one 358 row (spec 160/182 × 176, within ±2), numeral 56 ✓ ("56px/60px/800": 1), "kg × 5" caption, "e1RM 122.5 kg", "PR" accent badge — the best thing on the screen.
- PD2 ✓ one-line pill above the bar, 152 wide ≤ 180, both schemes; **e42 variant truncates**: pill x 33–160 = 127 wide and the label "0 kg · wk of 7 S…" needs ≈ 140. The right-clamped "0 kg · This week" is fine. VERIFY `ChartHover.tsx` `onLayout`: the measured natural width looks like the Text without the 12 + 12 pill padding; `tooltipWidth` must take the padded pill (or add `2·space.md`) — pinned test: label of 18 chars → width ≥ 140.
- PD3 (round 2 as planned): 48 px blank above the 1RM sparkline; 4 points on an 8-week axis occupy x 170–305 with no dates. → `Sparkline` 72, first/last date `caption` under the ends, trailing headline "105 kg" (spec PD3).
- AppBar title "Progress" on a Back Squat page: feed team's route — `Stack.Screen options={{ title: name }}`; one line for them, not scored here.
- Next: (1) PD2 width fix; (2) PD3; (3) PD4 tabular "Set 1 · 75 kg × 6" values.

## Settings — score 4, accepted
- S1: label→group 8 ✓ (Account 88→108 incl. line box), group→label 24 ✓ (232→262); rows 60 (ListRow's two-line natural height, accepted in mobile-A r1). S2: "Sign out" title x = 64 = "Signed in" x ✓, red `danger`, subhead muted ✓. Dark identical.
- Next (content, `settingsCopy.ts`, optional): preset rows "Add gym · 36 items" directly under "Gym · 36 items" read as duplicates → subtitle "Preset · 36 items".

## Location editor — score 3, not accepted (one number off)
- LE1: chip horizontal gap 8 ✓, hitSlop 6 ✓ (code), label→group 8 ✓, group→label 24 ✓; **chip row pitch 44 = chip 32 + 12** (pixel runs at x = 40: chips at 336–366, 380–410, 424–454) → spec row gap 8 (pitch 40). The same 44 pitch is in the Filter sheet (259/303/347). Set `rowGap: rhythm.chipGap` (8) on the wrap view in `LocationEditor.tsx` and `FilterSheet.tsx` (columnGap already 8).
- LE2: "5 items selected" caption under the name field ✓, Set active 56 ✓, Delete at 1595 ✓ kept.
- Next: (1) row gap 12 → 8 (both files); nothing else.

## Answers to the engineer's questions
1. **Dark tiles behind illustrations**: `ExerciseIllustration.tsx` draws `surfaceRaised` behind the webp in dark only. The figure measures `#4F5C61`/`#536671` on the PNG; §7 contracts a mid-grey figure (`#8A919B`-ish) on transparent, one asset for both themes, no tile. The tile is a workaround for an asset darker than its contract, and the visible result is 24 boxes on a dark Library screen plus light/dark compositions that differ. Ruling: a defect against §7, **but not an r2 item for mobile-B** — the fix is the asset (re-tint/regenerate the figures to the §7 grey, IMG scope), then one line drops the dark backdrop. Log it as `UI-P-left: ExerciseIllustration dark backdrop until the figures are re-tinted (#4F5C61 → #8A919B)`. Keep the `framed` map tile on Progress detail — that one is spec. Note for the team-lead: `ExerciseIllustration.tsx` and `MuscleMapImage.tsx` are outside mobile-B's §4 file set; the `backdrop` prop edit is out-of-set (log the hand-over line, no re-do needed).
2. 48 px blank = PD3, round 2 as scheduled; the "Progress" title is the feed team's `Stack.Screen` (note only).
3. Beyond §3: Library subtitle wrap (72-px rows), the Settings preset duplicates, the two filled pills on Library — all listed above; nothing else reads unprofessional at 390.

## Round 2 priority
1. Location/Filter sheet chip row gap 12 → 8 (`LocationEditor.tsx`, `FilterSheet.tsx`) — the only ±2 miss.
2. Progress detail PD2 width fix (first-bar truncation), then PD3 sparkline + dates + headline, PD4 tabular.
3. Library subtitle `numberOfLines={1}`; reshoot `library-filtered` from the current export.
4. Library detail LD1; Settings S2 is done, preset subtitle optional.
→ desktop: nothing needed this round.

Pair verdict: NOT PASS (Library detail 3 baseline, Progress detail 3, Location 3). Every round-2 fix is inside mobile-B's files.
