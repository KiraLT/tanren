# ADR-0028: Free workouts — start and log a session without a plan

Status: accepted (Lead decision under plan Amendment 3; owner ask 2026-10-27 18:16, Amendment 29)

## Context

Today shows a session only when a Claude-written plan has a `planned_session` dated today
(`TodayRepo.plannedSessionToday`) or a program day is due. The Library's "Add to today's session"
returns `noSession` and shows "Plan a session for today, then add exercises to it" — a dead end the
owner hit on production, where he has no plan. The model already allows unplanned sessions:
`TodayRepo.logSet` creates a `workout_session` with `plannedSessionId` None and `openSession(None)`
reuses it on the local date it started; `list_sessions`/`get_overview` and the Strava export read
sessions without a planned-session filter. What is missing is a way to start one and a place to keep
"the exercises I intend to do today" before the first set.

## Decision

1. A **free workout** is an unplanned `workout_session` plus a device-local list of intended
   exercises in a new local-store table `free_workout (localDate PK, exerciseIds JSON)` (store
   migration v7). No D1 or wire change; nothing new syncs; `AccountErasure` wipes it with every
   other table.
2. Today's Empty state gets a primary **Start a workout**; the Library's add creates today's free
   workout when no planned session exists (`noSession` is deleted from `AddExerciseResult`, no
   compatibility branch, Amendment 23). Today renders a free workout with the same pager, steppers,
   `FinishWorkout` footer and an **Add exercise** button to the Library; prefill is the exercise's
   last live set anywhere, else 0/0; rest 120 s.
3. A planned session always beats a free one on the same day. Finishing the unplanned session
   deletes the day's `free_workout` row (Today returns to Empty; the feed card is the receipt).
   `docs/design/free-workout.md` carries the contract, state matrix and copy.

## Consequences

- Owner value in one engineer task (FREE-1) plus a review; no migration of live D1.
- The intent list does not follow the user to a second device; the sets do, and Today derives the
  exercises with logged sets back into the pager. Accepted for a single-user app.
- `startedAt` of a free session is the first logged set, not the Start tap (no empty session rows
  reach D1 or MCP). Duration undercounts warm-up; revisit on owner feedback.
- Not decided: removing/reordering intended exercises, a Today-side swap (`exerciseChoices` still
  has no UI), and whether the Library should default to "add" when a workout is open.

## Alternatives considered

- **In-memory intent list** (no table): lost on every PWA reload; the owner reloads often. Rejected.
- **Ad-hoc `planned_session`** for the day: `planned_session.planWeekId` is NOT NULL and the shared
  `PlannedSession` requires it, so it needs a synthetic plan and week, a D1 migration (expand →
  migrate live → deploy → contract) and makes `get_current_plan` report a plan nobody wrote. Rejected.
- **Synced `free_workout` table**: correct across devices but a D1 table, registry fills (13 sync
  tables, cursor), migration 0011 and a worker half for a list that is void by tomorrow. Rejected
  for now; the local table can be promoted later without touching the UI contract.
