# Navigation v2 — briefs (NAV-D, 2026-10-27 18:31) — skeletons, filled after the owner's pick

Spec: `docs/design/navigation-v2.md` (merge = default pick; A/B swap the tab list in NAV-1 only) ·
Mockups: `docs/design/screens/nav-v2/contact-sheet.html` · Research: `docs/research/2026-10-27-navigation-ia.md`.
Every brief: permissions line per lead-playbook; `pnpm check` green + output in the report; screenshots 390/1280
light/dark into `docs/design/screens/nav-v2/<task>-*.png` with the ui-check recipe (own `--session`).
Order: NAV-0 → **NAV-2 first** (Train hub removes three tabs; `grep -rn '"/programs"\|"/library"'
apps/mobile/app/\(tabs\)/plan.tsx apps/mobile/src/components/PlanWeek.tsx` is empty, so Programs and Library are
unreachable the moment they leave the registry unless Train exists) → NAV-1 (You, appends the fourth entry) →
NAV-3 once FREE-1's files are final → NAV-4 (optional) → NAV-R → NAV-Q. NAV-1 and NAV-2 both edit `appNav.ts`,
so they are sequential, never parallel.
Hand-off condition for NAV-3: starts when `docs/design/free-workout.md` is final and FREE-1 has reported (file
condition, not a commit).

## Amendment 30 paragraph (Lead pastes into docs/plan.md)

30. **Navigation for a growing app** (2026-10-27 18:30, owner, verbatim): "Also I think we should be smart about
   bottom navigation cause its very limited. And overall limitations. Research strava, garmin and suggest how to
   remake navigation and pages to be easier to navigate and be more usefull. Expecially if we are planning to grow
   our functionality." Lead reading: the five content tabs (Feed, Today, Plan, Programs, Library) become four hubs
   — Home (today's session or program day with the one Start control, the health module, the week strip), Train
   (Plan · Programs · Library as segments of one page, deep-linked by `?view=`), Feed, You (progress, health, weekly
   review, nutrition goals, equipment, integrations, settings, legal) — with the fifth slot reserved; a new feature
   is a card on Home, a row in You or a segment in Train, never a tab; desktop renders the same four links plus a
   Start button in the AppBar (research `docs/research/2026-10-27-navigation-ia.md`, `docs/design/navigation-v2.md`,
   `docs/tasks/navigation-briefs.md`; pick: Merge, confirmed by the owner 19:07 with "Call Activity" (the Feed tab is renamed) and "weekly review - yeah"; ADR-0029).

## NAV-0 — ADR + pick (architect, fable, 5 min)
After the owner's word: `docs/adr/0029-navigation-hubs.md` (accepted, Lead delegation) recording the pick, the
reserved fifth slot and the growth rules (navigation-v2.md §4); fill the blank in Amendment 30. Not an engineer task.

## NAV-1 — Nav registry, You hub, Feed bar cleanup (engineer, sonnet, 25 min)
Files: `apps/mobile/src/ui/appNav.ts`, `app/(tabs)/_layout.tsx`, `app/(tabs)/you.tsx` (new), `app/(tabs)/feed.tsx`,
`src/components/you/YouScreen.tsx` (new, pure rows in `youRows.ts` + test), `apps/mobile/CLAUDE.md` Layout line,
`expo-types.d.ts` (regenerate). Read: navigation-v2.md §2 merge table (You row), §3, §7.
- Runs after NAV-2: `APP_NAV` is then `today` (`label: "Home"`, icon `home`) · `train` · `feed`; NAV-1 appends
  `you` (icon `user`) as the fourth and last entry. Four tabs from here on; NAV-3 only renames `today` → `home`.
- You: AppBar "You" trailing gear → `/settings`; profile header card; three `StatRow variant="tile"` tiles (sessions
  done/planned, volume, streak — data from `HistoryRepo`, grep `weekStartOf`); `ListGroup`s Insights / Setup /
  About exactly as the merge table; "Weekly review" row → `/review` ships with NAV-4 in the same round (add the row in NAV-4, not before the page exists).
- Feed AppBar: remove the gear and chart `IconButton`s (`grep -n "settings\|chart" app/(tabs)/feed.tsx`).
- Rename Feed to Activity (ADR-0029): `git mv app/(tabs)/feed.tsx app/(tabs)/activity.tsx`; `APP_NAV` entry `{name: "activity", href: "/activity", label: "Activity", icon: "flame"}`; AppBar title and desktop link say Activity; `app/activity/[sessionId].tsx` and `activity/imported` stay (VERIFY no route clash). Files: `grep -rniE "feed" apps/mobile/app apps/mobile/src --include=*.tsx -l`; rename only the tab, route and visible labels, not `FeedRepo` or feed domain code. No redirect from `/feed` (Worker emits none).
- Done: 390/1280 light/dark shots of `/you` and `/activity`; `grep -rn '"/feed"' apps/mobile/app apps/mobile/src` is empty; `document.querySelectorAll("h1").length === 1` on `/you`;
  every `ListRow` hit box ≥ 44 (`getBoundingClientRect`); `pnpm check` green.
Time box: 25 min.

## NAV-2 — Train hub (engineer, sonnet, 25 min)
Files: `app/(tabs)/train.tsx` (new), delete `app/(tabs)/plan.tsx`, `app/(tabs)/programs.tsx`,
`app/(tabs)/library.tsx`; `src/ui/appNav.ts` (first entry `today` relabelled "Home" with icon `home`, second
entry → `train` with icon `dumbbell`, `programs` and `library` entries deleted → three entries until NAV-1); every in-app push to `/plan`, `/programs`,
`/library` (`grep -rn '"/programs"\|"/plan"\|"/library"' apps/mobile/app apps/mobile/src`) → `/train?view=…`;
`apps/mobile/CLAUDE.md` Layout; `expo-types.d.ts`.
- `SegmentedControl` Plan · Programs · Library in a 358 row; `?view=` param is the source of truth
  (`useLocalSearchParams`), default `plan` when `usePlanWeek` is Ready-with-days else `programs`.
- Bodies are the existing `PlanWeek`, `ProgramHome`, `CatalogList` components unchanged; AppBar "Train" trailing
  primary "Start" (`Button size="sm"`) → FREE-D's start flow if landed, else omitted (named in the report).
- No redirect files for the deleted routes (navigation-v2.md §5: no external links; Amendment 23).
- If NAV-2 runs first it renames the tab and route too (the rename above, once; whichever of NAV-1/NAV-2 runs first does it, the other verifies).
- Done: `/train`, `/train?view=programs`, `/train?view=library` open; `programs/[programId]` detail still reachable
  from the Programs segment; shots 390/1280 light/dark; `pnpm check` green.
Time box: 25 min.

## NAV-3 — Home (engineer, sonnet, 30 min) — starts when FREE-D's files are final
Files: rename `app/(tabs)/today.tsx` → `app/(tabs)/home.tsx`; `src/components/today/UpNextCard.tsx` (new);
`src/ui/appNav.ts` (first entry → `home`); `grep -rn '"/today"' apps/mobile` → `/home`; `apps/mobile/CLAUDE.md`;
`expo-types.d.ts`; `src/ui/AppBar.tsx` (desktop trailing Start button, hidden on `/train`).
- State matrix navigation-v2.md §6 row by row; Up-next card = planned session (TodayReady summary + Start pill →
  the existing exercise pager) | due program day (→ `programs/play`) | FREE-D start card; then `HealthModule`,
  "This week" strip (same `HistoryRepo` numbers as You), latest activity card teaser (`FeedRepo`, first item, "See all" →
  `/activity`).
- Done: one shot per §6 row (seed via `src/store/seed.ts` states named in the report); 1280 shows column + aside as
  §3; `pnpm check` green.
Time box: 30 min.

## NAV-4 — Weekly review page (engineer, sonnet, 25 min) — IN this round (owner 19:07)
Files: `app/review.tsx`, `src/components/review/*`, You row "Weekly review". Data: `get_week_review`'s shared
schema (`grep -n "export const WeekReview" packages/shared/src/*.ts`) through the local store — VERIFY the mobile
read path exists; if not, this is a design question for the Lead, not an engineer guess.
Time box: 25 min.

## NAV-R — Review (reviewer, opus, 15 min)
Diff of NAV-1…NAV-3 against navigation-v2.md: deleted tab files, no redirect shims, `APP_NAV` four entries, §6
rows, hit boxes, heading levels, react.md rules. Blocks on any leftover push to a deleted route.

## NAV-Q — UI matrix (qa, sonnet, 15 min)
Every route of `apps/mobile/CLAUDE.md` Layout at 390 and 1280, light and dark, after NAV-R: tab count 4, Start
present exactly once per screen, old URLs `/plan` `/programs` `/library` `/today` resolve to NotFound (expected),
`/settings`, `/settings/integrations`, `/privacy`, `/terms` unchanged. Shots to the owner's gallery.
