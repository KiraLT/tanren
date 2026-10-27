# Free workout: "Start a workout" without a plan (FREE-D, 2026-10-27)

Owner, 18:16: "I dont get what is the point of library. I get error what todays session not
started. How to start days session?" Today a session exists only when Claude wrote a plan
(`write_plan_week` → `planned_session` with today's `scheduledDate`, read by
`TodayRepo.plannedSessionToday`) or a program day is due. The Library's "Add to today's session"
answers `noSession` (`TodayRepo.addExercise` → `addToToday.ts` `NoSession` → `CatalogDetail.tsx`
Banner "Plan a session for today…") and the owner has no plan. ADR-0028.

## 1. Decision in one paragraph

A **free workout** is the existing unplanned `workout_session` (`plannedSessionId` None, already
created by `TodayRepo.logSet` when `plannedSessionToday` is None and reused by `openSession(None)`
on the day it started) plus a **local-only** list of the exercises the user intends to do today.
That list is the new store table `free_workout` (local migration v7; not synced, not exported, wiped
by `AccountErasure`'s `sqlite_master` loop). Rejected: (i) in-memory list — lost on the PWA reload the
owner does constantly; (iii) an ad-hoc `planned_session` — `planned_session.planWeekId` is NOT NULL
(`packages/db/src/schema/plan.ts` `planWeekId: text("plan_week_id")` + `.notNull()`, shared
`PlannedSession` requires `planWeekId`), so it needs a plan and a week, a D1 migration, and lies to
MCP (`get_current_plan` would show a "plan" nobody wrote). Intent is device-local by nature (sets,
the only facts, sync as before); the price is that a second device shows only the exercises whose
sets are already logged, derived in §3.

## 2. Store (apps/mobile/src/store/migrations.ts, `v7`, appended to `MIGRATIONS`)

```sql
CREATE TABLE IF NOT EXISTS "free_workout" (
  "localDate" TEXT PRIMARY KEY NOT NULL,   -- shared LocalDate (YYYY-MM-DD, device zone)
  "exerciseIds" TEXT NOT NULL              -- JSON array of ExerciseId, in pager order
)
```
Raw statement, not the `table()` helper (no `userId`/sync columns: one owner per device after
re-key; the row is intent, not data). Decode with `Schema.Array(ExerciseId)` from JSON
(`Schema.fromJsonString` or `JSON.parse` → `Schema.decodeUnknownEffect`, engineer verifies the
installed name). `DataExporter` lists sync tables only, so nothing changes there.

## 3. TodayRepo contract (apps/mobile/src/services/TodayRepo.ts)

```ts
export type Today =
  | { readonly _tag: "Planned"; readonly plannedSession: PlannedSession
      readonly exercises: ReadonlyArray<TodayExercise>; readonly session: Option.Option<OpenSession> }
  | { readonly _tag: "Free"; readonly exercises: ReadonlyArray<TodayExercise>
      readonly session: Option.Option<OpenSession> }
readonly today: Effect<Option<Today>, StoreError>          // Planned beats Free (§5 row order)
readonly startFreeWorkout: Effect<void, StoreError>        // upsert today's row with [] if absent
readonly cancelFreeWorkout: Effect<void, StoreError>       // delete today's row (zero-exercise state only, §5)
readonly addExercise: (id: ExerciseId) => Effect<AddExerciseResult, StoreError>
export type AddExerciseResult = "added" | "alreadyPlanned"  // `noSession` deleted (no legacy)
readonly finishSession: unchanged signature; additionally deletes today's `free_workout` row when
  the finished session is unplanned (`plannedSessionId` None)
```
- `addExercise`: `plannedSessionToday` Some → existing planned-set path unchanged. None → read
  today's `free_workout` row (create with `[]` when absent), `exerciseIds` contains id →
  `"alreadyPlanned"`, else append and write → `"added"`. Same `logLock` permit as today.
- Free `exercises` = the row's ids in order, then every `exerciseId` of `loggedSets(openSession(None))`
  not in the row (another device / reinstall), each resolved through `exercise` rows (tombstones
  included, as `buildToday` does). `TodayExercise` for a free exercise: `plannedSets: []`,
  `loggedSets` = this session's sets for it, `restSeconds: DEFAULT_REST_SECONDS`,
  `prefill` = `prefillFor([], logged)` when `logged` is non-empty, else the exercise's last live set
  across live sessions (`SELECT ws.* FROM "workout_set" ws JOIN "workout_session" s ON s."id" =
  ws."sessionId" WHERE ws."exerciseId" = ? AND ws."deletedAt" IS NULL AND s."deletedAt" IS NULL
  ORDER BY ws."loggedAt" DESC LIMIT 1` → `{ weightKg, reps }`), else `{ weightKg: 0, reps: 0 }`.
- The pager already tolerates `plannedSets: []`: `ExercisePage.tsx` `plannedSetId =
  Option.map(Arr.get(item.plannedSets, n), …)` → None; `progressText` has the `planned === 0 →
  "${logged} logged"` branch; `setRows.ts buildSetRows([], logged)` yields logged-only rows;
  `logSet` creates the unplanned session on the first set (`existing` None → `Session.makeEffect`
  with `plannedSessionId: Option.none()`), so the session's `startedAt` is the first set (not the
  Start tap; accepted, §8).
- `useToday.ts` `TodayState` gains `Free` mirroring `Today`'s `Free`; `toTodayState` maps by tag.

## 4. Screens (copy in sentence case; widths at 390: content 358 = 390 − 2·16)

| Row | Where | Content | Height |
|---|---|---|---|
| Today Empty | `app/(tabs)/today.tsx` `TodayEmpty` | `EmptyState` keeps `todayEmptyCopy`; gains `action={{ label: "Start a workout", onPress, variant: "primary" }}` → `startFreeWorkout` then reload | Button lg = `sizes.controlLg` (`controls.ts` `lg: sizes.controlLg`; engineer reads the number, CLAUDE.md says 56) |
| Today Free, 0 exercises | `today.tsx` new `TodayFreeEmpty` | `Page header={<TodayBar />}` + `HealthModule` + `TodayPrograms` (as `TodayEmpty`) + `EmptyState icon="dumbbell" title="Workout started" body="Add exercises from the Library. Each one gets its own page here." action={{ label: "Add exercise", variant: "primary" }}` → `router.push("/library")`; under it `Button variant="secondary" label="Cancel workout"` → `cancelFreeWorkout` (no confirm: nothing is lost) | as Empty + 8 + lg |
| Today Free, ≥ 1 exercise | `today.tsx` `Free` → `TodayReady title="Workout"` | `banner={<ReadyBanner />}`, `footer={<FreeFooter session />}` = column gap 8: `Button variant="secondary" size="lg" icon="plus" label="Add exercise"` (→ `/library`) above the existing `<FinishWorkout session />` | 56 + 8 + FinishWorkout's own box |
| Library detail | `src/library/CatalogDetail.tsx` + `addToToday.ts` | Button label "Add to today's workout"; `AddOutcome` loses `NoSession`, `NO_SESSION_TITLE` and the Banner branch are deleted; `ALREADY_PLANNED_COPY` = "Already in today's workout" | unchanged |
| Library aside (1280) | `app/(tabs)/library.tsx` `EmptyState` "Pick an exercise" | body = §7 role statement | unchanged |

`EmptyStateAction` (`src/ui/EmptyState.tsx`) gains `readonly variant?: "primary" | "secondary"`
(default secondary, existing callers unchanged). Desktop: `TodayReady` wide keeps the footer under
the pager (r4 PASS); the Free zero-exercise and Empty states stay one 600 column (states never pass
`wide`/`aside`, CLAUDE.md Layout). Heading levels: `EmptyState` under `TodayBar` (an `AppBar` h1)
takes `headingLevel={2}` as the existing `TodayEmpty` does (engineer keeps whatever it passes today).

## 5. Today state matrix (condition in / out / writer)

| State | In when | Kept out of neighbours by | Writer of the condition |
|---|---|---|---|
| Loading | `useToday` read pending | — | `useToday` effect |
| Ready/Planned | `plannedSessionToday` Some (live `planned_session` with `scheduledDate` = `localToday` under an active plan) | wins over Free by order in `today` | sync pull of `write_plan_week` rows (`apps/worker/src/mcp/writeTools.ts`) |
| Free, 0 exercises | no planned session AND `free_workout` row for `localToday` exists AND §3 `exercises` is empty (row `[]` and `openSession(None)` has no live set) | Free/≥1 by `exercises.length` | row: `startFreeWorkout` (Today "Start a workout") |
| Free, ≥ 1 exercise | as above with `exercises.length ≥ 1` | — | `addExercise` from Library (appends; also creates the row when the Library is used first) |
| Empty | no planned session AND no `free_workout` row for today | — | row deleted by `finishSession` (unplanned branch, §3) or `cancelFreeWorkout`; or the local date moved on (row keyed by date) |
| Failed | `StoreError` from the read | — | store |

An open unplanned session started today with sets but no row (sets logged on another device):
Today is Empty, as it is now; the next Start creates the row and §3 derives those exercises back in.

## 6. Finish, feed, sync, MCP, Strava (no change needed; the engineer re-checks each grep)

- Finish: `TodayRepo.finishSession` (grep `finishSession` `TodayRepo.ts`) works on any open session
  with ≥ 1 set; FREE-1 adds only the row delete. `FinishWorkout.tsx` is reused as the footer.
- Feed: `FeedRepo.activities` reads `workout_session` rows regardless of `plannedSessionId`
  (`grep -n plannedSessionId apps/mobile/src/services/FeedRepo.ts` → engineer confirms zero hits or
  an Option-tolerant title; the card title for an unplanned session is whatever `buildActivity`
  derives — VERIFY and report the string in the FREE-1 proof).
- Sync: `workout_session`/`workout_set` rows push as today (`logSet` marks dirty).
- MCP: `packages/db/src/repositories/Session.ts` has no `plannedSessionId` filter
  (`grep -n plannedSessionId packages/db/src/repositories/Session.ts` → no hits, 18:23), so
  `list_sessions` and `get_overview` already return unplanned sessions.
- Strava: `apps/worker/src/integrations/ExportQueue.ts` exports a `session` change with `finishedAt`
  Some and `deletedAt` None (its doc comment, lines near "Sessions this push completed"); planned or not.
  VERIFY: `activityText.ts` title for a session without a planned session.

## 7. The Library's role (one paragraph; Library aside body at 1280, and the Lead's answer to the owner)

"The Library is the exercise catalog: browse every exercise by muscle group and equipment, see which
ones your active location allows, read the illustration and instructions, and add an exercise to
today's workout. Start a workout from Today, or add from here and Today picks it up."

## 8. Not decided / deferred

- Session `startedAt` = first logged set, not the Start tap (no session row before a set: avoids an
  empty session syncing to D1 and showing up in `list_sessions`). Revisit if the owner wants
  warm-up time counted.
- Removing an exercise from a free workout before logging it (swipe to remove) and reordering:
  deferred; the row keyed by date self-heals tomorrow.
- Swap on Today (`TodayRepo.exerciseChoices` has no UI consumer: `grep -rn exerciseChoices
  apps/mobile/src apps/mobile/app` hits only `TodayRepo.ts`) stays unbuilt.
- Pinning tests: `TodayRepo.addExercise.test.ts` "answers noSession…" (`toBe("noSession")`) becomes
  "creates today's free workout and answers added" (`toBe("added")` + the row holds `[CURLS]`);
  `addToToday.test.ts` lines "noSession shows the no-session notice" and
  `noticeCopy({ _tag: "NoSession" })` are deleted; `addCatalogToToday.test.ts` `each(["noSession",
  "alreadyPlanned"])` → `each(["added", "alreadyPlanned"])`.
