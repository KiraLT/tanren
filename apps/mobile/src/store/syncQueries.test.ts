import { describe, expect, it } from "@effect/vitest"
import { SyncChange } from "@tanren/shared"
import { Effect, Layer, Schema } from "effect"
import { encodeChange, LocalStore } from "../services/LocalStore"
import { SqlDriver } from "../services/SqlDriver"
import { nodeSqlDriverLayer } from "../services/SqlDriver.testing"
import { StoreEvents } from "../services/StoreEvents"
import { LOCAL_USER_ID } from "./localUser"
import { lwwUpsert, readCursor, writeCursor } from "./syncQueries"

const plan = (name: string, updatedAt: string): SyncChange =>
  Schema.decodeUnknownSync(SyncChange)({
    table: "plan",
    row: {
      id: "00000000-0000-4000-8000-0000000000d1",
      userId: LOCAL_USER_ID,
      name,
      goal: "Strength",
      startDate: "2026-10-19",
      status: "active",
      createdAt: "2026-10-19T08:00:00.000Z",
      updatedAt,
      deletedAt: null,
    },
  })

const TestLayer = LocalStore.layerNoDeps.pipe(
  Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
)

const applyRemote = (change: SyncChange, strict: boolean) =>
  Effect.gen(function* () {
    const { table, record } = yield* encodeChange(change)
    yield* (yield* SqlDriver).batch([lwwUpsert(table, record, { strict })])
  })

const planName = LocalStore.use((store) =>
  store.all({ sql: `SELECT "name", "_dirty" FROM "plan"`, params: [] }),
)

describe("syncQueries", () => {
  it.effect("lwwUpsert inserts an absent row clean", () =>
    Effect.gen(function* () {
      yield* applyRemote(plan("Remote", "2026-10-20T08:00:00.000Z"), true)
      expect(yield* planName).toEqual([{ name: "Remote", _dirty: 0 }])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("lwwUpsert (strict) keeps the local row on an equal updatedAt", () =>
    Effect.gen(function* () {
      yield* LocalStore.use((store) =>
        store.write([plan("Local", "2026-10-20T08:00:00.000Z")], { dirty: true }),
      )
      yield* applyRemote(plan("Remote", "2026-10-20T08:00:00.000Z"), true)
      expect(yield* planName).toEqual([{ name: "Local", _dirty: 1 }])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("lwwUpsert (conflict) lets the server win a tie and clears dirty", () =>
    Effect.gen(function* () {
      yield* LocalStore.use((store) =>
        store.write([plan("Local", "2026-10-20T08:00:00.000Z")], { dirty: true }),
      )
      yield* applyRemote(plan("Remote", "2026-10-20T08:00:00.000Z"), false)
      expect(yield* planName).toEqual([{ name: "Remote", _dirty: 0 }])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("writeCursor overwrites the stored cursor", () =>
    Effect.gen(function* () {
      const driver = yield* SqlDriver
      yield* driver.batch([writeCursor("1")])
      yield* driver.batch([writeCursor("2")])
      expect(yield* driver.all(readCursor)).toEqual([{ value: "2" }])
    }).pipe(Effect.provide(TestLayer)),
  )
})
