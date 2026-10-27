import { describe, expect, it } from "@effect/vitest"
import {
  Exercise,
  ExerciseId,
  OrderIndex,
  Reps,
  SessionId,
  SetId,
  WeightKg,
  WorkoutSet,
} from "@tanren/shared"
import { Array as Arr, DateTime, Option } from "effect"
import { at, exercise, session, T0, userA } from "../sync/fixtures"
import {
  activityFor,
  DESCRIPTION_LIMIT,
  describeSession,
  elapsedSeconds,
  startDateLocal,
} from "./activityText"

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`
const SESSION = SessionId.make(id(0x900))
const set = (n: number, exerciseN: number, weightKg: number, reps: number) =>
  WorkoutSet.make({
    id: SetId.make(id(0x1000 + n)),
    userId: userA,
    createdAt: T0,
    updatedAt: T0,
    deletedAt: Option.none(),
    sessionId: SESSION,
    exerciseId: ExerciseId.make(id(exerciseN)),
    order: OrderIndex.make(n),
    weightKg: WeightKg.make(weightKg),
    reps: Reps.make(reps),
    rpe: Option.none(),
    note: Option.none(),
    plannedSetId: Option.none(),
    loggedAt: DateTime.add(T0, { minutes: n }),
  })

const bench = exercise(1, { name: "Bench Press" })
const pulldown = exercise(2, { name: "Lat Pulldown" })
const plank = exercise(3, { name: "Plank" })
const MIN_48 = 48 * 60

describe("describeSession", () => {
  it("writes uniform reps as `n × r` at the heaviest weight, then totals and the footer", () => {
    const text = describeSession({
      sets: [set(0, 1, 60, 8), set(1, 1, 60, 8), set(2, 1, 57.5, 8), set(3, 1, 60, 8)],
      exercises: [bench],
      elapsedSeconds: MIN_48,
    })
    expect(text).toBe(
      "Bench Press — 4 × 8 @ 60 kg\n\n4 sets · 1 900 kg lifted · 48 min\nLogged with Tanren",
    )
  })

  it("lists non-uniform reps as `n sets · r1/r2/… reps`, exercises in first-logged order", () => {
    const text = describeSession({
      sets: [set(3, 1, 62.5, 5), set(0, 2, 50, 10), set(1, 2, 50, 10), set(2, 2, 45, 8)],
      exercises: [bench, pulldown],
      elapsedSeconds: MIN_48,
    })
    expect(text.split("\n").slice(0, 2)).toEqual([
      "Lat Pulldown — 3 sets · 10/10/8 reps @ 50 kg",
      "Bench Press — 1 × 5 @ 62.5 kg",
    ])
  })

  it("writes `@ bodyweight` and leaves out the lifted total when nothing was loaded", () => {
    const text = describeSession({
      sets: [set(0, 3, 0, 45), set(1, 3, 0, 45), set(2, 3, 0, 45)],
      exercises: [plank],
      elapsedSeconds: 600,
    })
    expect(text).toBe("Plank — 3 × 45 @ bodyweight\n\n3 sets · 10 min\nLogged with Tanren")
  })

  it("names a deleted or unknown exercise `Exercise`", () => {
    const deleted = Exercise.make({ ...bench, deletedAt: Option.some(T0) })
    const text = describeSession({
      sets: [set(0, 1, 20, 5), set(1, 9, 20, 5)],
      exercises: [deleted],
      elapsedSeconds: 600,
    })
    expect(text.split("\n").slice(0, 2)).toEqual([
      "Exercise — 1 × 5 @ 20 kg",
      "Exercise — 1 × 5 @ 20 kg",
    ])
  })

  it("drops exercise lines past 1000 characters and ends the list with `…`", () => {
    const many = Arr.map(Arr.range(1, 60), (n) =>
      exercise(0x100 + n, { name: `Exercise number ${n} with a long name` }),
    )
    const text = describeSession({
      sets: Arr.map(many, (_, n) => set(n, 0x101 + n, 40, 10)),
      exercises: many,
      elapsedSeconds: MIN_48,
    })
    expect(text.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT)
    expect(text).toContain("\n…\n\n60 sets · 24 000 kg lifted · 48 min\nLogged with Tanren")
    expect(text.startsWith("Exercise number 1 with a long name — 1 × 10 @ 40 kg\n")).toBe(true)
  })
})

describe("startDateLocal", () => {
  const startedAt = at("2026-07-01T06:30:15.000Z")

  it("formats the wall clock of a DST zone without an offset", () => {
    expect(startDateLocal(startedAt, Option.some("Europe/Vilnius"))).toBe("2026-07-01T09:30:15")
    expect(startDateLocal(at("2026-12-01T06:30:15.000Z"), Option.some("Europe/Vilnius"))).toBe(
      "2026-12-01T08:30:15",
    )
  })

  it("falls back to UTC for an unknown or missing zone", () => {
    expect(startDateLocal(startedAt, Option.some("Mars/Olympus_Mons"))).toBe("2026-07-01T06:30:15")
    expect(startDateLocal(startedAt, Option.none())).toBe("2026-07-01T06:30:15")
  })
})

describe("activityFor", () => {
  it("is a WeightTraining activity named `Strength training` lasting at least 60 s", () => {
    const row = session(0x900, T0)
    const activity = activityFor({
      session: row,
      finishedAt: DateTime.add(T0, { seconds: 20 }),
      sets: [],
      exercises: [],
      timezone: Option.none(),
      plannedSessionName: Option.none(),
    })
    expect(activity).toMatchObject({
      sessionId: row.id,
      name: "Strength training",
      sportType: "WeightTraining",
      trainer: true,
      startDateLocal: "2026-10-19T08:00:00",
      elapsedTime: 60,
      description: "0 sets · 1 min\nLogged with Tanren",
    })
    expect(elapsedSeconds(T0, DateTime.add(T0, { minutes: 48, seconds: 30 }))).toBe(2910)
  })

  it("is named after the linked planned session when its name is known", () => {
    const activity = activityFor({
      session: session(0x901, T0),
      finishedAt: DateTime.add(T0, { minutes: 50 }),
      sets: [],
      exercises: [],
      timezone: Option.none(),
      plannedSessionName: Option.some("Upper A"),
    })
    expect(activity.name).toBe("Upper A")
  })
})
