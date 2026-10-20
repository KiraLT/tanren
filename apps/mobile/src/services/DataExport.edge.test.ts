import { describe, expect, it } from "@effect/vitest"
import { DataExport, SyncChange, UserId } from "@tanren/shared"
import { Effect, Layer, Schema } from "effect"
import { TestClock } from "effect/testing"
import { OWNER_USER_ID_KEY } from "../store/syncQueries"
import { DataExporter } from "./DataExport"
import { LocalStore } from "./LocalStore"
import { SqlDriver } from "./SqlDriver"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"

const OWNER = UserId.make("6f1d2b7e-3c4a-4e2b-9a0e-1f2a3b4c5d6e")
const AT = "2026-10-21T08:00:00.000Z"
const GONE = "2026-10-21T09:00:00.000Z"
const col = (updatedAt = AT, deletedAt: string | null = null) => ({
  userId: OWNER,
  createdAt: AT,
  updatedAt,
  deletedAt,
})
const ENR = "5f6a7b8c-9d0e-4f1a-8b2c-4d5e6f7a8b9c"
const SESSION = "b3e7c0a2-5d1f-4a7b-8c9d-0e1f2a3b4c5d"
const C1 = "6a7b8c9d-0e1f-4a2b-9c3d-5e6f7a8b9c0d"
const C2 = "7a7b8c9d-0e1f-4a2b-9c3d-5e6f7a8b9c0d"
const C3 = "8a7b8c9d-0e1f-4a2b-9c3d-5e6f7a8b9c0d"

const wire = [
  {
    table: "exercise",
    row: {
      id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      ...col(),
      name: `Zoë's "Bench" 🏋️ \\ ' ; DROP TABLE x; --`,
      aliases: ["ß", "日本語"],
      muscleGroups: ["chest"],
      notes: "line1\nline2",
      catalogId: null,
    },
  },
  {
    table: "session",
    row: {
      id: SESSION,
      ...col(),
      startedAt: AT,
      finishedAt: AT,
      plannedSessionId: null,
      notes: null,
    },
  },
  {
    table: "programEnrollment",
    row: {
      id: ENR,
      ...col(),
      programId: "core-30",
      startedOn: "2026-10-01",
      status: "completed",
      currentDay: 31,
    },
  },
  // completion with a session link, one without, one tombstoned
  {
    table: "programDayCompletion",
    row: {
      id: C1,
      ...col(),
      enrollmentId: ENR,
      dayNumber: 1,
      completedAt: AT,
      durationSeconds: 0,
      sessionId: SESSION,
    },
  },
  {
    table: "programDayCompletion",
    row: {
      id: C2,
      ...col(),
      enrollmentId: ENR,
      dayNumber: 2,
      completedAt: AT,
      durationSeconds: 86_400,
      sessionId: null,
    },
  },
  {
    table: "programDayCompletion",
    row: {
      id: C3,
      ...col(GONE, GONE),
      enrollmentId: ENR,
      dayNumber: 3,
      completedAt: AT,
      durationSeconds: 5,
      sessionId: null,
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

const seed = Effect.gen(function* () {
  const changes = yield* Schema.decodeUnknownEffect(Schema.Array(SyncChange))(wire)
  yield* LocalStore.use((store) => store.write(changes, { dirty: false }))
  yield* SqlDriver.use((d) =>
    d.batch([
      {
        sql: `INSERT INTO "sync_state" ("key","value") VALUES (?,?)`,
        params: [OWNER_USER_ID_KEY, OWNER],
      },
    ]),
  )
})

describe("DataExporter edge cases", () => {
  it.effect("keeps quotes, backslashes, emoji and newlines intact through store and JSON", () =>
    Effect.gen(function* () {
      yield* seed
      const { json } = yield* DataExporter.use((e) => e.exportAll)
      const file = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(DataExport))(json)
      const names = file.rows.flatMap((c) => (c.table === "exercise" ? [c.row.name] : []))
      expect(names).toEqual([wire[0]?.row && (wire[0].row as { name: string }).name])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("encode -> decode -> encode of the file is a fixed point, program rows included", () =>
    Effect.gen(function* () {
      yield* seed
      yield* TestClock.setTime(Date.parse(AT))
      const { json } = yield* DataExporter.use((e) => e.exportAll)
      const codec = Schema.fromJsonString(DataExport)
      const decoded = yield* Schema.decodeUnknownEffect(codec)(json)
      const again = yield* Schema.encodeEffect(codec)(decoded)
      expect(JSON.parse(again)).toEqual(JSON.parse(json))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("exports completions with and without a session link, drops the tombstoned one", () =>
    Effect.gen(function* () {
      yield* seed
      const { json } = yield* DataExporter.use((e) => e.exportAll)
      const file = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(DataExport))(json)
      const completions = file.rows.flatMap((c) =>
        c.table === "programDayCompletion" ? [c.row.id] : [],
      )
      expect(completions).toEqual([C1, C2])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("two exports of an unchanged store differ only in exportedAt", () =>
    Effect.gen(function* () {
      yield* seed
      const a = yield* DataExporter.use((e) => e.exportAll)
      yield* TestClock.adjust("5 seconds")
      const b = yield* DataExporter.use((e) => e.exportAll)
      const strip = (s: string) => ({ ...JSON.parse(s), exportedAt: null })
      expect(strip(a.json)).toEqual(strip(b.json))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a store holding only a tombstone exports zero rows, still a valid file", () =>
    Effect.gen(function* () {
      const changes = yield* Schema.decodeUnknownEffect(Schema.Array(SyncChange))([wire[5]])
      yield* LocalStore.use((s) => s.write(changes, { dirty: false }))
      const { json } = yield* DataExporter.use((e) => e.exportAll)
      const file = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(DataExport))(json)
      expect(file.rows).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )
})
