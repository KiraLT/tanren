import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { CurrentPlan, type CurrentPlanEncoded } from "./currentPlan"
import { failingPaths, wireRoundTrips } from "./testing"

const rowWire = {
  userId: "6f1d2b7e-3c4a-4e2b-9a0e-1f2a3b4c5d6e",
  createdAt: "2026-10-19T08:00:00.000Z",
  updatedAt: "2026-10-19T08:00:00.000Z",
  deletedAt: null,
}
const planId = "11111111-1111-4111-8111-111111111111"
const planWeekId = "22222222-2222-4222-8222-222222222222"
const plannedSessionId = "33333333-3333-4333-8333-333333333333"

const wire: CurrentPlanEncoded = {
  plan: {
    ...rowWire,
    id: planId,
    name: "Strength block",
    goal: "12-week strength block",
    startDate: "2026-10-19",
    status: "active",
  },
  weeks: [{ ...rowWire, id: planWeekId, planId, weekStart: "2026-10-19", intent: null }],
  sessions: [
    {
      ...rowWire,
      id: plannedSessionId,
      planWeekId,
      order: 0,
      name: "Upper A",
      scheduledDate: null,
      notes: null,
    },
  ],
  sets: [
    {
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
    },
  ],
}

describe("CurrentPlan", () => {
  it.effect("decodes a plan with one week, session and set", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(CurrentPlan)(wire)
      expect([decoded.plan.id, decoded.weeks.length, decoded.sets.length]).toEqual([planId, 1, 1])
    }),
  )

  it.effect("decodes a plan without weeks", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(CurrentPlan)({
        ...wire,
        weeks: [],
        sessions: [],
        sets: [],
      })
      expect(decoded.weeks).toEqual([])
    }),
  )

  it.effect("rejects a week with a malformed planId, at path weeks.0.planId", () =>
    Effect.gen(function* () {
      const paths = yield* failingPaths(CurrentPlan, {
        ...wire,
        weeks: [{ ...wire.weeks[0], planId: "not-a-uuid" }],
      })
      expect(paths).toEqual([["weeks", 0, "planId"]])
    }),
  )

  it.effect("round-trips through the wire", () => wireRoundTrips(CurrentPlan, wire))
})
