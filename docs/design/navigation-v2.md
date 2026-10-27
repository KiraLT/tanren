# Navigation v2 — information architecture for a growing app

Status: accepted (owner ask 2026-10-27 18:30, plan Amendment 30; Merge confirmed by the owner 19:07, ADR-0029 amended: the Feed tab is named **Activity** ("Call Activity"), no Start button in the tab bar) · Architect: NAV-D · Research:
`docs/research/2026-10-27-navigation-ia.md` · Mockups: `docs/design/screens/nav-v2/contact-sheet.html` ·
Briefs: `docs/tasks/navigation-briefs.md`. Pairs with ADR-0014 (design system), ADR-0017 (feed),
`free-workout.md` (FREE-D, Start a workout, in flight).

## 1. Problems with the five tabs today

`APP_NAV` when this was written (`apps/mobile/src/ui/appNav.ts`): Feed (now Activity) · Today · Plan · Programs · Library.

1. **The bar is full.** Five slots, all pages; FREE-D's "Start a workout", a weekly review, running, more
   integrations have nowhere to go but deeper behind existing pages.
2. **Daily controls hide behind a gear on another tab.** Settings and Progress are `IconButton`s in the **Activity**
   AppBar only (`app/(tabs)/activity.tsx`); Health opens only by tapping Today's health card (`HealthModule`);
   Integrations and Nutrition are two levels under Settings. A user on Today cannot reach Progress in one tap.
3. **Three tabs answer the same question** ("what do I train?"): Plan (Claude's week), Programs (guided days),
   Library (catalog). Today already shows the plan day and the due program day; Plan and Programs are reference
   pages for a daily tab's content. The owner's 18:16 confusion ("what is the point of library") is this split.
4. **No "You".** Profile, goals, equipment per location, integrations, legal/About, progress and health are scattered
   under Settings and the Activity bar; there is no place that is *about the user*.
5. **Desktop mirrors the problem**: `AppBar` renders the same five links, so a growing app widens the bar.

## 2. Directions

Every direction keeps: Forge tokens, `AppBar` with `APP_NAV` at desktop, the root Stack routes (`activity/*`,
`library/[catalogId]`, `programs/*`, `progress/*`, `settings/*`, `health/*`, `privacy`, `terms`) unchanged, and
the external deep links `/settings`, `/settings/integrations`, `/privacy`, `/terms` (the only app paths the
Worker emits: `grep -rhoE 'tanren\.me/[a-zA-Z/_-]*' apps/worker/src packages/shared/src` — no link to
`/plan`, `/programs`, `/library`, so those can move without redirects).

### Direction A — "Strava shape": 4 pages + a centre action

Tabs: **Home · Activity · [Start] · Train · You** (`APP_NAV` 4 links + an action slot rendered by the tab bar, not a route).

| destination | route | contains |
| --- | --- | --- |
| Home | `(tabs)/home.tsx` | today's planned session card (TodayReady summary) and due program days, the health module, a "Start" card when nothing is planned, the latest feed item as a teaser |
| Activity | `(tabs)/activity.tsx` | as today (chronological cards); AppBar loses the gear and chart buttons |
| Start (action) | tab-bar button, opens `start` sheet (FREE-D) | planned session (if any) · program day (if due) · free workout · quick-add food |
| Train | `(tabs)/train.tsx` | `SegmentedControl` Plan · Programs · Library (3 options ≤ 358, §Control capacity) with `?view=` deep link; content = today's `PlanWeek`, `ProgramHome`, `CatalogList` unchanged |
| You | `(tabs)/you.tsx` | header (name, goal, this-week strip), `ListGroup` rows: Progress (`/progress`), Health (`/health`), Weekly review (new), Nutrition goals (`/settings/nutrition`), Equipment & locations, Integrations (`/settings/integrations`), Settings (`/settings`), About (privacy, terms, sign out) |

New feature → a card on Home, a row in You, or an option in the Start sheet. Running → a Start option + feed cards.
Desktop 1280: `AppBar` shows Home · Activity · Train · You plus a primary "Start" button at the bar's trailing edge;
Train renders the segmented page in the 600 column with the aside showing the active enrollment / week stats.

### Direction B — "Garmin shape": summary + hubs + More

Tabs: **Today · Activity · Health · More**.

| destination | route | contains |
| --- | --- | --- |
| Today | `(tabs)/today.tsx` | unchanged content, plus a primary "Start a workout" button in the hero (FREE-D) |
| Activity | `(tabs)/activity.tsx` | as today, no AppBar buttons |
| Health | `(tabs)/health.tsx` | current `/health` page promoted (rings, steps, protein, weekly bands), Progress rows and the weekly review below |
| More | `(tabs)/more.tsx` | a 2-column tile grid: Plan, Programs, Library, Progress, Nutrition, Integrations, Equipment, Settings, About |

New feature → a tile in More or a card on Today. Running → a tile and feed cards. Desktop: the same four links; More
becomes a left-rail index page (tiles in the 600 column, aside = sync status + account).
Weakness: "More" is a junk drawer by design (Garmin's own users complain), and Plan/Programs/Library — the owner's
training content — fall two taps deep.

### Merge — recommended: 4 tabs, Start as the hero of Home and Train

Tabs: **Home · Train · Activity · You** (icons `home`, `dumbbell`, `flame`, `user`; all exist in `iconPaths.ts`).

| destination | route | contains (top → bottom at 390) |
| --- | --- | --- |
| Home | `(tabs)/home.tsx` | AppBar "Home" (date as eyebrow) · **Up next** card: planned session or due program day with a primary "Start" pill; if neither, the FREE-D start card ("Start a workout" primary + "Pick a program" secondary) · `HealthModule` (unchanged, states per health-module.md §6) · "This week" strip (sessions done / planned, volume) · latest feed card teaser ("See all" → Activity) |
| Train | `(tabs)/train.tsx` | AppBar "Train" with trailing primary "Start" (`Button` size md; **arrives with NAV-3**, which builds the shared start flow, see "As built") · `SegmentedControl` Plan · Programs · Library (`?view=plan\|programs\|library`, default `plan` when a plan week exists else `programs`) · the existing `PlanWeek` / `ProgramHome` / `CatalogList` bodies |
| Activity | `(tabs)/activity.tsx` | unchanged cards; AppBar trailing = none (gear and chart removed) |
| You | `(tabs)/you.tsx` | AppBar "You" (gear → `/settings`) · profile header card (name, goal label, active location pill) · stat tiles: this week sessions · volume · streak (3 tiles 103 px each, see §7) · `ListGroup` "Insights": Progress → `/progress`, Health → `/health`, Weekly review → `/review` (new, N-S4 data) · `ListGroup` "Setup": Nutrition goals → `/settings/nutrition`, Equipment & locations → `/settings` (location section) , Integrations → `/settings/integrations` · `ListGroup` "About": Privacy, Terms, Sign out |

**No Start button in the tab bar** (owner 19:07). Where Start lives: the one primary control on Home's Up-next card and on Train's AppBar; both open the FREE-D start
flow (planned session → `/today`-equivalent player; program day → `programs/play`; free → `TodayRepo.openSession`).
Why not a centre action slot (A): Tanren's start is almost always "the planned thing", which Home already shows as a
card; a permanent Record button duplicates it and costs the fifth slot forever. The slot stays **reserved** (§4).

### As built (2026-10-27, NAV-2 and NAV-4 reports; where this section and the tables above differ, this section wins)

- **Train hub (NAV-2, 19:02).** `app/(tabs)/train.tsx` = AppBar "Train" + `SegmentedControl` Plan · Programs · Library.
  `?view=plan|programs|library` picks the segment (`TRAIN_VIEWS`, `trainViewFor` in
  `src/components/train/trainView.ts`); without the param: Plan while the week loads or has days, otherwise Programs.
  A plain `/train` keeps no query; tapping a segment writes it with `router.setParams`. Bodies moved unchanged to
  `src/components/train/{PlanView,ProgramsView,LibraryView}.tsx`; `(tabs)/{plan,programs,library}.tsx` deleted, no
  redirects.
- **Train AppBar trailing slot.** NAV-2 shipped **without** Start: the slot holds Programs' "New program" button
  (Programs segment only) or a 44 px spacer in the other segments, so the bar is 61 px in every segment. Train's Start
  pill arrives with **NAV-3**, which builds the shared start flow (planned session, then due program day, then free
  workout; FREE-D, ADR-0028). VERIFY in NAV-3 how Start and "New program" share the slot (Start wins outside the
  Programs segment).
- **Weekly review (NAV-4, 19:05).** Root-Stack route `/review` (`app/review.tsx`, AppBar "Weekly review"): the current
  local Mon-Sun week with a previous-week control; Training / Nutrition / Activity (tracker; only when the week has
  daily-health rows) cards plus the shared `InsightList`. Data: `WeekReviewRepo.week(weekStart)` through
  `useWeekReview`. The week is component state, not a `?week=` param. Reachable from Settings ("Insights" section,
  `ListRow icon="chart" title="Weekly review" chevron onPress={() => router.push("/review")}`) until NAV-1 moves the
  row into You.
- **`APP_NAV` today** (`apps/mobile/src/ui/appNav.ts`): `today` (label Home, icon `home`) · `train` (`dumbbell`) ·
  `activity` (`flame`). NAV-1 appends `{ name: "you", href: "/you", label: "You", icon: "user" }`; NAV-3 renames
  `today` to `home`.

## 3. Desktop (1280) treatment of the merge

`AppBar` renders Home · Train · Activity · You (same `APP_NAV`), plus (NAV-3) `Button variant="primary" size="sm"` "Start" at
the trailing edge (hidden on `/train`, whose own bar has it — one Start per screen). Content column 600
(`sizes.contentMaxWidth`, `tokens.ts`), aside 480 (`sizes.asideMaxWidth`), gutter 32 (`gutter.desktop`), sum
600 + 32 + 480 = 1112 ≤ 1216 content width (1280 − 2·32). Per route: Home = column (Up next, week strip, feed
teaser) / aside (HealthModule, due programs); Train = column (segmented body) / aside (active enrollment card or
the week's muscle map); Activity unchanged (feed.md §5); You = column (header, tiles, groups) / aside (Progress sparkline
card + Health tiles, both links). Loading/Empty/Failed states of every tab keep the same frame (`wide` column +
empty aside), never a different width (UI-D rule d).

## 4. Growth rules (next 12 months)

1. **Four tabs, one reserved slot.** A fifth tab is added only for a *mode* the owner uses most days (Running, when
   it ships, is a Start option and a Train segment first; it earns the slot only if the owner records runs in Tanren
   rather than importing them).
2. **A feature is a card, a row or a segment — never a tab.** Home card (daily value), You row (about the user),
   Train segment (training content, ≤ 4 options; a 5th becomes `ToggleChips`), Settings row (configuration).
3. **One Start per screen**, always the primary pill; it never moves into a tab icon.
4. **Deep links are stable**: route files under `app/` keep their paths; a hub's view is a query param
   (`/train?view=library`) so Settings, MCP outputs and emails can link to one state.
5. **AppBar trailing slot holds at most one action** (Start, gear, or a filter), never a toolbar.
6. **Desktop = the same `APP_NAV`**; no desktop-only destinations.

## 5. Migration plan (route moves, order, boxes)

| step | task | files | notes |
| --- | --- | --- | --- |
| 2 | NAV-1 You hub + Activity bar cleanup (after NAV-2) | `src/ui/appNav.ts` (append `you`), `(tabs)/you.tsx` (new), `(tabs)/activity.tsx` (remove gear/chart buttons) | `APP_NAV` = today("Home") · train · activity · you; no screen content moves. Can run **before** FREE-D lands. |
| 1 | **done 19:02** NAV-2 Train hub (first: Plan has no link to Programs or Library, so they must not leave the registry before Train exists) | `(tabs)/train.tsx` (new), delete `(tabs)/plan.tsx`, `(tabs)/programs.tsx`, `(tabs)/library.tsx`; `programs/index.tsx`? **No**: `/programs` has no external link; in-app `router.push("/programs")` sites move to `/train?view=programs` (`grep -rn '"/programs"\|"/plan"\|"/library"' apps/mobile/src apps/mobile/app`). | Bodies are the existing components; no behaviour change. |
| 3 | NAV-3 Home | rename `(tabs)/today.tsx` → `(tabs)/home.tsx`; Up-next card = FREE-D's start card + `TodayReady` summary; `grep -rn '"/today"' apps/mobile` → `/home`. | Depends on FREE-D's `start` flow symbols (file condition: `docs/design/free-workout.md` final and FREE-1 reported). |
| 4 | **done 19:05** NAV-4 Weekly review page | `app/review.tsx`, `src/components/review/*` | built in this round (owner 19:07); the row lives in Settings until NAV-1 moves it into You (no placeholder row). |
| 5 | NAV-R review, NAV-Q ui-check matrix | — | all routes of `apps/mobile/CLAUDE.md` Layout at 390/1280 light/dark. |

Without touching screens: step 1 (registry, You hub, Activity bar cleanup) and the desktop AppBar Start button.
No legacy (Amendment 23): old tab files are deleted in the same change; no redirect routes for `/plan`, `/programs`,
`/library`, `/today` (no external links — grep above; the PWA home-screen start URL is `/`, `index.tsx` redirects).
`expo-types.d.ts` (typed routes, committed) is regenerated in each step.

## 6. Home state matrix (merge)

Writers: `useToday` (`src/hooks/useToday.ts`, `TodayState` = Loading | Empty | Failed | Ready{plannedSession,
session: Option}); `useDueToday` (`src/components/TodayPrograms.tsx`, `ReadonlyArray<ActiveProgram>`);
`useHealthModuleShown` (`src/components/today/HealthModule.tsx`, `state._tag === "Ready" && !moduleHidden(day)`);
FREE-D's open free session (`TodayRepo.openSession`, plannedSessionId None — VERIFY the hook name FREE-1 adds).

| row | condition (all must hold) | neighbours kept out by |
| --- | --- | --- |
| Loading | `today._tag === "Loading"` | every other row needs a resolved tag |
| Up next: plan | `today._tag === "Ready"` and `session` is `None` | "in progress" needs `Some` session; "program" row needs `Ready` false |
| In progress: plan | `Ready` and `session` is `Some` with `finishedAt` None (today's open session) | finished sessions move to Activity, Home shows "Done today" summary |
| Up next: program day | `today._tag === "Empty"` and `useDueToday().length > 0` | `Ready` → plan rows win; the due list is the second card when both hold |
| In progress: free | `today._tag === "Empty"` and FREE-D's open free session is `Some` | `Ready` wins; `dueToday` empty or not, the free card is first |
| Start card (empty) | `today._tag === "Empty"`, `dueToday.length === 0`, no open free session | — |
| Failed | `today._tag === "Failed"` | shows `EmptyState icon="warning"`; health module still renders if shown |
| Health module | `useHealthModuleShown()` true, independent of the rows above; its own states are health-module.md §6 | — |

## 7. Width arithmetic (390, gutter 16 → 358 content)

- You stat tiles: 3 × 106 + 2 × 12 (`space.md`) = 342 ≤ 358 ✓ (tile = `StatRow variant="tile"`, caption + headline).
- Train `SegmentedControl` 3 options at 358: 3 × 119 ✓ (≤ 4 options rule).
- `ListRow` two-line = 22 + 20 + 2·8 + 2 = 60; one-line = 22 + 2·11 + 2 = 46 (chevron rows in You).
- Tab bar: `sizes.tabBar` 56 + safe-area, four tabs at 97.5 each.
- Up-next card: title2 28 + subhead 20 + gap 8 + pill 48 + padding 2·16 = 136 (+ 20 if a second meta line).

## 8. Recommended pick

**Merge (Home · Train · Activity · You).** It fixes the four concrete problems in §1 with one deletion (three content
tabs become one hub), gives Settings/Progress/Health/Integrations a permanent, predictable home (You, like Strava and
Hevy), puts Start where the owner's eye already is (Home's Up-next card) without spending a slot on a Record
button he taps once a day, and leaves a fifth slot reserved for the one thing that might deserve it (Running). A's
centre action is the only real alternative; it buys nothing the Home card does not, and B hides the training content
the owner asked for in a More grid.

## Open questions
- ~~Centre Start slot (A)?~~ No: owner 19:07 "Start button does not make sense"; Start stays inside Home's Up-next card and Train's AppBar.
- ~~Weekly review in this step?~~ Yes (owner 19:07 "weekly review - yeah"); built as NAV-4, see "As built" in §2.
- ~~Rename Feed to Activity?~~ Done: owner 19:07 "Call Activity"; the route is `/activity`, `src/components/feed/` keeps its name.
