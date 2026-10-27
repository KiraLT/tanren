import { describe, expect, it } from "@effect/vitest"
import { ImportedActivityId, SyncChange } from "@tanren/shared"
import { Effect, Layer, Option, Schema } from "effect"
import { LOCAL_USER_ID } from "../store/localUser"
import { ImportedActivityRepo } from "./ImportedActivityRepo"
import { LocalStore } from "./LocalStore"
import { StoreError } from "./SqlDriver"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"

const TestLayer = ImportedActivityRepo.layer.pipe(
  Layer.provideMerge(
    LocalStore.layerNoDeps.pipe(
      Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
    ),
  ),
)

const FailingLayer = ImportedActivityRepo.layer.pipe(
  Layer.provide(
    Layer.succeed(
      LocalStore,
      LocalStore.of({
        all: () => Effect.fail(new StoreError({ cause: "boom" })),
        write: () => Effect.fail(new StoreError({ cause: "boom" })),
      }),
    ),
  ),
)

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const STAMP = "2026-10-27T06:00:00.000Z"

const activity = (n: number, deletedAt: string | null) => ({
  table: "importedActivity",
  row: {
    id: uid(n),
    userId: LOCAL_USER_ID,
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt,
    provider: "garmin",
    externalId: `g-${n}`,
    sport: "running",
    title: "Morning Run",
    startedAt: "2026-10-27T04:12:00.000Z",
    durationSeconds: 2880,
    distanceMeters: 6200,
    calories: 412,
    avgHeartRate: 148,
    maxHeartRate: null,
  },
})

const write = (wire: ReadonlyArray<unknown>) =>
  Schema.decodeUnknownEffect(Schema.Array(SyncChange))(wire).pipe(
    Effect.orDie,
    Effect.flatMap((changes) => LocalStore.use((store) => store.write(changes, { dirty: false }))),
  )

const byId = (n: number) =>
  ImportedActivityRepo.use((repo) => repo.byId(ImportedActivityId.make(uid(n))))

describe("ImportedActivityRepo.byId", () => {
  it.effect("is Some with the live row", () =>
    Effect.gen(function* () {
      yield* write([activity(1, null), activity(2, null)])
      const found = yield* byId(1)
      expect(Option.map(found, (row) => [row.id, row.distanceMeters, row.maxHeartRate])).toEqual(
        Option.some([uid(1), Option.some(6200), Option.none()]),
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("is None for an unknown id", () =>
    Effect.gen(function* () {
      yield* write([activity(1, null)])
      expect(Option.isNone(yield* byId(9))).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("is None for a soft-deleted row", () =>
    Effect.gen(function* () {
      yield* write([activity(1, STAMP)])
      expect(Option.isNone(yield* byId(1))).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails with the store's error", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(byId(1))
      expect(error._tag).toBe("StoreError")
    }).pipe(Effect.provide(FailingLayer)),
  )
})
