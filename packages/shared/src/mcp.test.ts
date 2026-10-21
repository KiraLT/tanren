import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import type { CurrentPlanEncoded } from "./currentPlan"
import type { Exercise } from "./exercise"
import {
  CurrentPlanResult,
  ExerciseHistory,
  type ExerciseSummary,
  GetOverviewInput,
  LogSessionInput,
  LogSessionResult,
  MCP_SCOPES,
  MCP_TOOLS,
  McpScope,
  McpToolName,
  OAuthProps,
  Overview,
  SearchExercisesInput,
  SearchExercisesResult,
  SessionList,
  UpdateProfileResult,
  WritePlanWeekInput,
  WritePlanWeekResult,
} from "./mcp"
import { accepts, failingPaths, rejects, wireRoundTrips } from "./testing"
import { Profile } from "./user"

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
  catalogId: null,
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

  describe("CurrentPlanResult", () => {
    const currentPlanWire: CurrentPlanEncoded = {
      plan: {
        id: "11111111-1111-4111-8111-111111111111",
        userId: "6f1d2b7e-3c4a-4e2b-9a0e-1f2a3b4c5d6e",
        createdAt: "2026-10-19T08:00:00.000Z",
        updatedAt: "2026-10-19T08:00:00.000Z",
        deletedAt: null,
        name: "Strength block",
        goal: "12-week strength block",
        startDate: "2026-10-19",
        status: "active",
      },
      weeks: [],
      sessions: [],
      sets: [],
    }

    it.effect("decodes null to None", () =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(CurrentPlanResult)(null)
        expect(Option.isNone(decoded)).toBe(true)
      }),
    )

    it.effect("decodes a plan to Some", () =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(CurrentPlanResult)(currentPlanWire)
        expect(Option.map(decoded, (current) => current.plan.name)).toEqual(
          Option.some("Strength block"),
        )
      }),
    )

    it.effect("rejects a malformed plan, at path plan.id", () =>
      Effect.gen(function* () {
        const paths = yield* failingPaths(CurrentPlanResult, {
          ...currentPlanWire,
          plan: { ...currentPlanWire.plan, id: "not-a-uuid" },
        })
        expect(paths).toEqual([["plan", "id"]])
      }),
    )

    it.effect("encodes None back to null", () =>
      Effect.gen(function* () {
        expect(yield* Schema.encodeEffect(CurrentPlanResult)(Option.none())).toBeNull()
      }),
    )

    it.effect("round-trips null and a plan through the wire", () =>
      Effect.gen(function* () {
        yield* wireRoundTrips(CurrentPlanResult, null)
        yield* wireRoundTrips(CurrentPlanResult, currentPlanWire)
      }),
    )
  })
})

const writePlanWeekWire = {
  planId: null,
  weekStart: "2026-10-19",
  intent: "Deload: keep RPE at 7",
  sessions: [{ name: "Upper A", order: 0, scheduledDate: "2026-10-20", notes: null, sets: [] }],
}

describe("WritePlanWeekInput", () => {
  it.effect("decodes without newPlan and round-trips", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(WritePlanWeekInput)(writePlanWeekWire)
      expect("newPlan" in decoded).toBe(false)
      yield* wireRoundTrips(WritePlanWeekInput, writePlanWeekWire)
    }),
  )

  it.effect("round-trips newPlan and a null intent", () =>
    wireRoundTrips(WritePlanWeekInput, {
      ...writePlanWeekWire,
      newPlan: { name: "Autumn block", goal: "Squat 140 kg" },
      intent: null,
    }),
  )

  it.effect("rejects an empty newPlan name at path newPlan.name", () =>
    Effect.gen(function* () {
      const input = { ...writePlanWeekWire, newPlan: { name: " ", goal: "x" } }
      expect(yield* failingPaths(WritePlanWeekInput, input)).toEqual([["newPlan", "name"]])
    }),
  )
})

describe("WritePlanWeekResult", () => {
  const resultWire = {
    planId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    planWeekId: "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    replaced: false,
    sessions: [
      {
        plannedSessionId: "c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        order: 0,
        name: "Upper A",
        sets: 4,
      },
    ],
  }
  it.effect("round-trips", () => wireRoundTrips(WritePlanWeekResult, resultWire))
  it.effect("rejects a fractional set count at path sessions.0.sets", () =>
    Effect.gen(function* () {
      const input = { ...resultWire, sessions: [{ ...resultWire.sessions[0], sets: 1.5 }] }
      expect(yield* failingPaths(WritePlanWeekResult, input)).toEqual([["sessions", 0, "sets"]])
    }),
  )
})

const logSessionWire = {
  startedAt: "2026-10-17T17:00:00.000Z",
  finishedAt: null,
  plannedSessionId: null,
  notes: null,
  sets: [{ exerciseId, weightKg: 110, reps: 5, rpe: 8, note: null }],
}
const logSetWire = { exerciseId, weightKg: 110, reps: 5, rpe: 8, note: null }

describe("LogSessionInput", () => {
  it.effect("round-trips without sessionId and loggedAt (step-4 shape)", () =>
    wireRoundTrips(LogSessionInput, logSessionWire),
  )

  it.effect("round-trips sessionId and a per-set loggedAt", () =>
    wireRoundTrips(LogSessionInput, {
      ...logSessionWire,
      sessionId: sessionWire.id,
      sets: [{ ...logSetWire, loggedAt: "2026-10-17T17:21:04.000Z" }],
    }),
  )

  it.effect("rejects a non-UUID sessionId at path sessionId", () =>
    Effect.gen(function* () {
      const input = { ...logSessionWire, sessionId: "nope" }
      expect(yield* failingPaths(LogSessionInput, input)).toEqual([["sessionId"]])
    }),
  )
})

describe("write results", () => {
  it.effect("LogSessionResult is a session with its sets", () =>
    Effect.gen(function* () {
      yield* wireRoundTrips(LogSessionResult, { session: sessionWire, sets: [setWire] })
      yield* rejects(LogSessionResult, { session: sessionWire })
    }),
  )

  it("UpdateProfileResult is the Profile schema", () => {
    expect(UpdateProfileResult).toBe(Profile)
  })
})

describe("OAuthProps", () => {
  const propsWire = { userId: rowWire.userId, scopes: MCP_SCOPES }

  it.effect("round-trips both scopes and accepts none", () =>
    Effect.gen(function* () {
      yield* wireRoundTrips(OAuthProps, propsWire)
      yield* accepts(OAuthProps, { ...propsWire, scopes: [] })
    }),
  )

  it.effect("rejects an unknown scope at path scopes.1", () =>
    Effect.gen(function* () {
      const input = { ...propsWire, scopes: ["tanren:read", "tanren:admin"] }
      expect(yield* failingPaths(OAuthProps, input)).toEqual([["scopes", 1]])
    }),
  )

  it.effect("McpScope accepts exactly MCP_SCOPES", () =>
    Effect.gen(function* () {
      yield* Effect.forEach(MCP_SCOPES, (scope) => Schema.decodeUnknownEffect(McpScope)(scope))
      yield* rejects(McpScope, "read")
    }),
  )
})

describe("SearchExercisesInput", () => {
  it.effect("accepts an empty input and every key at once", () =>
    Effect.gen(function* () {
      yield* accepts(SearchExercisesInput, {})
      yield* accepts(SearchExercisesInput, {
        query: "row",
        muscle: "lats",
        equipment: "cable",
        kind: "reps",
        limit: 5,
      })
    }),
  )

  it.effect("rejects an unknown muscle at path muscle", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(SearchExercisesInput, { muscle: "wings" })).toEqual([["muscle"]])
    }),
  )

  it.effect("rejects an unknown equipment, kind and an out-of-range limit at their paths", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(SearchExercisesInput, { equipment: "jetpack" })).toEqual([
        ["equipment"],
      ])
      expect(yield* failingPaths(SearchExercisesInput, { kind: "swim" })).toEqual([["kind"]])
      expect(yield* failingPaths(SearchExercisesInput, { limit: 0 })).toEqual([["limit"]])
      expect(yield* failingPaths(SearchExercisesInput, { query: "" })).toEqual([["query"]])
    }),
  )
})

/** docs/design/v2-catalog.md §6 wire example, full match shape. */
const catalogMatchWire: (typeof SearchExercisesResult)["Encoded"]["results"][number] = {
  catalogId: "overhead-press",
  name: "Overhead Press",
  aliases: ["OHP", "military press"],
  kind: "reps",
  primaryMuscles: ["shoulders", "triceps"],
  secondaryMuscles: ["upperBack", "core"],
  equipment: ["barbell"],
  movement: "verticalPush",
}

describe("SearchExercisesResult", () => {
  it.effect("round-trips the design sample and an empty result", () =>
    Effect.gen(function* () {
      yield* wireRoundTrips(SearchExercisesResult, { results: [catalogMatchWire], total: 1 })
      yield* wireRoundTrips(SearchExercisesResult, { results: [], total: 0 })
    }),
  )

  it.effect("rejects a match with an unknown movement at its path", () =>
    Effect.gen(function* () {
      expect(
        yield* failingPaths(SearchExercisesResult, {
          results: [{ ...catalogMatchWire, movement: "teleport" }],
          total: 1,
        }),
      ).toEqual([["results", 0, "movement"]])
    }),
  )
})

describe("MCP_TOOLS", () => {
  it.effect("names the eight tools and McpToolName accepts exactly those", () =>
    Effect.gen(function* () {
      expect(MCP_TOOLS).toHaveLength(8)
      expect(new Set(MCP_TOOLS).size).toBe(8)
      yield* Effect.forEach(MCP_TOOLS, (name) => Schema.decodeUnknownEffect(McpToolName)(name))
      yield* rejects(McpToolName, "delete_everything")
    }),
  )
})
