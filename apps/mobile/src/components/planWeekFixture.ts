import {
  Exercise,
  LocalDate,
  Plan,
  PlannedSession,
  PlannedSet,
  PlanWeek,
  type Weekday,
} from "@tanren/shared"
import { Schema } from "effect"
import type {
  PlanDay,
  PlannedExerciseBlock,
  PlannedSessionStatus,
  PlanWeekView,
} from "../hooks/usePlanWeek"
import { NOT_LOGGED } from "../services/PlanWeekRepo"

/** Typed fixture for the Plan components and their tests: a week that starts on a Wednesday. */

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

const stamps = {
  userId: uuid(1),
  createdAt: "2026-10-19T08:00:00.000Z",
  updatedAt: "2026-10-19T08:00:00.000Z",
  deletedAt: null,
}

export const FIXTURE_TODAY = "2026-10-22"

const plan = Schema.decodeUnknownSync(Plan)({
  ...stamps,
  id: uuid(10),
  name: "Strength block 3",
  goal: "Squat 140 kg for 5",
  startDate: "2026-10-21",
  status: "active",
})

const week = Schema.decodeUnknownSync(PlanWeek)({
  ...stamps,
  id: uuid(11),
  planId: uuid(10),
  weekStart: "2026-10-21",
  intent: "Heavy lower, easy upper",
})

const exercise = (n: number, name: string) =>
  Schema.decodeUnknownSync(Exercise)({
    ...stamps,
    id: uuid(100 + n),
    name,
    aliases: [],
    muscleGroups: [],
    notes: null,
  })

const plannedSet = (
  sessionN: number,
  exerciseN: number,
  order: number,
  target: {
    readonly weight: number | null
    readonly reps: unknown
    readonly rest: number | null
  },
) =>
  Schema.decodeUnknownSync(PlannedSet)({
    ...stamps,
    id: uuid(1000 + sessionN * 100 + exerciseN * 10 + order),
    plannedSessionId: uuid(200 + sessionN),
    exerciseId: uuid(100 + exerciseN),
    order,
    targetWeightKg: target.weight,
    targetReps: target.reps,
    targetRpe: null,
    restSeconds: target.rest,
    note: null,
  })

const block = (
  sessionN: number,
  exerciseN: number,
  name: string,
  targets: ReadonlyArray<Parameters<typeof plannedSet>[3]>,
): PlannedExerciseBlock => ({
  exercise: exercise(exerciseN, name),
  sets: targets.map((target, order) => plannedSet(sessionN, exerciseN, order, target)),
})

const exact = (reps: number) => ({ _tag: "Exact", reps })

const session = (
  n: number,
  name: string,
  scheduledDate: string | null,
  status: PlannedSessionStatus,
  blocks: ReadonlyArray<PlannedExerciseBlock>,
): PlanDay["sessions"][number] => ({
  plannedSession: Schema.decodeUnknownSync(PlannedSession)({
    ...stamps,
    id: uuid(200 + n),
    planWeekId: uuid(11),
    order: n,
    name,
    scheduledDate,
    notes: null,
  }),
  status,
  blocks,
  // The base fixture has nothing logged; tests spread `logged` onto a session for the logged line.
  logged: NOT_LOGGED,
})

const lowerA = session(1, "Lower A", "2026-10-21", "done", [
  block(
    1,
    1,
    "Back Squat",
    [100, 100, 100].map((weight) => ({ weight, reps: exact(5), rest: 180 })),
  ),
  block(1, 2, "Romanian Deadlift", [
    { weight: 80, reps: { _tag: "Range", min: 8, max: 10 }, rest: 120 },
    { weight: 80, reps: { _tag: "Range", min: 8, max: 10 }, rest: 120 },
  ]),
])
const mobility = session(2, "Mobility", "2026-10-21", "missed", [
  block(2, 3, "Hip 90/90", [{ weight: null, reps: exact(10), rest: null }]),
])
const upperA = session(3, "Upper A", "2026-10-22", "today", [
  block(3, 4, "Bench Press", [
    { weight: 60, reps: exact(5), rest: 150 },
    { weight: 80, reps: exact(5), rest: 150 },
    { weight: 80, reps: exact(5), rest: 150 },
  ]),
  block(3, 5, "Pull-up", [
    { weight: null, reps: { _tag: "Range", min: 6, max: 10 }, rest: 120 },
    { weight: null, reps: { _tag: "Range", min: 6, max: 10 }, rest: 120 },
  ]),
])
const lowerB = session(4, "Lower B", "2026-10-24", "upcoming", [
  block(4, 1, "Back Squat", [{ weight: 90, reps: exact(8), rest: 150 }]),
])
const arms = session(5, "Optional arms", null, "upcoming", [
  block(5, 6, "Dumbbell Curl", [
    { weight: 14, reps: { _tag: "Range", min: 10, max: 15 }, rest: 60 },
  ]),
])

const day = (date: string, weekday: Weekday, sessions: PlanDay["sessions"]): PlanDay => ({
  date: LocalDate.make(date),
  weekday,
  sessions,
})

/** Wed 21 Oct to Tue 27 Oct 2026; "today" is Thu 22 Oct (`FIXTURE_TODAY`). */
export const planWeekFixture: PlanWeekView = {
  plan,
  week,
  days: [
    day("2026-10-21", "wed", [lowerA, mobility]),
    day("2026-10-22", "thu", [upperA]),
    day("2026-10-23", "fri", []),
    day("2026-10-24", "sat", [lowerB]),
    day("2026-10-25", "sun", []),
    day("2026-10-26", "mon", []),
    day("2026-10-27", "tue", []),
  ],
  unscheduled: [arms],
}
