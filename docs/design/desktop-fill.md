# Desktop fill: Home and You at 1280 (DESK-D, 2026-10-27)

Owner verdict (plan Amendment 7): "too many white spaces … desktop is the bigger problem". Scope: what fills the
lower halves of Home and You at 1280 × 900 and the 16-px aside offset. Growth rule check (navigation-v2.md §4.2):
every addition below is a card or a card variant on an existing hub; no new tab, no new route, no new chart.

## 1. Measured state

`UI-NAV-3-home-1280-light-data.png` (1280 × 900, seeded): column x 64–696: Up-next card y 81–268 (187), This
week 286–416 (130), Latest activity 433–531 (98); **column bottom 531, 369 px empty**. Aside x 754–1248: HealthModule
65–299 (234), "Programs due" label 318, row 343–411; **aside bottom 411**. Aside first card top 65 vs column 81 → the
16-px offset; aside left edge 754 vs hairline 752 → the Home aside has no horizontal padding either.
`UI-NAV-1b-you-1280-light.png` (1280 × 800): left column Account 76–173 (97), Insights 198–417 (219), About
442–587 (145); right: rings card 76–361 (285), Setup 384–596 (212); **bottoms 587 / 596, ≈ 204 px empty at 800, ≈ 304 at 900**.

Code (grep at dispatch, `apps/mobile`):
- `app/(tabs)/home.tsx`: column = `UpNextCard`, `ThisWeekCard`, `LatestActivityCard` (`Option latest`); aside =
  `<View style={{ gap: space.lg }}>` with `HealthModule`, `TodayPrograms`. No padding on that View.
- `app/(tabs)/you.tsx`: `Page wide` + `Columns split="6/6"`: main = Account · Insights · About (desktop); side =
  `ThisWeekCard variant="rings"` · Setup.
- `src/ui/Page.tsx`: the main body is a `ScrollView` with `contentContainerStyle paddingVertical: space.lg` (16);
  the `role="complementary"` View renders `{aside}` with only `borderLeftWidth`, no padding → the offset.
  Other asides pad themselves: `train/PlanView.tsx` `contentContainerStyle={{ padding: gutter.desktop, paddingTop:
  space.lg }}`, `app/progress/index.tsx` same, `TodayReady.tsx` `padding: gutter[breakpoint], paddingTop: space.xl`.
- Reusable cards: `components/review/ReviewCards.tsx` `WeekChartCard({days, today})` (`ReviewCard` "Eaten vs burned"
  wrapping `health/DayBars`, `DAY_BARS_HEIGHT` = 164), `TrackerCard({tracker})` (null without Garmin rows),
  `TrainingCard`, `NutritionCard`; `components/feed/ActivityCard.tsx` `ActivityCard({activity, onPress, selected?})`,
  `ImportedCard({activity, onPress})`; `week/ThisWeekCard.tsx` `variant: "tiles" | "rings"` (owns the `useWeekReview`
  read). Feed read: `hooks/useFeed.ts` `useFeed(limit)` → `HistoryState<ReadonlyArray<FeedItem>>`; Home's
  `useTodayFeed` (`hooks/useStartWorkout.ts`) already reads `DONE_LOOKBACK` = 10 items and exposes `done` + `latest`.
  Progress has no reusable card (`Sparkline`/`WeekBars` live inside `ExerciseDetail`): not used here.

## 2. Home 1280 (seeded user; viewport 900)

```
column 696 (inner 632)                     | aside 496 (inner 432 after DESK-0)
Up next card                        187    | HealthModule                        234
This week (tiles)                   130    | Programs due                         93
Recent activity   caption + "See all" 44   | Eaten vs burned (WeekChartCard)    ≈240
  ActivityCard / ImportedCard ×3  ≈150 each| Activity (TrackerCard, Garmin only) ≈130
bottom ≈ 16+187+16+130+16+44+8+3·150+2·16  | bottom ≈ 16+234+16+93+16+240 = 615
       = 899 (≥ 820 even at 130/card: 839) |        (+16+130 = 761 with Garmin)
```

- **Recent activity** (desktop only; phone keeps `LatestActivityCard`): the newest 3 feed items from the SAME read
  (`useTodayFeed` gains `recent: ReadonlyArray<FeedItem>` = `Arr.take(state.value, 3)`), rendered as the Activity
  tab's `ActivityCard` (`session`) / `ImportedCard` (`imported`), `onPress` = the routes `LatestActivityCard` already
  uses; a caption row above ("Recent activity", `headingLevel={2}`, `Button size="sm" variant="text"` "See all" →
  `/activity`). Zero items → the whole section is absent (no empty card). Strava's home is its feed; this is the
  desktop-only slice of it.
- **Eaten vs burned** in the aside under Programs due: `WeekChartCard` from `/review`. Needs `ReviewSummary`: Home
  lifts the week read — `useWeekReview(weekStartFor(localDateOf(new Date())))` once in `HomeScreen`, passed as
  `summary` to `ThisWeekCard` (new prop, see §3) and `WeekChartCard days={summary.days} today={localDateOf(new Date())}`.
  Hidden when the week has no data: `Arr.every(summary.days, (d) => d.eaten.kcal === 0 && Option.isNone(d.burned))`
  (`ReviewSummary.days: ReadonlyArray<DayTotals>`, `grep -n "readonly days" apps/mobile/src/components/review/reviewMath.ts`; `DayTotals` = `grep -n "export const DayTotals" packages/shared/src/nutrition.ts`,
  `eaten: Totals{kcal}`, `burned: OptionFromNullOr(Kcal)`; writer `NutritionRepo.week` behind `WeekReviewRepo` (`useWeekReview.ts`),
  `grep -rn "WeekReviewRepo\b" apps/mobile/src --include=\*.ts -l` and `grep -n "week" apps/mobile/src/services/NutritionRepo.ts`). Put the
  predicate in `reviewMath.ts` as `weekHasNutritionData(days)` with a test. Loading/Failed → absent.
- **Activity** tiles: `TrackerCard tracker={summary.tracker}` (already null without Garmin).
- Aside stays a plain `View` (no ScrollView): worst case 761 + 16 < 900; at 900 × 800 with Garmin it overflows by
  ≈ 0 — VERIFY at 1024 × 800 that the aside does not clip; if it does, wrap in `ScrollView` like PlanView.

## 3. You 1280

```
left 6/6 (Account · Insights · Setup)      | right (This week rings+chart · About)
Account 97 · Insights 219 · Setup 212      | rings card 285 + DayBars 16+164 = 465 · About 145
bottom = 76+97+25+219+25+212 = 654         | bottom = 76+465+23+145 = 709
```
- `ThisWeekCard` takes `summary: ReviewSummary` (the hub reads it once) and `variant="rings"` grows: after the
  `StatRow`, `DayBars days={summary.days} today={…}` inside the same card (one card, no second chrome). `tiles`
  unchanged. The empty-week guard of §2 applies (DayBars omitted when no day has data; the rings card stays).
- Setup moves to the left column (rows with rows), About to the right under the stats card. Phone order unchanged:
  This week (tiles) · Account · Insights · Setup · About.
- Result at 900: 246 / 191 px empty (was 304 / 304); at 800: 146 / 91 (was 204). Honest limit: You is a hub of rows;
  the remaining gap closes only with new data surfaces (all-time totals) that no component serves today — deferred.

## 4. The 16-px aside offset and the `Page` rule

Cause: `Page.tsx` pads the main `ScrollView` content (`paddingVertical: space.lg`, `paddingHorizontal: gutter`) and
leaves the `role="complementary"` View bare; Home's aside adds nothing, the other four screens pad themselves.
Fix (DESK-0): `Page` owns the aside frame — the complementary View gets `paddingTop: space.lg, paddingHorizontal:
gutter.desktop` — and the four self-padding asides drop their top and horizontal padding (`PlanView.tsx` (`contentContainerStyle` of the aside ScrollView),
`progress/index.tsx` (same) keep `paddingBottom: space.lg` only; `TodayReady.tsx` (`AsideColumn` ScrollView `paddingTop: space.xl`) keeps `gap` + `paddingBottom`;
`activity.tsx` aside: same, and its first feed header takes `marginTop: space.lg` instead of `space.xl`; the desktop
`ExpandedFilterBar` in `library/CatalogFilterBar.tsx` takes `paddingTop: space.lg` so the search field meets the aside's top). Rule (write into `Page`'s doc comment and `apps/mobile/CLAUDE.md` Layout):
*an aside never sets its own top or horizontal padding; `Page` aligns its first child with the column's first child.*
Proof: on `/home`, `/train?view=plan`, `/progress`, `/activity` the first card inside `[role=complementary]` has the
same `getBoundingClientRect().top` as the first card inside `[role=main]` (±1), and `left` = hairline x + 1 (its width) + 32
(785 at 1280 for 7/5, 585 for 5/7).

## 5. Empty-state behaviour

Signed-in empty account (no sessions, no food, no Garmin): Home column = Up-next (its Empty state with Start a
workout) + This week (zeros, as today); no Recent activity section, no chart, no tracker card. Aside = HealthModule
(its own no-data rows) + Programs due. Page is short by design — no "nothing yet" cards. You: rings card without
DayBars. Seeded (signed-out demo seed) is the owner's judging case: §2/§3 numbers hold there (feed has ≥ 3 sessions;
VERIFY the seed writes `daily_health`/`food_entry` rows for the current week, else the chart is absent in the demo —
`grep -rln "seed" apps/mobile/src/services` then `grep -n "food_entry\|daily_health" <that file>`; if absent, DESK-1 captures with a signed-in account that has this week's food rows and says so).

## Briefs

### DESK-0 — aside frame owned by `Page` (opus, box 12)
Files: `src/ui/Page.tsx`, `src/components/train/PlanView.tsx`, `src/components/train/LibraryView.tsx`,
`src/components/TodayReady.tsx`, `app/progress/index.tsx`, `app/(tabs)/activity.tsx`, `apps/mobile/CLAUDE.md` (Layout line).
Facts: §1 + §4 above; `grep -rn "aside={" apps/mobile/app apps/mobile/src` is the full inventory (5 suppliers).
Do: §4 fix; every aside supplier loses its own top/horizontal padding; nothing else moves. Permissions: edits only
the listed files; never stage or commit.
Done-when: `pnpm check` green; agent-browser at 1280 × 900 on `/home`, `/train?view=plan`, `/train?view=library`,
`/progress`, `/activity`: first-card tops in `[role=main]` and `[role=complementary]` equal ±1 and aside first-card
`left` = 752 + 32 = 784 (print the five pairs); 390 untouched (one 390 screenshot of `/home` identical in layout).
Time box: 12 min.

### DESK-1 — Home desktop lower half (opus, box 15, after DESK-0)
Files: `app/(tabs)/home.tsx`, `src/hooks/useStartWorkout.ts` (`useTodayFeed.recent`), `src/components/week/ThisWeekCard.tsx`
(`summary` prop; also edits `you.tsx`'s call site to pass it — coordinate: DESK-2 runs after), `src/components/today/HomeCards.tsx`
(new `RecentActivity` section component beside `LatestActivityCard`).
Facts: §2; `ActivityCard`/`ImportedCard` props in §1; `WeekChartCard`, `TrackerCard` in `review/ReviewCards.tsx`;
`useWeekReview` signature in `src/hooks/useWeekReview.ts`; `.claude/rules/react.md` (no Button inside a pressable row;
sentence case). Permissions: listed files only; never stage or commit.
Do: §2 wireframe exactly; desktop-only branches on `useBreakpoint() === "desktop"`; the empty guards of §2/§5.
Done-when: `pnpm check` green; 1280 × 900 seeded: `[role=main]` last card bottom ≥ 820 and `[role=complementary]`
last card bottom ≥ 600 (print both), no overlap, `document.querySelectorAll("h1").length === 1`; 390 Home unchanged
(LatestActivityCard still there); empty signed-in account: no Recent activity heading, no chart. Screenshots
`docs/design/screens/nav-v2/DESK-1-home-1280-{light,dark}-data.png` + 390.
Time box: 15 min.

### DESK-2 — You desktop columns (opus, box 12, after DESK-1)
Files: `app/(tabs)/you.tsx`, `src/components/week/ThisWeekCard.tsx` (`rings` + DayBars).
Facts: §3; `DayBars({days, today})` in `src/components/health/DayBars.tsx`; `ThisWeekCard` takes `summary` after DESK-1.
Permissions: listed files only; never stage or commit.
Do: §3 column order; DayBars inside the rings card under the StatRow with `space.lg` above; phone order unchanged.
Done-when: `pnpm check` green; 1280 × 900 seeded: left column bottom ≥ 640, right ≥ 700, bottoms within 60 px (print
both); 1280 × 800 no overlap, both columns end ≤ 800 or scroll cleanly; one h1; 390 You screenshot shows This week
(tiles) · Account · Insights · Setup · About. Screenshots `DESK-2-you-1280-{light,dark}.png` + 390.
Time box: 12 min.

### DESK-R — review DESK-0..2 (opus reviewer, box 10): the §4 rule holds in every aside supplier, one week read per
hub screen (`grep -rn "useWeekReview(" apps/mobile/app apps/mobile/src/components` → Home, You, review only), no
legacy branch, the pixel proofs are in the reports.
