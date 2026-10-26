# UI polish: research, critique and the pair plan (UI-P, v3-design)

Status: accepted (Lead delegation) · Author: architect-as-designer (UI-P0, 2026-10-26 21:10–21:30) · Sheet: `docs/tasks/v3-design.md` ("UI-P — polish pairs")
Owner verdict (21:15, Amendment 7): "too many white spaces, it does not look like it fills the page. Mobile is kinda ok, desktop is the bigger problem; smaller UI improvements on mobile to look more professional." Forge (`ui-direction-final.md`, ADR-0014) stays; this doc changes density, fill and finish, not the direction. Measurements are from `UI-X3-*-390` and `UI-DX-*-1280` (`docs/design/screens/`, git-ignored) read against `src/ui/{tokens,controls,columns}.ts`.

## 1. Research digest (principles, sourced; nothing copied from a brand)

1. **Window size classes, not one desktop** (Material 3 Layout, m3.material.io/foundations/layout/applying-layout/window-size-classes): compact < 600, medium 600–839, expanded 840–1199, large 1200–1599, extra-large ≥ 1600. Margins 16 (compact) and 24 (medium+); pane spacer 24; a list-detail or supporting-pane canonical layout from expanded up. A page that keeps 72 px dead margins at 1280 and never grows past 1136 reads as "a phone layout stretched" (the owner's complaint).
2. **Fill is vertical as much as horizontal.** Canonical layouts (m3.material.io/foundations/layout/canonical-layouts) put the *secondary* content beside the primary so the first viewport is full; a 7/5 split whose main column ends at 60 % of the viewport height still looks empty. Rule: at ≥ 900 every screen's first 800 px viewport carries content to ≥ 85 % of its height in at least one column, or the column is sticky and visibly "pinned".
3. **The 4/8-pt grid and spacing ratios** (Bryn Jackson, "Intro to the 8-Point Grid System", spec.fm; Apple HIG Layout, developer.apple.com/design/human-interface-guidelines/layout): spacing steps double between levels. Inside a row 4–8, between rows 0 (hairline) or 8, label→group 8–12, group→group 24–32, screen edge 16. The Expo skill names "16-Everything" as the tell: section gaps that equal row gaps carry no meaning.
4. **One dominant number per screen** (Refactoring UI, Wathan & Schoger, ch. "Hierarchy is everything"; HIG Typography text styles): emphasise with weight and colour, de-emphasise everything else; secondary labels in the muted role, units at caption size next to the numeral, never a second 72-px figure on the same screen. Numbers that are compared align: `fontVariant: tabular-nums` (Butterick, Practical Typography, "alternate figures"; also the Expo native-ui rule).
5. **Surfaces** (HIG Lists and tables; Expo native-slop #7 "Everything's a Card", #8 "Shadowboxing", #9 "Wireframe borders"): grouped lists on a raised surface with hairlines; cards only for a *thing* (a tile, a hero, a chart), never for a list row or a whole section; no outline strokes on containers; two elevation levels at most. Dividers are inset to the text start, not the leading icon.
6. **Icons and alignment**: one icon family (Lucide here), a 24 grid with 20 for inline/trailing glyphs and 16 for captions; icon optical centre on the first text line, 12 from text. Chevrons 20, muted. (HIG Icons; Material 3 Icons.)
7. **Proximity and whitespace** (NN/g, "Proximity principle in visual design", nngroup.com/articles/principle-proximity): related items closer than unrelated; whitespace is only "good" when it separates groups, "empty" when it trails content — a half-empty column is the latter.
8. **Expressive emphasis** (Material 3 Expressive, m3.material.io/blog/building-with-m3-expressive): larger primary controls, shape contrast (capsule vs 16-radius), and a single emphasised element per screen speed up finding the primary action; everything else stays quiet. Matches Forge's big round button and borderless steppers.
9. **States** (Expo native-slop #19 "Spinner blink"; HIG Loading): four states per screen; the empty state is an invitation with one action, not a centred icon in a 648-px pane.
10. **Desktop fill strategies** seen in finished trackers (teardown, no copying): a content max around 1280–1440 with 24–32 margins; a two- or three-pane page where the second pane is a list or chart that scrolls with its own height; hero rows (illustration + title + 3 stats) spanning the full width; stat tiles three-up; sticky asides. Type does *not* scale with width except the hero numeral.

## 2. Decisions that cut across screens

D1 **Page width (changes `ui-desktop.md` §1.2)**: `sizes.pageMaxWidth` 1136 → **1360**; page = `min(window − 2·pageMargin, 1360)` with `pageMargin = 32` at ≥ 900 (`gutter.desktop`). At 1280: page **1216**, margin 32, visible gutter 32 + 32 = 64 (was 104). At 1440: page 1360, margin 40. At 1920: page 1360, margin 280 (a max is normal; the empty-column problem is fixed by D2–D4, not by width). At 900: page 836.
  Column arithmetic (`columnsFor`, same rounding rule `ceil(x − 0.5)·4`): 1280 → `7/5` **696 / 496** (inner 632 / 432), `5/7` 496 / 696, `6/6` 596 / 596; 900 → `7/5` 472 / 364, `5/7` 340 / 472, `6/6` 404 / 408. **New clamp**: a column is never below `MIN_COLUMN = 364` (inner 300, the §3 floor of ui-desktop); at 900 `5/7` therefore = 364 / 448. New pinned tests: (1280,"7/5") → 696/496; (1280,"5/7") → 496/696; (1280,"6/6") → 596/596; (900,"5/7") → 364/448; (900,"7/5") → 472/364; (1440) → page 1360; (390)/(768) unchanged.
D2 **Sticky aside**: at desktop the `aside` column is `position: sticky; top: 56 + 24` (web only, `Platform.OS === "web"`; VERIFY RNW accepts `position: "sticky"` in `ViewStyle` — if not, the aside gets `maxHeight: windowHeight − 80` + its own `ScrollView`). The main column scrolls the page. A pinned aside reads as intentional; a short aside that scrolls away reads as leftover.
D3 **Hero numeral scales by breakpoint**: `type.numeral` 72/76 at phone and tablet, **96/100 at desktop** (new token `type.numeralLg`, used only by `ExercisePage` weight and `PlayerView` clock). Steppers `xl` hit 64 → 72 at desktop (`stepperSizes.xl` unchanged; new `xxl: { hit: 72, glyph: 34 }`). Nothing else in the ramp changes (ui-desktop §1.6 holds for text).
D4 **Illustrations at desktop**: `illustrationMd` 104 → `illustrationLg` 176 in the Today header and the Progress detail header at desktop; the muscle map slot 144 → 176 beside a 176 illustration when the inner width ≥ 400 (176 + 16 + 176 = 368 ✓).
D5 **Section rhythm (all breakpoints)**: label → group 8 (`space.sm`), group → next label 24 (`space.xl`), hero → first section 24, card inner padding 16, row 52 (`ROW_MIN_HEIGHT`) for text rows and 64 for rows with a 56 thumb (currently 72: trim vertical padding 8 → 4 around the thumb). Dividers inset to the text start (`16 + 56 + 12 = 84` on thumb rows, `16 + 24 + 12 = 52` on icon rows, 16 on plain rows). Today's measured gaps: Settings label→group 12, group→label 32; Library chip rows 12 apart.
D6 **Numeric typography**: every count, weight, date column and trailing value is tabular (`fontVariant: ["tabular-nums"]` on `subhead`/`caption` when used in a trailing slot: add `tabular?: boolean` to `Text`). Units sit in `caption` muted after the figure ("107.5" + " kg"), never inside the numeral.
D7 **Empty panes carry content**: a desktop master-detail pane is never a centred icon. Library preselects the first visible row at desktop (`selected` = first of the filtered list when none chosen); Progress already does.
D8 **Not decided here**: a left rail (ui-desktop §1.1 stands), a dense "table" mode for Progress, hover states beyond the existing `buttonHoverStyle`, animations. None is needed for "fills the page".

## 3. Critique per screen

Widths: 390 content 358 (gutter 16); 1280 per D1 unless the finding says "today". Each finding: *what* → *fix (numbers, tokens)*. `[M]` mobile-A/B item, `[D]` desktop item.

### Today (Ready)
1. `[M]` `TodaySetupCard` (two-line title + body + "Set up" button, 136 high) pushes the exercise header to y = 216. → one `ListRow` on `surfaceRaised`: leading dumbbell 24, title "Set up your equipment" `headline`, subtitle "Tell Tanren what your gym has" `subhead`, trailing chevron; 56 high; gap to header 16. Header lands at y ≈ 136.
2. `[M]` Set-progress pills are 6 px dots next to 15-px text; they read as noise. → pills 10 × 6 radius 3, gap 4, current pill 16 × 6 accent, done pills `textMuted`, todo `hairline`; vertically centred on the `subhead` x-height.
3. `[M]` Weight and reps blocks have the same height (108) and the same divider weight, so the dominant number is not dominant. → reps numeral stays 72 but its block height 108 → 92 (padding 16 → 8 above and below), the hairline between weight and reps goes, a 24 gap replaces it; the "Weight · kg" caption becomes "kg" `caption` muted on the baseline right of the numeral (D6).
4. `[M]` Sets list rows are 52 with "100 kg × 5" `subhead`; the current set's disc is accent but the row is not. → current row `rowBackground(selected)` (already a prop), trailing value tabular `body`.
5. `[D]` Main column ends at y ≈ 590 of 800 (today's 1280 shot), aside at 730: the page is 26 % empty below the fold with nothing to scroll. → D3 numeral 96 and steppers 72 (block 92 → 128 each), D4 illustration 176 (header 104 → 176 high); the "Rest 3:00 starts after the set" caption becomes a three-up stat row under the button: *Rest 3:00 · Done 0/5 · Volume 0 kg* (`caption` label over `headline` value, 3 × (inner 632 − 2·16)/3 = 200 each). Main now ends at ≈ 760.
6. `[D]` Aside "Session" group + "Sets" group are two cards of 52-px rows stacked 24 apart, fine; but the "Sets / Back Squat" label pair is 48 high. → one label row: "Sets · Back Squat" `caption` + `headline`, 28 high. Aside sticky (D2).
Width check 390: header 104 + 12 + text column 242 = 358 ✓. Stat row 390: three slots (358 − 2·16)/3 = 108 ✓ (also used at 390 if mobile-A has time: optional).

### Player
1. `[M]` The ring (220) sits at y = 230–450 of an 844 viewport; controls at 500; "Finish workout" at 580; 260 px of nothing below. → the body is `flex: 1, justifyContent: "space-between"`: header row at top, ring centred in the remaining space, controls + Finish anchored above the home indicator (padding bottom 16 + inset).
2. `[M]` Pause 56 vs prev/next 44 glyph-only looks under-sized next to a 220 ring. → pause `controlLg` 56 → `stepperButton` 64 with `surfaceRaised` fill, prev/next 48 (`control`), gap 24 → 32.
3. `[M]` No "next" preview. → under the controls a `caption` "Next · Crunch 25 s" (muted), 20 high; reads as a timer app, costs nothing.
4. `[M]` Clock numeral 56 inside the ring (ring 220, stroke 12). → numeral 64/68 (`title`-family ramp step `numeralSm`? no: use `type.numeral` scaled 0.9 via `transform`? no) → add `type.clock = { fontSize: 64, lineHeight: 68, display, tabular }`; stroke 12 → 10; the "Work" eyebrow stays accent `caption`.
5. `[D]` Single 600 column; at desktop the ring may be 280 (D3 spirit) and the clock `numeralLg` 96. Width: 600 − 64 = 536 ≥ 280 ✓.

### Plan
1. `[M]` Rest rows are 64 high (two-line date), identical to session rows; the week is a wall of equal rows. → rest rows 52: date column single line "Mon 26" `subhead` muted, "Rest" `subhead` muted; session rows keep the two-line date (`headline` weekday + `caption` date) and a `headline` title.
2. `[M]` Session items inside the today row wrap ("Back Squat · 3 × 5 @ 100 kg · rest 180 s" → 2 lines each, 4 items = 8 lines). → each item one line: name `subhead` + trailing "3 × 5 · 100 kg" tabular; drop "rest N s" from the row (it is in the day card / Today). Row height drops from 230 → 150.
3. `[M]` Header "Demo plan" (`title` 28) + dates `subhead` + goal line: 16 under the AppBar, then 24 to the card; fine. Add the week summary as a three-up stat row under the header: *Sessions 1/4 · Sets 0/33 · Volume 0 kg*; slots (358 − 32)/3 = 108 ✓. (Source of the numbers: `planWeekFixture`/`planFormat` sums; VERIFY the counts exist in the `PlanWeek` props or add a pure `weekSummary(week)` in `planFormat.ts` with a test.)
4. `[D]` Aside = one `PlannedSessionCard` (190 high) in a 496 column, then void. → the aside holds the selected day's card **and** the week stat tiles (stacked 3 × 72 under it, tabular) and is sticky; the main list rows are 64/52 per item 1. Main column 696: date column 96 + title + trailing status chip ✓.

### Library (list)
1. `[M]` Filter stack = search 48 + three chip rows (3 × 32 + 2 × 12) + count = 212 px before the first exercise; at 844 only 7 rows show. → search + the muscle chip row stay; equipment and type collapse into one "Filters" chip with a count badge that opens a sheet (native-slop #1: use a bottom sheet, not a modal; VERIFY `@expo/ui` BottomSheet availability in Expo Go SDK 58, else a `Modal` with `presentationStyle: "pageSheet"`). Saves 88 px. Chip row gap 12 → 8.
2. `[M]` Rows 72 with a 56 thumb; dividers run from x = 16 under the thumb. → row 64 (D5), divider inset 84.
3. `[M]` "291 exercises" `subhead` muted hangs 12 under the chips with nothing on the right. → a section label row: "291 exercises" left, "Sort · A–Z" text button right (no sorting yet: show only the count unless the sort exists; VERIFY `searchState.ts`), 28 high, 8 under the chips.
4. `[D]` Pick-an-exercise pane: a 648 × 720 void with a 24 icon. → D7 preselect the first row; the detail pane renders the inline hero (illustration 176 + map 176 + meta column; 176 + 16 + 176 + 16 + 248 = 632 ✓) and steps. The list column (496, inner 432) keeps 64 rows.
5. `[D]` The "At Gym" location chip and the search field sit in the list column; fine. Sticky filter block at desktop (`position: sticky` on the filter bar, same VERIFY as D2) so the list scrolls under it.

### Library detail (`/library/[catalogId]`)
1. `[M]` Hero: illustration 176 + map 144 fill 336 of 358 ✓; meta row three glyph+label pairs at 15 px; steps in a grouped list; the Add button is fixed to the bottom 120 px below the last step with void between. → at 390 the fixed button is right (thumb reach); the void is the content: add a "Where it fits" block under the steps: equipment availability chip + "Last done 18 Oct · 105 kg × 5" row when history exists (VERIFY: `progress` history lookup by catalog id exists? `illustrationIdFor(exercise)` maps the other way; if no lookup, show only the availability chip and stop).
2. `[D]` 7/5 with the hero in the side column at the top-right and the Add button fixed bottom-left; the main holds three rows of steps and a chip. → at desktop the Add button is *in flow* under the chip (`Button xl` full width of the main column, 24 below), not fixed; hero images 240 + 16 + 176 = 432 = side inner ✓ (illustration 240 is a new size `illustrationXl`; VERIFY the 512² webp holds up at 240: yes at 2×).

### Progress (list)
1. `[M]` Rows 72, dividers from x = 16 under the thumb; the date column "20 Oct" `caption` is right-aligned but not tabular. → row 64, divider inset 84, date tabular.
2. `[M]` The segmented control (48) sits 16 under the AppBar and 16 above the group; fine. Add a one-line summary above the list: "14 exercises · last session 20 Oct" `caption` muted, 20 high. Optional.
3. `[D]` 5/7 with the detail stacked in the side column: map 176 alone in a 696-px column leaves 500 px of void beside it (today's shot). → the side column uses `ExerciseDetail layout="split"` too when its inner width ≥ 584 (632 ✓ at 1280; at 900 the side is 448 → stacked): header row (176 illustration + name), then `Columns 7/5` inside: best-set tile + bars + 1RM left, map + Recent sessions right.

### Progress detail (`/progress/[exerciseId]`)
1. `[M]` Header (104 illustration + `title2` name) then a 176 map alone in the 358 row: 182 px of void to its right. → a two-up row: map tile 160 × 176 (`framed`) + Best-set tile beside it (160 + 16 + 182 = 358 ✓; the tile holds "105" numeral 56 + "kg × 5" + "e1RM 122.5 kg" in 182 − 32 = 150 ✓).
2. `[M]` Volume tooltip "4,110 kg / Week of 5 Oct" wraps to two lines and overlaps the bars. → one line `caption` "4,110 kg · wk of 5 Oct" in a pill max 180 wide, positioned above the bar, clamped to the chart frame (`ChartHover.tsx`).
3. `[M]` "Estimated 1RM" card: three points on a 358-wide sparkline with no axis labels and 48 px of blank above. → `Sparkline` height 96 → 72, first/last date `caption` under the ends, latest value as the card's trailing headline "105 kg".
4. `[M]` Recent sessions: date label `caption` + group; rows "Set 1 · 75 kg × 6" at 52; fine. Tabular the values.
5. `[D]` `wide` 7/5 already; apply D4 (176 header illustration) and the sticky side column.

### Programs
1. `[M]` Enrolled `DayCard`: ring 44 (empty grey at day 1) + title2 + Start button 56 inside a card; then "Day 1 exercises" list, then "This week" list. The empty ring says nothing. → ring shows the day number `headline` inside (`ringMd` 44 with label), progress stroke 3.
2. `[M]` Two grouped lists of 52 rows with 24 between: fine. "This week" label row has "0 of 30 done" accent on the right ✓ (keep: it is the one accent on the screen besides the button).
3. `[D]` Not-enrolled state is one 600 column with a 280-px card and 500 px of void (today's 1280 shot). → `Page wide` + `Columns 6/6`: left the `EnrolCard` (hero illustration 176 instead of 56, title `display` 34, body, Start button), right a "What's inside" grouped list of the first 7 days (name + minutes) and a three-up stat row *30 days · 15 min · 7 exercises*. 596 inner 532: slots (532 − 32)/3 = 166 ✓.
4. `[D]` Enrolled state 7/5: main `DayCard` + `DayItems`, aside the 30-day list (sticky, its own scroll per D2 fallback); fine after D1/D2.

### Settings
1. `[M]` Rhythm label→group 12, group→label 32 (measured). → 8 / 24 (D5): the screen shortens by 56 px and the groups read as groups.
2. `[M]` "Sign out" danger row carries a `subhead` "Data on this device is kept." at 15 px under a 17 px red title: fine; move the group's icon column (24) to align the title x with the rows above (the Sign out title starts at x = 32, "Signed in" at x = 64). → `ListRow` with an empty 24 leading slot (`leading={null}` keeps the inset; VERIFY the prop).
3. `[D]` 6/6 columns end at y = 600 / 600 of 800 with 200 px void. → acceptable for a settings page once D1 widens the columns (596) and D5 tightens; add nothing.

### Location editor
1. `[M]` Chip rows 12 apart, chips 32 high with 12/16 padding; groups 24 apart; fine. → chip row gap 8, `hitSlop` 6 so the 32-px chip meets 44 (VERIFY `Chip` has `hitSlop`), group→label 24, label→group 8.
2. `[M]` "Delete location" sits in a card at the very bottom after ~1500 px of chips. → keep; add the item count to the name card ("5 items selected" `caption` under the field) so the top says what the bottom does.
3. `[D]` 5/7 with the name/Set active/Delete in the 340 → 496 left column: fine after D1; the chips column 696 wraps in 4–6 per row ✓.

## 4. Pair plan

Three pairs run in parallel; each pair = team-lead (sonnet) + engineer (sonnet) + designer review (fable, this role). File sets are disjoint; **anything outside a pair's set is forbidden** (a needed primitive change is a `VERIFY:`/request line in the pair's sheet, done by `desktop`, which owns `src/ui`). Rounds ≤ 3; each round ≤ 20 min engineer + ≤ 10 min designer.

| Pair | Owns (exclusive) | Round 1 (priority order) | Round 2–3 |
|---|---|---|---|
| **mobile-A** | `src/components/{TodayReady,TodaySetupCard,ExercisePage,SetList,RestTimerBar,PlanWeek,PlanDayRow,PlannedSessionCard}.tsx`, `src/components/{todaySetup,planFormat}.ts` (+tests), `src/player/components/{PlayerView,ProgramHome}.tsx`, `app/(tabs)/{today,plan,programs}.tsx` | Today 1–4; Player 1–3; Plan 1–2 | Player 4 (needs `type.clock` from desktop), Plan 3, Programs 1 |
| **mobile-B** | `src/library/{CatalogList,CatalogDetail,CatalogFilterBar}.tsx`, `src/library/{searchState,catalogFormat}.ts` (+tests), `src/components/progress/*.tsx` (+`chartGeometry.ts`), `src/components/settings/*.tsx`, `app/(tabs)/{library,progress}.tsx`, `app/settings.tsx`, `app/settings/location/[id].tsx`, `app/library/[catalogId].tsx`, `app/progress/[exerciseId].tsx` | Library 1–3; Progress 1; Progress detail 1–2; Settings 1 | Progress detail 3–4, Settings 2, Location 1–2, Library detail 1 |
| **desktop** | `src/ui/**` (tokens `pageMaxWidth`, `numeralLg`, `clock`, `MIN_COLUMN`, `columns.ts` + tests, `Page.tsx` sticky aside, `Text` `tabular`, `ListRow` divider inset, `stepperSizes.xxl`), `src/components/ExercisePager.tsx`, `docs/design/ui-columns.js`; **plus desktop-only branches** (`breakpoint === "desktop"` / `layout="split"` / `inline`) inside any screen file, edited only after the owning mobile pair's round has been accepted, or in files the mobile pairs have finished | D1 + D2 + D5 divider inset + D6 (`src/ui` only, round 1 = foundation, ships first so mobile pairs' rounds 2–3 can use the tokens) | Today 5–6, Library 4–5, Progress 3, Programs 3, Plan 4, Library detail 2, Player 5 |

Ordering rule: desktop round 1 (`src/ui` only) starts first and is the only task touching `src/ui`; mobile pairs start at the same time in their own files; desktop rounds 2–3 touch screen files only after the mobile pair reports its round accepted for that file (the team-lead sheet logs the hand-over line).

**Screenshot protocol**: after every engineer round the engineer exports and shoots (QA harness: `wrangler dev --assets` on a scratch export; never the live dev server), names `UI-P<pair>-r<round>-<screen>-<w>-<theme>.png` in `docs/design/screens/`. Screens per round: mobile-A → today, player, plan, programs at 390 light + dark; mobile-B → library, library-detail, progress, progress-detail, settings, location at 390 light + dark; desktop → all 10 at 1280 light and today, library, progress, programs at 900 light (+ 1440 for today and library in round 1 to prove D1). The engineer also runs `docs/design/ui-measure.js` (390) and `ui-columns.js` (1280/900) and pastes the JSON of the screens it changed.

**Designer rubric (per screen, per round)**: pass when (a) every number in this doc's findings for that screen measures within ±2 px in the JSON or a ruler on the PNG, (b) nothing outside the finding changed at the other breakpoints (390 JSON identical for desktop rounds), and (c) the finish score is ≥ 4. Finish score: **1** broken layout or regression; **2** finding applied but a new inconsistency (spacing, alignment, tone) visible; **3** applied, consistent, but the screen still has one of: trailing void > 25 % of the first viewport at that width, equal-rhythm sections, non-tabular compared numbers; **4** applied, consistent, fills the first viewport, hierarchy reads at a glance (one dominant element); **5** 4 plus nothing the designer would still change on that screen. The designer reports per screen: score, the measured deltas, and ≤ 3 next changes with numbers; a round is "accepted" when all its screens are ≥ 4.

**Stop rule**: a pair stops when every screen in its set scores ≥ 4 at every breakpoint it owns, or after round 3; round-3 leftovers go to the sheet as `UI-P-left` lines with the exact number still off, not a fourth round. A pair also stops (and reports to the Lead) when a finding needs a file outside its set that `desktop` has not yet delivered: it logs the request and moves to its next item instead of waiting.

## 5. Templates

**Designer-review brief (team-lead → fable designer, one per round)**
```
Review UI-P<pair> round <n>. Spec: docs/design/ui-polish.md §3 <screens>, §4 rubric. Read-only; write nothing but your report.
Inputs: docs/design/screens/UI-P<pair>-r<n>-*.png (<list>), measure JSON pasted below, the diff summary from the engineer (<3 lines>).
For each screen: finish score 1–5 (definitions §4), the measured value next to the spec value for every finding in scope, and ≤ 3 next changes as numbers + tokens. Say "accepted" per screen at ≥ 4. If the only remaining deltas need src/ui, write them as "→ desktop:" lines. Time box 10 min; report ≤ 25 lines.
```

**Engineer brief (team-lead → engineer, one per round)**
```
UI-P<pair> round <n>. Owned files only: <set from §4; everything else forbidden>. Spec: docs/design/ui-polish.md §2 decisions, §3 <screen findings n–m>; tokens from src/ui/tokens.ts, controls.ts (do not add literals: a number not in the scale is a question, not a style).
Do, in order: <finding ids with the numbers copied in>. Keep the 390 tree unchanged where the finding is [D] (desktop branch only) and vice versa.
Done: pnpm -F @tanren/mobile check green; export + screenshots UI-P<pair>-r<n>-<screen>-<w>-<theme>.png per §4 protocol; ui-measure.js / ui-columns.js JSON for the screens you touched pasted in the report; report ≤ 20 lines: per finding "done <measured>" or "blocked <why>".
Permissions: never run commands under permissions.ask; no .env*; do not start the shared dev server (scratch export + wrangler dev --assets on a free port, stopped at the end). Time box 20 min.
```

## 6. VERIFY (engineers check against installed types; none verified by running code here)

- `position: "sticky"` in RNW `ViewStyle` (react-native-web 0.21 supports it on web; RN types may not list it: wrap in a `Platform.select` with a `// web-only` comment or use the `maxHeight` + inner `ScrollView` fallback in D2).
- `@expo/ui` `BottomSheet` runs in Expo Go on the installed SDK (58) for Library finding 1; else `Modal presentationStyle="pageSheet"`.
- `Chip` has `hitSlop`; `ListRow` keeps the leading inset with `leading={null}`; `Text` gains `tabular` (desktop round 1).
- `numeralScale` (`controls.ts`) only shrinks below 375: `numeralLg` at desktop is a separate ramp step, not a scale factor, so the 320–374 rule is untouched.
- Plan week summary counts: a pure `weekSummary` in `planFormat.ts` if `PlanWeek` props lack them; Library detail "last done" needs a catalog-id → exercise-history lookup that may not exist (then show the availability chip only).
- `ui-columns.js` expected lefts change with D1: `main.left = 32` at 1280 (was 72), `main.left = 40` at 1440.
