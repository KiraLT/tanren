import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import type { Exercise } from "./exercise"
import {
  CurrentPlanResult,
  ExerciseHistory,
  type ExerciseSummary,
  GetOverviewInput,
  MCP_TOOLS,
  McpToolName,
  Overview,
  SessionList,
} from "./mcp"
import { failingPaths, rejects, wireRoundTrips } from "./testing"

type ExerciseEncoded = (typeof Exercise)["Encoded"]
type ExerciseSummaryEncoded = (typeof ExerciseSummary)["Encoded"]
type OverviewEncoded = (typeof Overview)["Encoded"]

const rowWire = {
  userId: "6f1d2b7e-3c4a-4e2b-9a0e-1f2a3b4c5d6e",
  createdAt: "2026-10-19T08:00:00.000Z",
  updatedAt: "2026-10-19T08:00:00.000Z",
  deletedAt: null,
}
const exerciseId = "7d4e1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b"
const sessionWire = {
  ...rowWire,
  id: "55555555-5555-4555-8555-555555555555",
  startedAt: "2026-10-17T17:00:00.000Z",
  finishedAt: "2026-10-17T18:00:00.000Z",
  plannedSessionId: null,
  notes: null,
}
const setWire = {
  ...rowWire,
  id: "66666666-6666-4666-8666-666666666666",
  sessionId: sessionWire.id,
  exerciseId,
  order: 0,
  weightKg: 110,
  reps: 5,
  rpe: 8,
  note: null,
  plannedSetId: null,
  loggedAt: "2026-10-17T17:21:04.000Z",
}
const exerciseWire: ExerciseEncoded = {
  ...rowWire,
  id: exerciseId,
  name: "Back Squat",
  aliases: [],
  muscleGroups: ["quads", "glutes"],
  notes: null,
}

/** docs/design/mcp.md §5, with full UUIDs. */
const summaryWire: ExerciseSummaryEncoded = {
  exerciseId,
  name: "Back Squat",
  muscleGroups: ["quads", "glutes"],
  sessions: 2,
  sets: 10,
  volumeKg: 6200,
  best: { weightKg: 110, reps: 5, loggedAt: "2026-10-17T17:21:04.000Z" },
  lastLoggedAt: "2026-10-17T17:21:04.000Z",
}
const overviewWire: OverviewEncoded = {
  period: "7d",
  range: { from: "2026-10-13T00:00:00.000Z", to: "2026-10-20T00:00:00.000Z" },
  sessions: 4,
  sets: 58,
  volumeKg: 18740.5,
  exercises: [summaryWire],
  currentPlan: {
    planId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    name: "Upper / lower, autumn block",
    weeks: 5,
  },
}

describe("Overview", () => {
  it.effect("decodes the design sample and round-trips its wire form", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(Overview)(overviewWire)
      expect([decoded.period, decoded.exercises.length]).toEqual(["7d", 1])
      yield* wireRoundTrips(Overview, overviewWire)
    }),
  )

  it.effect("round-trips nulls for best, lastLoggedAt and currentPlan", () =>
    wireRoundTrips(Overview, {
      ...overviewWire,
      exercises: [{ ...summaryWire, best: null, lastLoggedAt: null }],
      currentPlan: null,
    }),
  )
})

describe("GetOverviewInput", () => {
  it.effect("accepts no period (the default applies in the tool)", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(GetOverviewInput)({})
      expect(decoded).toEqual({})
    }),
  )

  it.effect("rejects period 1y at path period", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(GetOverviewInput, { period: "1y" })).toEqual([["period"]])
      yield* rejects(GetOverviewInput, { period: "1y" })
    }),
  )
})

describe("read outputs", () => {
  it.effect("ExerciseHistory round-trips", () =>
    wireRoundTrips(ExerciseHistory, {
      exercise: exerciseWire,
      entries: [{ session: sessionWire, sets: [setWire] }],
    }),
  )

  it.effect("SessionList round-trips, with and without sets", () =>
    wireRoundTrips(SessionList, {
      range: { from: "2026-10-13T00:00:00.000Z", to: "2026-10-20T00:00:00.000Z" },
      sessions: [
        { session: sessionWire, sets: [setWire] },
        { session: { ...sessionWire, id: "77777777-7777-4777-8777-777777777777" }, sets: [] },
      ],
    }),
  )

  it.effect("CurrentPlanResult accepts null", () =>
    Effect.gen(function* () {
      expect(yield* Schema.decodeUnknownEffect(CurrentPlanResult)(null)).toBeNull()
      yield* wireRoundTrips(CurrentPlanResult, null)
    }),
  )
})

describe("MCP_TOOLS", () => {
  it.effect("names the seven plan tools and McpToolName accepts exactly those", () =>
    Effect.gen(function* () {
      expect(MCP_TOOLS).toHaveLength(7)
      expect(new Set(MCP_TOOLS).size).toBe(7)
      yield* Effect.forEach(MCP_TOOLS, (name) => Schema.decodeUnknownEffect(McpToolName)(name))
      yield* rejects(McpToolName, "delete_everything")
    }),
  )
})
