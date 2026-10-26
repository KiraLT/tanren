# ADR-0017 — Activity feed: one card per logged session, first tab, Progress leaves the tab bar

Status: accepted (Lead decision under plan Amendment 3, 2026-10-26; owner reviews asynchronously)

## Context
The owner (2026-10-26 21:16, plan Amendment 8) asked for a "Strava-like activities feed page".
Today the only chronological view is the Progress screen's "Sessions" segment: a `ListRow` per
session with `title · date · duration · sets · exercises · volume` and a `PR ×n` pill, built by
`HistoryRepo.sessions(limit)` from the local store. The tab bar already holds five items (Today,
Plan, Programs, Library, Progress; ADR-0014) and HIG caps a phone tab bar at five. Two facts shape
the design: `TodayRepo` never sets `finishedAt` (it finds the open session by `finishedAt IS NULL`,
TodayRepo.ts:192), so free-logged sessions have no stored end; and a guided-program day already
*is* a session (`ProgramRepo.complete` inserts a `workout_session` with `finishedAt` and links it
from `program_day_completion.sessionId`, ProgramRepo.ts:335, program.ts:50). Sessions carry no
location (`SessionFields`: startedAt, finishedAt, plannedSessionId, notes).

## Decision
1. **An activity is a live `workout_session` row with at least one live set.** Planned sessions,
   free workouts and guided-program days are the same card with a `kind` (`planned` | `program` |
   `free`); a program day shows a "Core-30 · Day 12" pill. Sessions without sets (abandoned starts)
   are not activities. A session with `finishedAt` None started less than 12 h ago is shown as
   "In progress" and opens Today; everything else is done.
2. **The feed is the first tab and replaces Progress in the bar: Feed · Today · Plan · Programs ·
   Library.** The app still lands on `/today` (the plan's "fast logger" path; `app/index.tsx`
   unchanged). Progress keeps its exercise list and detail as a stack route (`/progress`,
   `/progress/[exerciseId]`), reached from the Feed AppBar (`chart` icon) and from every exercise
   row in an activity detail; its "Sessions" segment is deleted (the feed supersedes it). The
   Settings gear moves from Progress to the Feed AppBar.
3. **The aggregate is a pure, shared module**: `packages/shared/src/activity.ts` exports the
   `Activity` schema and `buildActivity`, plus the PR math moved there from
   `apps/mobile/src/services/progressMath.ts` (which re-exports). The worker can serve the same
   shape to MCP later without re-deriving it.
4. **Card content**: title (planned session name, program "name · Day n", or "Workout"), date and
   start time, three stat tiles (duration, volume, sets × exercises), a composite muscle map
   (union of the exercises' catalog primary/secondary muscles) and up to four exercise
   illustrations, PR and program pills. Duration is `finishedAt − startedAt` when finished, else
   last set − first set when ≥ 2 sets, else absent.
5. **Grouping and paging**: cards grouped under week headers ("This week", "Last week", "Week of
   13 Oct") with the week's count and volume; the list grows by 20 (same `limit` pattern as
   Progress); fully offline from expo-sqlite; no network call.
6. **Web**: the Feed tab is `5/7` (list 464 / detail 648 at 1280) with the selected activity in the
   aside; `/activity/[sessionId]` is `wide` with `Columns 7/5` (ui-desktop §1).

## Consequences
- `HistoryRepo.sessions`, `SessionSummary`, `buildSessionSummary` and `SessionRow` are deleted;
  `(tabs)/progress.tsx` moves to `app/progress/index.tsx` (one segment, aside unchanged).
- `APP_NAV` changes (five entries, new first); its test and `apps/mobile/CLAUDE.md` follow.
- Exercise-page PR semantics are unchanged: PRs are still marked against the exercise's full
  local history (`markPrs`), now from the shared module.

## Not decided
- **Location chip**: needs `session.locationId` (schema, D1 + store migrations, sync, TodayRepo
  start). Deferred to a follow-up ADR; the design reserves the slot.
- **Landing on Feed** instead of Today: one line in `app/index.tsx`; owner's call.
- **MCP `list_activities`** / adding `Activity` to `get_overview`: out of scope; the shared module
  makes it a worker-only task later.

## Alternatives considered
- Six tabs (add Feed, keep Progress): over HIG's five; the bar already fills 390 at 12 px labels.
- Merge Plan into Today's week strip to free a slot: a Plan-screen refactor during a feed step;
  Progress is the smaller move and its Sessions segment is the feed's seed.
- Separate program-day cards from a `program_day_completion` read: double cards for the same
  session; the soft link already joins them.
- Date-grouped headers (Today / Yesterday / …): week headers carry a useful weekly total and match
  the plan's week rhythm; the card's own date line covers the day.
