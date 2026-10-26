# Team sheet: feed (v4 activity feed)
Charter: Lead, 2026-10-26 21:24, 120 min hard timeout. Tasks and contracts: `docs/tasks/v4-feed.md` (normative: `docs/design/feed.md`, ADR-0017). Commits are the Lead's.

## Assumes (cross-team, from the charter)
- `desktop` pair owns `apps/mobile/src/ui/**` + `ExercisePager.tsx`; the feed uses the `src/ui` barrel as it is at each task start. Exception granted 21:5x by the Lead: FEED-5 edits `src/ui/appNav.ts` + `appNav.test.ts` only.
- `mobile-A` owns Today/Player/Plan/Programs files; `mobile-B` owns `src/library/*`, `src/components/progress/*` (except `ProgressRows.tsx` for FEED-5), `src/components/settings/*`.
- Max 2 engineers at a time; seeded local worker (16 sessions) for FEED-X screenshots.

## Tasks
| id | task | model | depends | status |
| --- | --- | --- | --- | --- |
| FEED-1 | shared Activity + buildActivity + PR math | sonnet | — | done 21:29 |
| FEED-2 | FeedRepo + hooks + progressMath re-exports | sonnet | FEED-1 | done 21:34 |
| FEED-3 | Feed screen, ActivityCard, feedGroups | sonnet | FEED-1 | done 21:38 |
| FEED-4 | ActivityDetail + `/activity/[sessionId]` | sonnet | FEED-1/2 | done 21:50 |
| FEED-5 | nav, Progress to stack route, old Sessions code deleted | sonnet | FEED-2 | done 21:55 |
| FEED-6 | desktop pass | sonnet | 3,4,5 | done 22:12 (+ ListGroup inset one-liner in flight) |
| REV-A | review of FEED-1..6 (one pass, all landed) | opus | FEED-6 | todo |
| FEED-X | QA + screenshots | sonnet | REV-A | todo |

## Decisions
- D1 `HistoryRepo.sessions`/`SessionSummary`/`useSessionSummaries` deletion moved from FEED-2 to FEED-5 (deleting earlier turned progress.tsx red). Ratified by the Lead.
- D2 FEED-2 refactored `useHistoryRead` into exported generic `useStoreRead` (one store-subscription implementation for history and feed hooks).
- D3 `formatDuration`: floored minutes; exactly 60 min "1 h"; < 1 min prints "< 1 min"; singular nouns ("1 set"); a week with no volume shows reps.
- D4 `feedSelection.ts` extra file (effectiveActivity); `detailText.ts` extra file (pure helpers, avoids loading react-native in node tests).
- D5 One-word `export` edits outside our paths: `src/illustrations/muscleMap/regions.ts` (`MUSCLE_LABEL`).
- D6 Below 1024 every split is 6/6 (live `columnsFor`), so feed.md §5's "at 900 main 364" is stale; narrow aside falls back to 2x2 tiles (`tilesPerRow`).
- D7 Pins in feed.md §5 (464/648, 72 left) predate the 1216 page; live pins at 1280: Feed 496/696, left 32; detail Columns 658/470.

## Integration checklist
- [x] `apps/mobile/src/ui/appNav.ts` · Feed first, icon flame · `pnpm -F @tanren/mobile exec vitest run appNav`
- [x] `apps/mobile/src/services/runtime.ts` · `FeedRepo.layer` in AppLayer · web boot
- [ ] Lead: add feed.md §5 pin update (see D6/D7) and ui-check dev-server recipe note (empty store now redirects to /sign-in after ADR-0019; Programs "Start day" with `EXPO_PUBLIC_PLAYER_SPEED=60` makes done activities).

## Log
- 21:24→21:29 · FEED-1 · engineer/sonnet · afaf9bda1d8d07fee · 144k · 31 tools · 1 round · done
- 21:30→21:34 · FEED-2 · engineer/sonnet · ad9b455b77796b24c · 169k · 46 · 1 · done
- 21:30→21:38 · FEED-3 · engineer/sonnet · a04f2805fdf2106e4 · 179k · 68 · 1 · done (UI proof via temporary probe route; /feed unreachable before FEED-5)
- 21:39→21:50 · FEED-4 · engineer/sonnet · aa19b58b236072d6b · 165k · 57 · 1 · done
- 21:51→21:55 · FEED-5 · engineer/sonnet · ad7b286d36b4690bf · 147k · 59 · 1 · done
- 21:56→22:12 · FEED-6 · engineer/sonnet · ab778aeed6e75d69e · 197k · 101 · 1 · done
- Note: every Agent call with `run_in_background: true` returned only when the child finished (no "Async agent launched" ack), so FEED-4/5/6 could not overlap.
