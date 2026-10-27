import { describe, expect, it } from "@effect/vitest"
import { DataExport, SyncChange, UserId } from "@tanren/shared"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import { TestClock } from "effect/testing"
import { OWNER_USER_ID_KEY } from "../store/syncQueries"
import { DataExporter, exportFileName } from "./DataExport"
import { LocalStore } from "./LocalStore"
import { SqlDriver } from "./SqlDriver"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"

const OWNER = UserId.make("6f1d2b7e-3c4a-4e2b-9a0e-1f2a3b4c5d6e")
const AT = "2026-10-21T08:00:00.000Z"
const GONE = "2026-10-21T09:00:00.000Z"

const live = { userId: OWNER, createdAt: AT, updatedAt: AT, deletedAt: null }
const tombstone = { ...live, updatedAt: GONE, deletedAt: GONE }

const EXERCISE = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
const PLAN = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e"
const WEEK = "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f"
const PSESSION = "3d4e5f6a-7b8c-4d9e-8f0a-2b3c4d5e6f7a"
const PSET = "4e5f6a7b-8c9d-4e0f-9a1b-3c4d5e6f7a8b"
const SESSION = "b3e7c0a2-5d1f-4a7b-8c9d-0e1f2a3b4c5d"
const SET = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b"
const ENROLLMENT = "5f6a7b8c-9d0e-4f1a-8b2c-4d5e6f7a8b9c"
const COMPLETION = "6a7b8c9d-0e1f-4a2b-9c3d-5e6f7a8b9c0d"
const DELETED_EXERCISE = "7b8c9d0e-1f2a-4b3c-8d4e-6f7a8b9c0d1e"
const DELETED_SET = "8c9d0e1f-2a3b-4c4d-9e5f-7a8b9c0d1e2f"
const DELETED_ENROLLMENT = "9d0e1f2a-3b4c-4d5e-8f6a-8b9c0d1e2f3a"
const IMPORTED = "0e1f2a3b-4c5d-4e6f-9a7b-9c0d1e2f3a4b"
const HEALTH = "1f2a3b4c-5d6e-4f7a-8b8c-0d1e2f3a4b5c"
const DELETED_HEALTH = "2a3b4c5d-6e7f-4a8b-9c9d-1e2f3a4b5c6d"
const FOOD = "3b4c5d6e-7f8a-4b9c-8d0e-2f3a4b5c6d7e"
const PROGRAM = "4c5d6e7f-8a9b-4c0d-9e1f-3a4b5c6d7e8f"

const dailyHealth = (id: string, columns: typeof live | typeof tombstone, date: string) => ({
  table: "dailyHealth",
  row: {
    id,
    ...columns,
    provider: "garmin",
    date,
    totalCalories: 1840,
    activeCalories: null,
    steps: 8420,
    restingHeartRate: 52,
  },
})

const set = (id: string, columns: typeof live | typeof tombstone, order: number) => ({
  table: "set",
  row: {
    id,
    ...columns,
    sessionId: SESSION,
    exerciseId: EXERCISE,
    order,
    weightKg: 82.5,
    reps: 5,
    rpe: null,
    note: null,
    plannedSetId: null,
    loggedAt: AT,
  },
})

/** One live row per synced table, plus a tombstoned exercise, set and enrollment. */
const wire = [
  {
    table: "profile",
    row: {
      id: OWNER,
      ...live,
      goals: [{ kind: "strength", note: null }],
      constraints: [],
      availableDays: ["mon", "wed"],
      locations: [],
      activeLocationId: null,
      timezone: "Europe/Vilnius",
      nutrition: null,
    },
  },
  {
    table: "exercise",
    row: {
      id: EXERCISE,
      ...live,
      name: "Bench press",
      aliases: ["bench"],
      muscleGroups: ["chest"],
      notes: null,
      catalogId: null,
    },
  },
  {
    table: "exercise",
    row: {
      id: DELETED_EXERCISE,
      ...tombstone,
      name: "Gone",
      aliases: [],
      muscleGroups: [],
      notes: null,
      catalogId: null,
    },
  },
  {
    table: "plan",
    row: {
      id: PLAN,
      ...live,
      name: "Base",
      goal: "Stronger",
      startDate: "2026-10-19",
      status: "active",
    },
  },
  {
    table: "planWeek",
    row: { id: WEEK, ...live, planId: PLAN, weekStart: "2026-10-19", intent: null },
  },
  {
    table: "plannedSession",
    row: {
      id: PSESSION,
      ...live,
      planWeekId: WEEK,
      order: 0,
      name: "Push",
      scheduledDate: "2026-10-21",
      notes: null,
    },
  },
  {
    table: "plannedSet",
    row: {
      id: PSET,
      ...live,
      plannedSessionId: PSESSION,
      exerciseId: EXERCISE,
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
      id: SESSION,
      ...live,
      startedAt: AT,
      finishedAt: null,
      plannedSessionId: PSESSION,
      notes: null,
    },
  },
  set(SET, live, 0),
  set(DELETED_SET, tombstone, 1),
  {
    table: "programEnrollment",
    row: {
      id: ENROLLMENT,
      ...live,
      programId: "starting-strength",
      startedOn: "2026-10-19",
      status: "active",
      currentDay: 2,
      swaps: [{ from: "push-up", to: "incline-push-up" }],
    },
  },
  {
    table: "programEnrollment",
    row: {
      id: DELETED_ENROLLMENT,
      ...tombstone,
      programId: "old-program",
      startedOn: "2026-09-01",
      status: "abandoned",
      currentDay: 1,
      swaps: [],
    },
  },
  {
    table: "programDayCompletion",
    row: {
      id: COMPLETION,
      ...live,
      enrollmentId: ENROLLMENT,
      dayNumber: 1,
      completedAt: AT,
      durationSeconds: 1800,
      sessionId: SESSION,
    },
  },
  {
    table: "importedActivity",
    row: {
      id: IMPORTED,
      ...live,
      provider: "garmin",
      externalId: "18234567890",
      sport: "running",
      title: "Morning Run",
      startedAt: AT,
      durationSeconds: 2880,
      distanceMeters: 6200,
      calories: 412,
      avgHeartRate: 148,
      maxHeartRate: null,
    },
  },
  dailyHealth(HEALTH, live, "2026-10-21"),
  dailyHealth(DELETED_HEALTH, tombstone, "2026-10-20"),
  {
    table: "foodEntry",
    row: {
      id: FOOD,
      ...live,
      loggedAt: AT,
      meal: "lunch",
      source: "quick_add",
      items: [
        {
          name: "Chicken breast, cooked",
          portion: "100 g",
          grams: 100,
          kcal: 165,
          proteinG: 31,
          carbsG: 0,
          fatG: 3.6,
          fibreG: null,
          confidence: null,
        },
      ],
      kcal: 165,
      proteinG: 31,
      carbsG: 0,
      fatG: 3.6,
      note: null,
    },
  },
  {
    table: "program",
    row: {
      id: PROGRAM,
      ...live,
      title: "Push Pull",
      slug: "push-pull",
      summary: "Two days a week.",
      description: null,
      days: [
        {
          dayNumber: 1,
          title: "Day 1",
          rounds: 2,
          items: [{ kind: "reps", catalogId: "push-up", reps: 10, restSeconds: 30, sets: 1 }],
          restBetweenRoundsSeconds: 60,
        },
      ],
      schedule: { kind: "daysPerWeek", days: 2 },
      source: "manual",
      version: 1,
    },
  },
]

const TestLayer = DataExporter.layer.pipe(
  Layer.provideMerge(
    LocalStore.layerNoDeps.pipe(
      Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
    ),
  ),
)

const seed = (withOwner: boolean) =>
  Effect.gen(function* () {
    const changes = yield* Schema.decodeUnknownEffect(Schema.Array(SyncChange))(wire)
    yield* LocalStore.use((store) => store.write(changes, { dirty: false }))
    if (withOwner) {
      yield* SqlDriver.use((driver) =>
        driver.batch([
          {
            sql: `INSERT INTO "sync_state" ("key", "value") VALUES (?, ?)`,
            params: [OWNER_USER_ID_KEY, OWNER],
          },
        ]),
      )
    }
  })

const exported = Effect.gen(function* () {
  const { json } = yield* DataExporter.use((exporter) => exporter.exportAll)
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(DataExport))(json)
})

describe("DataExporter.exportAll", () => {
  it.effect("decodes with DataExport and holds the live rows of all 14 tables, parents first", () =>
    Effect.gen(function* () {
      yield* seed(true)
      const file = yield* exported
      expect(file.rows.map((change) => change.table)).toEqual([
        "profile",
        "exercise",
        "plan",
        "planWeek",
        "plannedSession",
        "plannedSet",
        "session",
        "set",
        "programEnrollment",
        "programDayCompletion",
        "importedActivity",
        "dailyHealth",
        "foodEntry",
        "program",
      ])
      expect(file.format).toBe("tanren.export")
      expect(file.version).toBe(1)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("leaves out tombstoned rows", () =>
    Effect.gen(function* () {
      yield* seed(true)
      const file = yield* exported
      const ids = file.rows.map((change) => change.row.id)
      expect(ids).not.toContain(DELETED_EXERCISE)
      expect(ids).not.toContain(DELETED_SET)
      expect(ids).not.toContain(DELETED_ENROLLMENT)
      expect(ids).not.toContain(DELETED_HEALTH)
      expect(file.rows.every((change) => Option.isNone(change.row.deletedAt))).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("round-trips the stored rows as the same wire JSON", () =>
    Effect.gen(function* () {
      yield* seed(true)
      const file = yield* exported
      const encoded = yield* Schema.encodeEffect(Schema.Array(SyncChange))(file.rows)
      expect(encoded).toEqual(wire.filter((change) => change.row.deletedAt === null))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("stamps exportedAt from the clock and the stored owner as userId", () =>
    Effect.gen(function* () {
      yield* seed(true)
      yield* TestClock.setTime(Date.parse(GONE))
      const file = yield* exported
      expect(DateTime.formatIso(file.exportedAt)).toBe(GONE)
      expect(file.userId).toEqual(Option.some(OWNER))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("has userId None when signed out", () =>
    Effect.gen(function* () {
      yield* seed(false)
      expect((yield* exported).userId).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("exports an empty store as a valid file with no rows", () =>
    Effect.gen(function* () {
      const file = yield* exported
      expect(file.rows).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("exportFileName", () => {
  it("is tanren-export-YYYY-MM-DD.json for the UTC date", () => {
    expect(exportFileName(DateTime.makeUnsafe("2026-10-21T23:59:59.000Z"))).toBe(
      "tanren-export-2026-10-21.json",
    )
  })

  it.effect("exportAll names the file after the exportedAt inside it", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2026-12-31T23:59:59.999Z"))
      const { json, fileName } = yield* DataExporter.use((exporter) => exporter.exportAll)
      const file = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(DataExport))(json)
      expect(DateTime.formatIso(file.exportedAt)).toBe("2026-12-31T23:59:59.999Z")
      expect(fileName).toBe("tanren-export-2026-12-31.json")
    }).pipe(Effect.provide(TestLayer)),
  )
})
