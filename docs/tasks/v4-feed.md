# v4 — activity feed: shared aggregate, FeedRepo, Feed tab, activity detail, Progress off the bar
Source: owner request 2026-10-26 21:16 (plan Amendment 8) · Status: planned · Updated: 2026-10-26 21:25 · Baseline commit: 070194b
Design: `docs/design/feed.md` (normative) · ADR-0017 (accepted, Lead delegation) · Forge `ui-direction-final.md` · columns `ui-desktop.md`

## Decisions
- ADR-0017 Activity = live session with ≥ 1 live set; Feed first tab, Progress to a stack route; shared `activity.ts` — accepted (Lead delegation)
- D1 Shared type is named `Activity` (not `SessionSummary`): the app's `HistoryRepo.SessionSummary` is deleted in FEED-2 and a distinct name avoids shadowing while FEED-2/3/4 run in parallel — accepted (Lead delegation)
- D2 Landing stays `/today`; location chip, MCP exposure deferred (ADR-0017 §Not decided)

## Tasks
| id | title | role / model | depends on | files (exclusive) | time box | status |
| --- | --- | --- | --- | --- | --- | --- |
| FEED-1 | Shared `Activity` schema + `buildActivity` + PR math moved from the app (design §1) | engineer / sonnet | — | `packages/shared/src/activity.ts`, `activity.test.ts`, `index.ts` (one export line) | 20 min | todo |
| FEED-2 | `FeedRepo` + `useFeed`/`useActivity`; `progressMath.ts` re-exports from shared; delete `HistoryRepo.sessions`/`SessionSummary`/`buildSessionSummary` and their tests; `runtime.ts` layer line (design §2) | engineer / sonnet | FEED-1 | `apps/mobile/src/services/{FeedRepo.ts,FeedRepo.test.ts,progressMath.ts,progressMath.test.ts,HistoryRepo.ts,HistoryRepo.test.ts,HistoryRepo.edge.test.ts,runtime.ts}`, `apps/mobile/src/hooks/{useFeed.ts,useHistory.ts}` | 20 min | todo |
| FEED-3 | Feed screen: `ActivityCard`, `feedGroups` (+test), `(tabs)/feed.tsx` with week sections, Load more, AppBar trailing icons, states (design §3, §6) | engineer / sonnet | FEED-1 (types); FEED-2 hooks by name ("own files green + foreign reds listed" until FEED-2 lands) | `apps/mobile/src/components/feed/{ActivityCard.tsx,feedGroups.ts,feedGroups.test.ts,ActivityStats.tsx}`, `apps/mobile/app/(tabs)/feed.tsx` | 20 min | todo |
| FEED-4 | Activity detail: `ActivityDetail` (stacked) + route `app/activity/[sessionId].tsx` (design §4) | engineer / sonnet | FEED-1; FEED-2 by name as FEED-3 | `apps/mobile/src/components/feed/ActivityDetail.tsx`, `apps/mobile/app/activity/[sessionId].tsx` (the root `app/_layout.tsx` lists no `Stack.Screen`, checked 21:22: no entry needed) | 20 min | todo |
| FEED-5 | Navigation: `APP_NAV` = feed, today, plan, programs, library; `(tabs)/progress.tsx` → `app/progress/index.tsx` with the Sessions segment and `SessionRow` removed, Settings gear removed (now on Feed); `apps/mobile/CLAUDE.md` lines (design §6) | engineer / sonnet | FEED-2 (the deleted `useSessionSummaries`) | `apps/mobile/src/ui/{appNav.ts,appNav.test.ts}`, `apps/mobile/app/(tabs)/progress.tsx` (delete), `apps/mobile/app/progress/index.tsx` (new), `apps/mobile/src/components/progress/ProgressRows.tsx`, `apps/mobile/CLAUDE.md` | 20 min | todo |
| FEED-6 | Desktop pass: Feed `aside 5/7` with selected detail, `ActivityDetail layout="split"`, detail route `wide` + `Columns 7/5` (design §5) | engineer / sonnet | FEED-3, FEED-4, FEED-5 | `apps/mobile/app/(tabs)/feed.tsx`, `apps/mobile/src/components/feed/ActivityDetail.tsx`, `apps/mobile/app/activity/[sessionId].tsx` | 20 min | todo |
| FEED-R | Review: schema reuse per §1, SQL vs HistoryRepo, PR parity (moved math byte-equal), nav/route coverage, Forge tokens only, functional rules | reviewer / opus | FEED-6 | read-only | 20 min | todo |
| FEED-X | QA (`ui-check`, session `feed-x`): seeded data → Feed shows week headers and cards; card → detail → exercise row → Progress detail; In-progress card → Today; offline reload keeps the feed; `ui-measure.js` at 390 (no button < 44, text sizes ⊂ ramp), `ui-columns.js` at 1280 (main 464 / side 648 for Feed; 1072 wide for detail); the measured items under "Owner-visible measurements" below; screenshots `UI-F-feed-390-{light,dark}.png`, `UI-F-activity-390-light.png`, `UI-F-feed-1280.png`, `UI-F-activity-1280.png` to the review gallery. Data state: exported build signed in to the seeded worker (dev-server empty store only for the Empty state capture). Scheme: light for all captures, plus dark for `UI-F-feed-390-dark.png` | qa / sonnet | FEED-R clean | none (writes this Log only) | 20 min | todo |

Parallel groups: {FEED-1} → {FEED-2, FEED-3, FEED-4} (≤ 3 parallel) → {FEED-5} → {FEED-6} → FEED-R → FEED-X.
`progressMath.ts` owner: FEED-2 only. `feed.tsx`/`ActivityDetail.tsx`: FEED-3/FEED-4 until they report, then FEED-6.

## Frozen contracts (engineers do not change; a needed change is a Lead question)
- `Activity`, `ActivityExercise`, `ActivitySet`, `ActivityKind`, `ActivityStatus`, `buildActivity`, `BuildActivityInput`, `ACTIVITY_OPEN_WINDOW_MS`: design §1 field for field.
- `FeedRepo` (`activities(limit)`, `activity(id)`), `FEED_PAGE = 20`, hooks `useFeed(limit)`, `useActivity(id)`: design §2.
- Routes: `/feed` (tab file `feed.tsx`), `/activity/[sessionId]`, `/progress` (stack `progress/index.tsx`), `/progress/[exerciseId]` unchanged. `APP_NAV[0]` = Feed with icon `flame`.
- Components: `ActivityCard({ activity, onPress, selected? })`, `ActivityDetail({ activity, layout })`.
- Copy and labels: design §6 verbatim.

## Assumes (cited)
- `TodayRepo` never sets `finishedAt`; it selects the open session with `"finishedAt" IS NULL` (apps/mobile/src/services/TodayRepo.ts:192, :304 inserts `finishedAt: Option.none()`), so free sessions' duration comes from set timestamps (design §1).
- `ProgramRepo.complete` inserts a session with `finishedAt: Option.some(now)` (ProgramRepo.ts:335) and the completion row carries `sessionId` (packages/shared/src/program.ts:50), so program days are sessions.
- `markPrs` marks set i a PR iff it strictly beats every earlier set of the same exercise; the first set is never a PR (progressMath.ts:44–66; HistoryRepo `markByExercise` :117–122 groups by exercise first).
- `HistoryRepo.sessions` is used only by Progress's Sessions segment (`useSessionSummaries`, progress.tsx:92); deleting both is safe (grep before FEED-5: `grep -rn useSessionSummaries apps/mobile`).
- `MuscleMap` takes `primary`, `secondary`, `size`, `view` (MuscleMap.tsx:17–26); `MuscleMapImage` takes `catalogId`, `size`, `primary`, `secondary` (MuscleMapImage.tsx:9–16).
- `Card` has `onPress`, `selected`, `accessibilityLabel`, `padding` (Card.tsx:16–24); `ListRow` has `leading`, `subtitle`, `trailing`, `chevron`, `onPress` (ListRow.tsx:85–106); `AppBar` has `leading`, `trailing` (AppBar.tsx:30–32).
- Icon `flame` exists (iconPaths.ts:47); `Page` has `aside`, `split`, `wide` (Page.tsx:12–16); `Columns` has `split` (ColumnsView.tsx:14).

## File-name case check (architect.md Output 2a, run 21:22)
New names per target dir, lower-cased against `ls`: `packages/shared/src/activity.ts`, `services/FeedRepo.ts`, `hooks/useFeed.ts`, `components/feed/` (dir), `app/activity/` (dir), `app/progress/index.tsx`, `(tabs)/feed.tsx` — no duplicate in any dir. (`app/settings` + `app/settings.tsx` is a pre-existing Expo Router route/layout pair, not a collision.) Engineers re-run `ls <dir> | tr '[:upper:]' '[:lower:]' | sort | uniq -d` before adding any file not listed here.

## VERIFY (engineer closes against installed code; report the answer — none of these is owner-visible)
- `CARD_PADDING` value (Card.tsx:34); if ≠ 16, `ActivityCard` passes `padding={space.lg}`.
- `useHistoryRead` store-event subscription (copy it into `useFeed.ts`).
- `weekStartOf`'s week start day (progressMath.ts:76): FEED-3's `feedGroups.test.ts` pins "Week of <date>" to that function's output for a fixed date.

## Owner-visible measurements (FEED-X records the numbers in the Log; a miss is a blocking finding)
- `MuscleMap` on a card: rect height 56 and on the detail 176 at 390 (design assumes `size` bounds the height).
- Feed AppBar at 390: both trailing buttons ≥ 44 × 44 and the "Feed" title rect width ≥ 60 (not squeezed by the trailing slot).
- Card text column at 390: `title` rect width ≤ 258 and the card's inner width 326 (= padding 16).
- Tab bar at 390: five items, each label rect ≥ 12 px and no label wrapped (height ≤ 16).

## Done-criteria
### FEED-1
- [ ] `Activity` fields exactly per §1; `buildActivity` tests listed in §1 pass; `progressMath` names exist in shared with their tests moved; `pnpm check` green in `packages/shared`.
### FEED-2
- [ ] `FeedRepo.activities(20)` on the seed returns only sessions with sets, newest first, with PR counts equal to the old `HistoryRepo.sessions` for the same ids (assert in the test before deleting the old code); `activity(unknown)` → None; `grep -rn "SessionSummary\|buildSessionSummary" apps/mobile/src` finds nothing; `progressMath.ts` is re-exports + `shiftDate`/`weekStartOf` only; `pnpm check` green.
### FEED-3
- [ ] `feedGroups` tests: section keys and labels for this week / last week / older, `formatDuration` (0, 59 s, 48 min, 1 h 12 min), `formatClock`; snapshot at 390 shows ≥ 2 week headers and ≥ 5 cards on the seed; every card has the §6 label; AppBar shows `Progress` and `Settings` buttons ≥ 44 px.
### FEED-4
- [ ] Detail route renders head, map, 4 tiles, exercise rows with set lines; unknown id shows the §4 empty state; exercise row navigates to `/progress/[exerciseId]`.
### FEED-5
- [ ] Tab bar at 390: 5 items in order Feed, Today, Plan, Programs, Library; `/progress` renders the exercise list with its aside at 1280; no Sessions segment; `appNav.test.ts` updated; `pnpm check` green.
### FEED-6
- [ ] `ui-columns.js` at 1280 on `/feed` (Ready state, ≥ 1 activity): main 464, side 648, `main.left` 72; on `/activity/<id>` (Ready): one `role=main` 1072 wide with `columns-main` ≈ 611 and `columns-side` ≈ 437; at 900 Feed main 364.
- [ ] States stay single-column at 1280 (no `role=complementary`, main ≤ 600): `/feed` Loading, Failed and Empty (dev-server empty store); `/activity/<unknown-id>` not-found. `/progress` (stack route) Ready keeps its `5/7` aside as before the move.
### FEED-R / FEED-X
- [ ] Review reports no blocking finding; QA recipe above passes with the numbers in the Log and the five screenshots published to the gallery.

## Log
- 2026-10-26 21:25 · FEED-0 (architect, fable) · ADR-0017, `docs/design/feed.md`, this sheet written; no code touched.
- 21:50 · Ownership ruling (Lead): apps/mobile/src/ui/appNav.ts + appNav.test.ts are the feed team's for FEED-5 (tab swap); the desktop pair does not touch them.
