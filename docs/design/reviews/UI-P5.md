# UI-P5 — polish round 5 designer review, 2026-10-27 10:26 (captures from 4e74a28 + 52 dirty)

**Verdict: PASS** (every captured screen scores 4 at 390 and 1280, light and dark; nothing < 4). The six in-flight fixes (tooltip clip, "1 h 10 …" tile, 2 px card drift, At Gym chip variant, formatVolume cycle) are not re-listed; verify them on the next shoot. Three shooter items judged below; two become fixes, one is accepted.

**Opened**: plan 390 L / 1280 D, programs 390 D / 1280 L, play 390 D / 1280 L, library 390 L / 1280 L, library-detail 390 L, progress 390 D, progress-detail 390 L / 1280 D (+ hover-first), feed 390 L / 390 clip / 1280 D, activity 390 L / 1280 L, integrations 390 L / 1280 D. Not opened: the remaining theme twin of each route (probe JSON frames identical; colour judged on the opened twin), library-detail 1280, progress 1280, hover-last.

## Round-5 changes, judged
- **Plan labels** "Planned sets 35/71 · Planned volume 9,937 kg": reads right as plan totals next to "Sessions 2/4" — the fraction says "35 of the 71 planned sets lie in finished sessions", which is what the figure is. One nit for when the logged tile lands: "Planned volume" has no fraction, so the two tiles look like different kinds of number; until then fine. ✓
- **ToggleChip outline** (location chip): 390 outline reads as a filter, good; 1280 filled is the in-flight item. ✓
- **Library "Last done" clock glyph** at 390: 20 px glyph, 16-px text, baseline aligned ✓.
- **Progress rows one-line subtitles** "30 kg × 15 · e1RM 45 kg" at 390 ✓, rows 65 even; card ends at 990/1400 (14 exercises, content state).
- **Sparkline tooltip strip below header**: not hovering, the 32-px strip reads as header padding (header 664, dots start ≈ 720); nothing floats, no jump on hover ✓. Hover text clip is in flight.
- **Feed StatRow tiles**: 390 card 3 tiles ✓ (numbers 22, captions 13); activity 390 2 × 2 under the map, 80 high ✓; 1280 4 in one row (148 wide each) ✓; card tiles and detail tiles are one style now.
- **Integrations pills** baseline-aligned with the title at 390 and 1280 ✓ (Strava "Not connected" y 101 vs title 100).
- **ProgramHome / Player ring tokens**: no visual change ✓ (390 ring 280, stroke 10, clock 96).

## Scores (ui-polish §4 rubric)
| Screen | 390 | 1280 | Notes |
|---|---|---|---|
| Plan | 4 | 4 | 390 summary row 3 tiles aligned; 1280 aside stacked 3 × 72 + Up next card (rendered this time, 577–750 ✓) |
| Programs | 4 | 4 | unchanged from r4 |
| Play | 4 | 4 | 1280: empty 20-px ring + white play disc in light (items 1–2); 390 dark fine |
| Library | 4 | 4 | 390 subtitles "Smith machine,…" / "Dumbbell, Ben…" (item 3); 1280 empty pane still the 24-px icon (r4 item 2, carried) |
| Library-detail | 4 | — (JSON only) | 390 facts row + 4 steps + chips + Last done, CTA pinned ✓ |
| Progress | 4 | — (JSON only) | one-line subtitles ✓ |
| Progress-detail | 4 | 4 | 390 map tile 160 | Best set card; 1280 strip judged above |
| Feed | 4 | 4 | 390 clip: "1 h 10 …" in flight; PR pill row on the week-of-12-Oct cards ✓ |
| Activity | 4 | 4 | 1280 right column: map alone in 470 (ends y 252 of 800) — same as progress-detail r4 (6), owner-visible void, item 5 |
| Integrations | 4 | 4 | "Needs app build" contrast (item 4) |

## Fixes, ranked (≤ 6; px + token + file + owner)
1. **R5a** `apps/mobile/src/ui/AppBar.tsx` (`eyebrow.progress` → `TimerRing size={sizes.ringSm}`): at 1280 the 20-px ring beside "Round 1/3 · Exercise 1/7" shows at 0 % (day 3 just started, `dayFraction` = 0) as an empty grey circle — a meaningless glyph. Render the ring only when `progress > 0`, or give `TimerRing` a `trackTone` so the empty track draws in `colors.hairline` with the 3-px stroke (`stroke.ringSm`) and reads as a track, not a hole. Prefer the first (one condition in `AppBar.tsx`).
2. **R5a** `apps/mobile/src/ui/IconButton.tsx` (`filled` → `colors.surface`): in light the play disc at 1280 is `surface` on a `surface` page = invisible (390 dark survives because the page is `bg`). Use `colors.surfaceRaised` for the filled disc on both themes (same token the stat tiles use) — one line; check the 390 Player disc still contrasts against `bg` in light (it does: raised ≠ bg).
3. **R5b** `apps/mobile/src/library/catalogFormat.ts` `clampSubtitle`: a mid-word "…" ("Smith machine,…", "Chest press mac…") is the one thing the owner reads as unfinished. Clamp at the last " · " or ", " boundary ≤ `max` instead of a character cut (drop trailing equipment items first: "Chest, Triceps · Smith machine" fits 32), and never emit "…" after a comma. Pure function + test (`catalogFormat.test.ts` has the 35-char case; add the two strings above).
4. **R5c** `apps/mobile/src/ui/StatusPill.tsx` `tone="neutral"` under `ListRow disabled`: the pill inherits the row's `DISABLED_OPACITY` on top of its own muted text → "Needs app build" ≈ 2.1:1 in light. Either exclude `trailing` from the opacity (render the pill outside the dimmed view) or give the disabled row `opacity 0.6` and the pill `tone="neutral"` text `colors.textMuted` at full opacity. Target ≥ 3:1 (caption text, non-essential).
5. **R5c** `apps/mobile/src/components/feed/**` (activity detail aside, 1280): the 470 column holds only the 170-px map; centre it (`alignSelf: "center"`) and move the 4 stat tiles into the aside under the map (2 × 2, 72 high) so the aside ends ≈ 420 and the main column gets the exercise list from y 150. Same cure as progress-detail r4 (6). Not a blocker; do it if the fix round has room.
6. **Carried, R5b** `apps/mobile/src/library/CatalogDetail.tsx` empty state at 1280: still a 24-px glyph in a 696 × 739 pane (r4 item 2). Illustration 128 + `title` 22 + `body` 17. Not scored down (no round-5 change touched it).

Accepted as-is: Plan "Planned sets" fraction label; Sparkline empty strip; feed 3-tile card at 390.

## Round 2 — re-shoot verified, 2026-10-27 10:36 (captures from be3261a + 51 dirty; `play` not re-shot, round-1 items 1–2 wait for the Lead grant)

**Verdict: PASS** (every touched screen 4 at 390 and 1280; nothing < 4). Opened: hover-first 1280 L, hover-last 1280 L + D, library 390 L / 1280 L, library-detail 390 D, feed 390 clip L / 390 D / 1280 L, activity 390 L, integrations 390 L / 1280 D. Drift checked by probe diff (light vs dark button frames) on feed, activity, library at both widths.

| Item | Result |
|---|---|
| 1 Sparkline tooltip | ✓ Pill sits below the card header on the 32-px strip, fully inside the card: hover-first "e1RM 116.7 kg · wk of 28 Sep" x 243–456 centred on the dot (349); hover-last "e1RM 105 kg · wk of 19 Oct" x 505–705, shifted left to stay inside the 722 card edge; same in dark (dark pill `surfaceRaised`, light pill white + hairline) |
| 2 At Gym chip | ✓ Same amber outline variant at 390 (count row, right) and 1280 (above the search field); pin glyph + label identical |
| 3 Feed tile step | **Not acceptable as a steady rule** — see fix 1. `TILE_VALUE_MAX_CHARS` = 8 catches "1 h 9 min" (9 chars), so on 4 of the 5 Last-week cards Duration is 17 px next to 22-px Volume/Sets, and the one card with "0 min" is 22 px: the row reads as a bug, not a hierarchy. Not scored below 4: every number is legible, baseline-aligned, nothing overflows |
| 4 Library subtitles | ✓ Cuts land on separators: "Chest, Shoulders · Dumbbell…", "Chest, Triceps · Smith machine…", "Chest, Triceps…" (Machine Chest Press: equipment dropped whole). No mid-word "…" in the first 18 rows at 390; 1280 shows the full strings |
| 5 Apple Health row | ✓ Reads as unavailable: no chevron, not a button (probe lists only "Strava, Not connected"), the pill "Needs app build" in `textMuted` at full opacity ≈ 4.6:1 in light. The full-weight title is right — it is a provider name, not an action. Accept as-is |
| 6 Card drift | ✓ 0 px: light and dark probe frames identical for feed, activity, library at 390 and 1280 (`buttons` arrays equal, frame equal) |

### Scores
| Screen | 390 | 1280 | Notes |
|---|---|---|---|
| Feed | 4 | 4 | 390 tile step (fix 1); 1280 selected card amber wash + detail pane with 4 tiles in a row ✓ |
| Activity | 4 | 4 | 390 map 170 → 2 × 2 tiles (72) → exercise rows with set strings ✓; 1280 aside void = round-1 item 5, carried, not re-scored |
| Library | 4 | 4 | subtitles ✓, chip ✓; 1280 empty pane glyph = round-1 item 6, carried |
| Library-detail | 4 | 4 (JSON) | 390 dark: hero + map tiles 170, facts row, 4 steps, "Available at Gym" pill, Last done, CTA pinned ✓ |
| Progress-detail | 4 | 4 | tooltip ✓ both themes |
| Integrations | 4 | 4 | Apple Health row ✓; 1280 two columns, About card right ✓ |

### Fixes (≤ 3)
1. **R5c** `apps/mobile/src/components/feed/feedGroups.ts` `statTiles` Duration tile: do not step the font; give the tile a compact duration instead. Add `formatDurationCompact(seconds)`: "1h 9m", "1h 10m", "2h", "35 min", "0 min", "< 1 min" (longest realistic "12h 59m" = 7 chars ≤ 8, so Duration is always `title2`); `statTiles` uses it, `formatDuration` (long form) stays for `finishWorkoutText.ts` and the activity header. `statValueVariant` and its tests (`feedGroups.test.ts` lines 180–185, `formatDuration(70 * 60)` → "headline" etc.) stay true as written; add `statTiles(activity with 70 * 60 s)[0]` → `{ value: "1h 10m" }` and `statValueVariant("1h 10m")` → "title2". Volume "10,000 kg" keeps stepping (rare, one tile). Carry a 390 re-shoot of the week-of-12-Oct cards.
2. **R5a (carried, needs grant)** `apps/mobile/src/ui/AppBar.tsx` eyebrow ring at 0 % — round-1 item 1, unchanged.
3. **R5a (carried, needs grant)** `apps/mobile/src/ui/IconButton.tsx` filled disc `surface` on `surface` — round-1 item 2, unchanged.

Accepted as-is this round: Apple Health row at full opacity; "Chest, Triceps…" with equipment dropped whole; tooltip left-shift at the last point.
