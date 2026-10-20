import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import { Effect, Match, Option, Schema } from "effect"
import {
  Plan,
  type PlanEncoded,
  PlannedSession,
  type PlannedSessionEncoded,
  PlannedSessionPatch,
  PlannedSet,
  type PlannedSetEncoded,
  PlannedSetPatch,
  PlanPatch,
  PlanWeek,
  type PlanWeekEncoded,
  PlanWeekPatch,
  RepTarget,
} from "./plan"
import { failingPaths, wireRoundTrips } from "./testing"

const rowWire = {
  userId: "6f1d2b7e-3c4a-4e2b-9a0e-1f2a3b4c5d6e",
  createdAt: "2026-10-19T08:00:00.000Z",
  updatedAt: "2026-10-19T08:00:00.000Z",
  deletedAt: null,
}
const deleted = { updatedAt: "2026-10-20T08:00:00.000Z", deletedAt: "2026-10-20T08:00:00.000Z" }
const planId = "11111111-1111-4111-8111-111111111111"
const planWeekId = "22222222-2222-4222-8222-222222222222"
const plannedSessionId = "33333333-3333-4333-8333-333333333333"

const planWire: PlanEncoded = {
  ...rowWire,
  id: planId,
  name: "Strength block",
  goal: "12-week strength block, squat to 140",
  startDate: "2026-10-19",
  status: "active",
}
const planWeekWire: PlanWeekEncoded = {
  ...rowWire,
  id: planWeekId,
  planId,
  weekStart: "2026-10-19",
  intent: null,
}
const plannedSessionWire: PlannedSessionEncoded = {
  ...rowWire,
  id: plannedSessionId,
  planWeekId,
  order: 0,
  name: "Upper A — push",
  scheduledDate: null,
  notes: null,
}
const plannedSetWire: PlannedSetEncoded = {
  ...rowWire,
  id: "44444444-4444-4444-8444-444444444444",
  plannedSessionId,
  exerciseId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  order: 0,
  targetWeightKg: null,
  targetReps: { _tag: "Exact", reps: 5 },
  targetRpe: null,
  restSeconds: null,
  note: null,
}

describe("RepTarget", () => {
  it.effect("decodes an Exact target", () =>
    Effect.gen(function* () {
      const target = yield* Schema.decodeUnknownEffect(RepTarget)({ _tag: "Exact", reps: 8 })
      expect(target).toEqual({ _tag: "Exact", reps: 8 })
    }),
  )

  it.effect("rejects a Range whose min equals max, at path max", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(RepTarget, { _tag: "Range", min: 8, max: 8 })).toEqual([["max"]])
    }),
  )

  it.effect("rejects a Range whose min exceeds max, at path max", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(RepTarget, { _tag: "Range", min: 12, max: 8 })).toEqual([["max"]])
    }),
  )

  it("is matched exhaustively by tag (adding a member breaks this at compile time)", () => {
    const prefill = (target: RepTarget): number =>
      Match.value(target).pipe(
        Match.tag("Exact", ({ reps }) => reps),
        Match.tag("Range", ({ min }) => min),
        Match.exhaustive,
      )
    const range = Schema.decodeUnknownSync(RepTarget)({ _tag: "Range", min: 8, max: 12 })
    expect(prefill(range)).toBe(8)
  })
})

describe("Plan patches", () => {
  it("omit the immutable parent ids from their fields", () => {
    expect(Object.keys(PlanWeekPatch.fields)).not.toContain("planId")
    expect(Object.keys(PlannedSessionPatch.fields)).not.toContain("planWeekId")
    expect(Object.keys(PlannedSetPatch.fields)).not.toContain("plannedSessionId")
    expectTypeOf<PlanWeekPatch>().not.toHaveProperty("planId")
    expectTypeOf<PlannedSessionPatch>().not.toHaveProperty("planWeekId")
    expectTypeOf<PlannedSetPatch>().not.toHaveProperty("plannedSessionId")
  })

  it("omit the row columns", () => {
    expect(Object.keys(PlanPatch.fields)).toEqual(["name", "goal", "startDate", "status"])
  })
})

describe("Plan entities round-trip through the wire", () => {
  it.effect("Plan, deletedAt null", () => wireRoundTrips(Plan, planWire))
  it.effect("Plan, deletedAt set", () => wireRoundTrips(Plan, { ...planWire, ...deleted }))
  it.effect("PlanWeek, every Option null", () => wireRoundTrips(PlanWeek, planWeekWire))
  it.effect("PlanWeek, every Option set", () =>
    wireRoundTrips(PlanWeek, { ...planWeekWire, ...deleted, intent: "deload" }),
  )
  it.effect("PlannedSession, every Option null", () =>
    wireRoundTrips(PlannedSession, plannedSessionWire),
  )
  it.effect("PlannedSession, every Option set", () =>
    wireRoundTrips(PlannedSession, {
      ...plannedSessionWire,
      ...deleted,
      scheduledDate: "2026-10-21",
      notes: "Keep it short",
    }),
  )
  it.effect("PlannedSet, every Option null, Exact target", () =>
    wireRoundTrips(PlannedSet, plannedSetWire),
  )
  it.effect("PlannedSet, every Option set, Range target", () =>
    wireRoundTrips(PlannedSet, {
      ...plannedSetWire,
      ...deleted,
      targetWeightKg: 102.5,
      targetReps: { _tag: "Range", min: 8, max: 12 },
      targetRpe: 8.5,
      restSeconds: 180,
      note: "pause 2 s",
    }),
  )
})

describe("PlanWeekPatch", () => {
  it.effect("ignores an immutable parent key: planId is stripped, not rejected", () =>
    Effect.gen(function* () {
      const patch = yield* Schema.decodeUnknownEffect(PlanWeekPatch)({ planId: "x", intent: null })
      expect(patch).toEqual({ intent: Option.none() })
    }),
  )
})
