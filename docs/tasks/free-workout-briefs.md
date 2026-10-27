# Free workout briefs (FREE-D → Lead, 2026-10-27 18:26)

Design `docs/design/free-workout.md`, ADR-0028. No schema change on D1: no FREE-2.
Permissions line for every brief: write only the files listed; no `git`, no `pkill`, no cloud calls;
start wrangler/expo by pid file per `apps/mobile/CLAUDE.md` Commands.

## FREE-1 — Start a workout, free Today, Library add (engineer / opus, time box 20 min)

Files: `apps/mobile/src/store/migrations.ts` (v7), `apps/mobile/src/services/TodayRepo.ts` (+ its
tests `TodayRepo.addExercise.test.ts`, new cases in `TodayRepo.test.ts`), `apps/mobile/src/hooks/useToday.ts`,
`apps/mobile/src/services/addCatalogToToday.test.ts`, `apps/mobile/src/library/{addToToday.ts,
addToToday.test.ts,CatalogDetail.tsx}`, `apps/mobile/app/(tabs)/{today.tsx,library.tsx}`,
`apps/mobile/src/ui/EmptyState.tsx` (one optional prop), `apps/mobile/src/components/today/FreeFooter.tsx`
(new; pure text, if any, in `freeWorkoutCopy.ts` beside it), `apps/mobile/CLAUDE.md` (Layout + store lines).
Facts (grep-verified 18:23): `TodayRepo.ts` `openSession(plannedSessionId: Option)` reuses the unplanned
session started today; `logSet` creates it with `plannedSessionId: Option.none()` when `plannedSessionToday`
is None; `addExercise` returns `"noSession"` when no planned session (`TodayRepo.addExercise.test.ts:176-182`
pins it); `ExercisePage.tsx` `progressText` has the `planned === 0` branch and `plannedSetId` is
`Arr.get(item.plannedSets, n)`; `setRows.ts buildSetRows([], logged)` = logged rows; `EmptyState.tsx`
`EmptyStateAction { label, onPress }` renders `variant="secondary"` only; `today.tsx` `TodayEmpty` is
built on `todayEmptyCopy.ts` (TODAY-EMPTY's result: read the tree); `FeedRepo.ts:147` reads
`plannedSessionId` through `Arr.getSomes` (None tolerated); `packages/db/src/repositories/Session.ts`
has no `plannedSessionId` filter (MCP lists unplanned sessions). `exerciseChoices` has no UI consumer.
Do: design §2 table, §3 contract (`Today` tagged union `Planned | Free`, `startFreeWorkout`,
`cancelFreeWorkout`, `addExercise` without `noSession`, `finishSession` deletes today's row for an
unplanned session, free prefill = last live set of the exercise), §4 rows and copy verbatim, §8 test
changes. Delete `NoSession`/`NO_SESSION_TITLE` outright (Amendment 23).
Done when: `pnpm check` green; tests: v7 applies on a v6 store; `addExercise` with no plan → `"added"`
and the row holds the id, second call `"alreadyPlanned"`; `today` → `Free` with the row's order then a
logged-only exercise; `finishSession` on the unplanned session deletes the row; free prefill from an
older session's last set. ui-check proof at 390 dark on a signed-in EMPTY store (no plan; recipe: dev
server + `EXPO_PUBLIC_DEV_USER_ID` or the isolated worker from `docs/design/reviews/UI-NUTRI-e2e.md` with
no plan seeded): Today Empty shows "Start a workout" → tap → "Workout started" state → "Add exercise" →
Library → open an exercise → "Add to today's workout" → Today pager shows it with "0 logged" → log 2
sets → "Finish workout" → Today Empty again → Feed card for the session (report its title string and the
duration); plus Library-first path: fresh day, add from Library with no workout started → Today is Free
with that exercise. Shots `docs/design/screens/UI-FREE-{1..6}-390-dark.png`; report ends with
`## Exports` (`Today`, `TodayState.Free`, `startFreeWorkout`, `cancelFreeWorkout`, `AddExerciseResult`).
VERIFY in the report: `activityText.ts` Strava title for a session with no planned session; the
installed Schema JSON-string decoder name used for `exerciseIds`.

## FREE-R — review FREE-1 (reviewer / opus, time box 8 min)

Scope: FREE-1's diff against `docs/design/free-workout.md` §3–§5 and ADR-0028. Check: no `noSession`
or `NoSession` string left (`grep -rn "noSession\|NoSession\|NO_SESSION" apps/mobile/src apps/mobile/app`
→ zero hits); the row delete runs only for `plannedSessionId` None inside the same `logLock` permit;
`Free` exercises order = row then logged-only; `cancelFreeWorkout` is reachable only from the
zero-exercise state; `EmptyState` existing callers unchanged (default secondary); copy sentence case,
no `textTransform`; `TodayState` matched exhaustively (`Match.tagsExhaustive`) in `today.tsx`; CLAUDE.md
Layout/store lines updated (v7, `free_workout`, Today Free). Verdict APPROVE / REQUEST CHANGES with
file:symbol per finding.

## Amendment 29 paragraph (Lead pastes into docs/plan.md)

29. **Free workouts** (2026-10-27 18:16, owner, verbatim): "Also I dont get what is the point of
   library. I get error what todays session not started. How to start days session?" Lead reading:
   a session must not depend on a Claude-written plan — Today's empty state gets a primary "Start a
   workout", the Library's add starts today's workout when none is planned (the "No session planned
   today" dead end is removed), Today shows a free workout with the same pager, steppers and Finish
   flow, prefilled from the exercise's last logged set; the intended-exercise list is device-local
   (store table `free_workout`), the session and its sets sync and reach the feed, MCP and Strava as
   every other session; a planned session still wins the day. The Library is the exercise catalog
   (browse by muscle and equipment, see what the active location allows, add to today's workout)
   (ADR-0028, `docs/design/free-workout.md`, `docs/tasks/free-workout-briefs.md`).
