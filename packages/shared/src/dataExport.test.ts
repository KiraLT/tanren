import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import { DataExport } from "./dataExport"
import { rejects } from "./testing"

const userId = "6f1d2b7e-3c4a-4e2b-9a0e-1f2a3b4c5d6e"
const at = "2026-10-21T08:00:00.000Z"
const columns = { userId, createdAt: at, updatedAt: at, deletedAt: null }

/** One live row per synced table, in the shape `SyncChange` puts on the wire. */
const exportJson = {
  format: "tanren.export",
  version: 1,
  exportedAt: at,
  userId,
  rows: [
    {
      table: "profile",
      row: {
        id: userId,
        ...columns,
        goals: [{ kind: "strength", note: null }],
        constraints: ["no overhead pressing"],
        availableDays: ["mon", "wed", "fri"],
        equipment: [{ kind: "barbell", note: null }],
        locations: [],
        activeLocationId: null,
        timezone: "Europe/Vilnius",
      },
    },
    {
      table: "exercise",
      row: {
        id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
        ...columns,
        name: "Bench press",
        aliases: [],
        muscleGroups: ["chest"],
        notes: null,
        catalogId: null,
      },
    },
    {
      table: "plan",
      row: {
        id: "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e",
        ...columns,
        name: "Base block",
        goal: "Get stronger",
        startDate: "2026-10-19",
        status: "active",
      },
    },
    {
      table: "planWeek",
      row: {
        id: "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f",
        ...columns,
        planId: "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e",
        weekStart: "2026-10-19",
        intent: null,
      },
    },
    {
      table: "plannedSession",
      row: {
        id: "3d4e5f6a-7b8c-4d9e-8f0a-2b3c4d5e6f7a",
        ...columns,
        planWeekId: "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f",
        order: 0,
        name: "Push",
        scheduledDate: "2026-10-21",
        notes: null,
      },
    },
    {
      table: "plannedSet",
      row: {
        id: "4e5f6a7b-8c9d-4e0f-9a1b-3c4d5e6f7a8b",
        ...columns,
        plannedSessionId: "3d4e5f6a-7b8c-4d9e-8f0a-2b3c4d5e6f7a",
        exerciseId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
        order: 0,
        targetWeightKg: 80,
        targetReps: { _tag: "Range", min: 5, max: 8 },
        targetRpe: 8,
        restSeconds: 120,
        note: null,
      },
    },
    {
      table: "session",
      row: {
        id: "b3e7c0a2-5d1f-4a7b-8c9d-0e1f2a3b4c5d",
        ...columns,
        startedAt: at,
        finishedAt: null,
        plannedSessionId: "3d4e5f6a-7b8c-4d9e-8f0a-2b3c4d5e6f7a",
        notes: null,
      },
    },
    {
      table: "set",
      row: {
        id: "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b",
        ...columns,
        sessionId: "b3e7c0a2-5d1f-4a7b-8c9d-0e1f2a3b4c5d",
        exerciseId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
        order: 0,
        weightKg: 82.5,
        reps: 5,
        rpe: 8.5,
        note: null,
        plannedSetId: "4e5f6a7b-8c9d-4e0f-9a1b-3c4d5e6f7a8b",
        loggedAt: at,
      },
    },
  ],
}

describe("DataExport", () => {
  it("decodes one row per table and encodes back to identical JSON", () => {
    const decoded = Schema.decodeUnknownSync(DataExport)(exportJson)
    expect(decoded.rows.map((change) => change.table)).toEqual([
      "profile",
      "exercise",
      "plan",
      "planWeek",
      "plannedSession",
      "plannedSet",
      "session",
      "set",
    ])
    expect(decoded.userId).toEqual(Option.some(userId))
    expect(Schema.encodeSync(DataExport)(decoded)).toStrictEqual(exportJson)
  })

  it("decodes a signed-out export (userId null, no rows) to None and back", () => {
    const wire = { format: "tanren.export", version: 1, exportedAt: at, userId: null, rows: [] }
    const decoded = Schema.decodeUnknownSync(DataExport)(wire)
    expect(Option.isNone(decoded.userId)).toBe(true)
    expect(Schema.encodeSync(DataExport)(decoded)).toStrictEqual(wire)
  })

  it.effect("rejects version 2", () => rejects(DataExport, { ...exportJson, version: 2 }))
  it.effect("rejects another format", () =>
    rejects(DataExport, { ...exportJson, format: "other.export" }),
  )
  it.effect("rejects a row of an unsynced table", () =>
    Effect.gen(function* () {
      const [first] = exportJson.rows
      yield* rejects(DataExport, { ...exportJson, rows: [{ table: "user", row: first?.row }] })
    }),
  )
  it.effect("rejects a missing exportedAt", () =>
    Effect.gen(function* () {
      const { exportedAt: _omitted, ...rest } = exportJson
      yield* rejects(DataExport, rest)
    }),
  )
})
