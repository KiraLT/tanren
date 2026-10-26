# Desktop composition (UI-D, v3-design)

Status: accepted (Lead delegation) · Author: architect (UI-D, 2026-10-26 20:38–20:53) · Sheet: `docs/tasks/v3-design.md`
Scope: how every screen uses the width at tablet (600–899) and desktop (≥ 900, designed at 1280). Forge (`ui-direction-final.md`, ADR-0014) and the approved 390 layouts are unchanged; this doc adds one layout module and re-composes seven screens. Owner's complaint (W1–W7, 2026-10-21): Today and Settings are one narrow centred column, Library and Progress detail stack like the phone.

## 1. Decisions

1. **Navigation**: the tab bar stays hidden at desktop and the five links stay in the `AppBar` (`APP_NAV`, built in UI-1b). No left rail: a rail costs 72–240 px of the width we want for content, and root-Stack routes (Settings, Location editor, detail routes, player) sit outside `(tabs)`, so a rail would need a second mount. One answer for all screens.
2. **Page width** (changed by ui-polish D1, UI-P): a desktop page is `min(window − 2·32, sizes.pageMaxWidth = 1360)` wide, centred (1280 → page 1216, margin 32; 1440 → 1360, margin 40). It holds two columns separated by a 24 gap; each column pads `gutter.desktop` 32 inside (as today), so the visible outer gutter is 32 + the margin. The old 1136 page (72 px margins at 1280) goes.
3. **Splits** (`ColumnSplit`): `"7/5"` (default: focus left, context right), `"5/7"` (master–detail: list left, detail right), `"6/6"` (symmetric sections). Main-column width is rounded to the 4-pt grid; the side takes the rest.
   - 1280, page 1216, gap 24 → 1192 to split: `7/5` main 696 (inner 632) / side 496 (inner 432); `5/7` 496 / 696; `6/6` 596 / 596.
   - **Below 1024 (window 900–1023) every split renders 6/6** (`effectiveSplit(width, split)`, used by `columnsFor` and `Columns`; desktop designer r1: a 364 column wrapped list names). 900, page 836 → 812: `7/5`, `5/7` and `6/6` all 404 / 408; 1023, page 959: 468 / 467. From 1024 the requested split applies (1024, page 960: `7/5` 544 / 392, `5/7` 388 / 548); `MIN_COLUMN = 364` (inner 300, see §3) stays as the guard (main on the 4-pt grid, main + 24 + side = page).
   - ≥ 1424 (1360 + 2·32): page stays 1360; wider windows only grow the margins.
4. **Tablet (600–899) is unchanged**: one column centred at `contentMaxWidth` 600 (inner 552), gutter 24, bottom tabs. Two useful columns need ≥ 2 × 300 + 24 = 624 of content; 552 cannot hold them (the Library hero alone is 176 + 144 = 320).
5. **Single-column screens at desktop** (600 centred, unchanged): Player (focus, `nav={false}`), Sign-in, auth callback, and every Loading / Empty / Failed state of every screen. Everything else is two columns.
6. **Type scale**: unchanged at every breakpoint. The ramp (`tokens.ts` `type`) is the ramp; desktop gets width, not bigger type.
7. **Must NOT change**: every measurement at 390 (UI-X2 proofs) and at 768; the 390 order of elements on every screen; the inner paddings (32) of the columns; the AppBar; the asides' content order where not named below.

## 2. The layout module: `src/ui/columns.ts` + `src/ui/ColumnsView.tsx` (not `Columns.tsx`: on case-insensitive APFS it collides with `columns.ts`, tsc TS1261; exports added to `src/ui/index.ts`)

```ts
// columns.ts (pure, tested)
export type ColumnSplit = "7/5" | "6/6" | "5/7"
export interface ColumnWidths {
  readonly breakpoint: Breakpoint
  /** The page column `Page` centres: window at phone, min(window, 600) at tablet, min(window − 2·32, 1360) at desktop. */
  readonly page: number
  /** Main column (incl. its 32 padding). Phone: window; tablet: page; desktop: the split share. */
  readonly main: number
  /** Side column; 0 below desktop. */
  readonly side: number
  /** 24 at desktop, else 0. */
  readonly gap: number
}
export const MAIN_SHARE: { readonly [S in ColumnSplit]: number } = { "7/5": 7 / 12, "6/6": 1 / 2, "5/7": 5 / 12 }
export const columnsFor = (width: number, split: ColumnSplit = "7/5"): ColumnWidths
//   phone:   { page: width, main: width, side: 0, gap: 0 }
//   tablet:  { page: min(width, 600), main: page, side: 0, gap: 0 }
//   desktop: page = min(width − 2·pageMargin, sizes.pageMaxWidth); pageMargin = gutter.desktop = 32; gap = space.xl;
//            share = Math.ceil(((page − gap) · MAIN_SHARE[split]) / 4 − 0.5) · 4
//            main = clamp(share, ceil4(MIN_COLUMN), floor4(page − gap − MIN_COLUMN)); side = page − gap − main
//            (rounding rule as built in UI-D1: ceil(x − 0.5) on the 4-px grid, so ties round DOWN; that is
//            what makes 6/6 at 900 = 404 / 408 as pinned, where Math.round would give 408 / 404)
// MIN_COLUMN = 364 (exported), pageMargin = 32 (exported from columns.ts)
// Tests pin: (1280,"7/5") → 696/496; (1280,"5/7") → 496/696; (1280,"6/6") → 596/596; (900, any split) → 404/408 (below 1024 every split is 6/6);
//            (1024,"7/5") → 544/392; (1024,"5/7") → 388/548; (390) → page 390 main 390; (768) → page 600 main 600;
//            (1440) and (1920) → page 1360.

// ColumnsView.tsx
export const useColumns = (split?: ColumnSplit): ColumnWidths   // useWindowDimensions().width → columnsFor
export interface ColumnsProps {
  readonly main: ReactNode
  readonly side: ReactNode
  readonly split?: ColumnSplit            // default "7/5"
  /** Below desktop: render both stacked in this order (default "main-then-side"). */
  readonly stack?: "main-then-side" | "side-then-main"
  readonly style?: StyleProp<ViewStyle>
}
export function Columns(props: ColumnsProps)
```

`Columns` is the **in-content** two-column row: at desktop `flexDirection: "row", gap: space.xl, alignItems: "flex-start"`, main `flex: 7|6|5`, side `flex: 5|6|7` (RN `flex: n` = grow n, basis 0, so the shares are proportional without measuring); `testID="columns-main"` / `"columns-side"` (RNW renders `data-testid`). Below desktop it renders the two children stacked with `gap: space.xl` in `stack` order. Components whose 390 order interleaves the two halves (Location editor, Progress detail) branch on `useBreakpoint()` and keep their current tree below desktop instead of using `stack`.

`Page` (same file, extended, no rename) gains:

```ts
readonly aside?: ReactNode          // unchanged meaning: rendered only at desktop, in the side column
readonly split?: ColumnSplit        // default "7/5"; which share `aside` gets
readonly wide?: boolean             // desktop: page column = pageMaxWidth even without `aside` (children use <Columns>)
```

Behaviour per breakpoint: phone/tablet unchanged (one column, `maxWidth: contentMaxWidth`, `aside` ignored). Desktop with `aside`: `maxWidth: columns.page` (1216 at 1280), main `width: columns.main, flexShrink: 0, role="main"`, side `flex: 1` (= `columns.side`), hairline left, `role="complementary"` (existing). Desktop with `wide` and no `aside`: `maxWidth: columns.page`, one `role="main"` body padded 32 → inner 1072. Neither: `maxWidth: contentMaxWidth` 600 (unchanged). `ExercisePager` takes its page width from `useColumns().main` (phone: window, tablet: min(window, 600), desktop 648 at 1280) instead of `Math.min(windowWidth, sizes.contentMaxWidth)`; the two agree below desktop, so 390/768 are pixel-equal.

Tokens: `sizes.pageMaxWidth: 1360` (was 1136); `contentMaxWidth` 600 and `asideMaxWidth` 480 stay exported (barrel is frozen-additive) but `Page` no longer reads `asideMaxWidth`.

## 3. Screens at desktop (1280; columns include their 32 inner padding; UI-P: page is now 1216 centred at x 32, so every column width and "648 / 464"-style pair below is stale: read the new pairs in §1.2 and ui-polish §3)

| screen | route | Page | main (left) | side (right) | primary action | change vs now |
| --- | --- | --- | --- | --- | --- | --- |
| Today (Ready) | `(tabs)/today` → `TodayReady` | `aside`, `7/5` → 648 / 464 | `ExercisePager` at 648: head (104 illustration + `display` name), steppers, `Log set` 64, no `SetList` | **new** "Session" `ListGroup`: one `ListRow` per exercise, `disc` done (`loggedSets.length >= plannedSets.length`) / now (`index === current`) / todo, title = `exercise.name`, trailing `subhead` "`logged`/`planned` sets", press → pager `goTo(i)`; then the existing "Sets" list + rest ring | Log set, main column | aside gains the session list; widths |
| Library | `(tabs)/library` | `aside`, **`5/7`** → 464 / 648 | filter bar + `CatalogList` (inner 400: 56 thumb + text) | `CatalogDetail` with `hero` **inline**: illustration 176 · gap 16 · map slot 144 · gap 16 · meta column (≥ 232; 176 + 16 + 144 + 16 + 232 = 584 ✓) | `Add to today's session` (sticky, side column) | split flips to 5/7; hero meta beside the images |
| Library detail (direct load) | `library/[catalogId]` | `aside`, `7/5` | name, steps, availability, Add button (inner 584) | `CatalogHero` stacked (320 ≤ 400 ✓) | Add, main | widths only |
| Programs (Ready) | `(tabs)/programs` | `aside`, `7/5` | `DayCard` **and `DayItems`** (today they are hidden at desktop: `wide ? null`) | `DayList` "Days" (all 30) | `Start day N` 56, main | DayItems shown at desktop |
| Player | `programs/play` | single 600, `nav={false}` | ring 220, controls | — | Done/Go | none |
| Plan (Ready) | `(tabs)/plan` | `aside`, `7/5` | `PlanWeek` rows (date column 96) | selected `PlannedSessionCard` | — | widths only |
| Progress | `(tabs)/progress` | `aside`, **`5/7`** → 464 / 648 | segmented + rows (inner 400) | `ExerciseDetail` stacked (map 176, bars at 584 inner: bars stay ≤ 24, gaps grow) | — (Settings gear in AppBar) | split flips to 5/7 |
| Progress detail (direct load) | `progress/[exerciseId]` | **`wide`** (inner 1072) | `ExerciseDetail layout="split"` → `Columns 7/5`: main = header row (104 + `title2` name) + Best-set tile + bars card + 1RM card (≈ 611 wide: (1072 − 24) · 7/12) | side (≈ 437) = `MuscleMapImage` 176 + Recent sessions | — | two columns (was one 600 column) |
| Settings | `settings` | **`wide`** | `Columns 6/6` (524 / 524): main = Account, Equipment & locations | side = Appearance, Data, About | — (Sign out = text row) | two columns of sections (was one 600 column) |
| Location editor | `settings/location/[id]` | **`wide`** | `Columns 5/7` (≈ 437 / 611): main = name card, `Set active`, `Delete location` row | side = equipment chips (wrap in 611) | Set active, main | two columns; phone order (name, Set active, chips, Delete) kept by branching on breakpoint |

Column arithmetic for every row above: Page rows: 648 + 24 + 464 = 1136 or 556 + 24 + 556 = 1136 ✓. `wide` rows: 1136 − 2·32 = 1072 = main + 24 + side with flex shares (7/5 → 611 + 24 + 437 = 1072; 6/6 → 524 + 24 + 524 = 1072) ✓. At 900 both columns are 404 / 408 (6/6, inner 340; 1024 gives the 5-share 392, inner 328, ≥ MIN_COLUMN 364 is the guard only): Library list rows (56 + 12 + text, truncating) ✓, Progress rows ✓, Today aside (`SetList` rows, ring 220) ✓, Plan card ✓, Programs day list ✓.

Loading / Empty / Failed states keep today's single 600 column (decision 5). The Today `Empty` state ("Nothing planned today") is one of these: `VERIFY:` whether the owner's W-screenshot of Today was the Empty state; if so the fix is the seeded Ready state, not a layout change, and the Lead decides whether Empty also deserves `wide`.

## 4. Verification (QA, `docs/design/ui-measure.js` + the new `docs/design/ui-columns.js`)

`ui-columns.js` (UI-D1 commits it next to `ui-measure.js`): returns `{ innerWidth, main: rect('[role=main]'), side: rect('[role=complementary]'), cols: rects('[data-testid=columns-main],[data-testid=columns-side]'), nav: rect('[role=navigation]') }` with `rect = { left, top, width, height }` rounded. Expected at 1280 (±1 px for a scrollbar): `main.left = (innerWidth − 1136)/2 = 72`, widths per §3, `side.left = main.left + main.width + 24`, same `top` for main and side.

"390 unchanged" = `ui-measure.js` JSON (text histogram, button bounds, `docH`) **identical** per screen to the baseline UI-D0 records from the pre-UI-D export; any diff routes to the owning task.

## 5. Behaviour assumptions (VERIFY in the engineer's run; none verified by running code, node_modules was being reinstalled)

- `VERIFY:` RN `role="main"` is in the installed `Role` union (seen in `react-native@0.88` `types_generated/Libraries/Components/View/ViewAccessibility.d.ts`) and RNW renders it as the `role` attribute like `complementary` does today.
- `VERIFY:` RNW renders `testID` as `data-testid` (expected; else `Columns` uses `role="region"` + `accessibilityLabel` "Main column" / "Side column" and `ui-columns.js` reads `[aria-label]`).
- `VERIFY:` `flex: 7` / `flex: 5` siblings in a `flexDirection: "row"` View give 7:5 widths on RNW (flex basis 0); if a child's content forces a wider basis, set `flexBasis: 0` explicitly.
- `VERIFY:` `ExercisePager` paging stays exact when `width` changes from 600 to 648 (`scrollTo({ x: target * width })`, `pageIndex(offset, width, count)` both read the same `width`); resizing across 899/900 re-snaps on the next `goTo`.
- `VERIFY:` `TodayExercise` exposes `exercise.name`, `plannedSets`, `loggedSets` (read in `TodayAside`, `TodayReady.tsx` lines 80–92) — the Session list needs nothing else.
- `VERIFY:` `CatalogHero` meta `Meta` rows wrap inside a 232 px column at 1280 (`flexWrap` row today; inline mode makes it a column with `gap: space.xs`).
- Not decided: a sticky/`position: fixed` aside while the main column scrolls (both columns scroll with the page today); hover-select on Library rows; a desktop keyboard shortcut for Log set. None is needed for the owner's complaint.
