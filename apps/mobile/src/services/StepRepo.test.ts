import { describe, expect, it } from "@effect/vitest"
import { CatalogId, ExerciseId } from "@tanren/shared"
import { Effect, Layer, Option } from "effect"
import { TestClock } from "effect/testing"
import { LocalStore } from "./LocalStore"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StepRepo, stepKeyOf } from "./StepRepo"
import { StoreEvents } from "./StoreEvents"

const TestLayer = StepRepo.layer.pipe(
  Layer.provideMerge(
    LocalStore.layerNoDeps.pipe(
      Layer.provide(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
    ),
  ),
)

const exerciseId = ExerciseId.make("00000000-0000-4000-8000-0000000000a1")
const bench = stepKeyOf({ id: exerciseId, catalogId: Option.some(CatalogId.make("bench-press")) })

const storedRows = LocalStore.use((store) =>
  store.all({ sql: `SELECT "key", "stepKg", "updatedAt" FROM "exercise_step"`, params: [] }),
)

describe("stepKeyOf", () => {
  it("keys a linked exercise by its catalog id, else by its own id", () => {
    expect(bench).toBe("catalog:bench-press")
    expect(stepKeyOf({ id: exerciseId, catalogId: Option.none() })).toBe(`exercise:${exerciseId}`)
  })
})

describe("StepRepo", () => {
  it.effect("get is None without a row; set stores the step and its time", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.UTC(2026, 9, 27, 18))
      const repo = yield* StepRepo
      expect(yield* repo.get(bench)).toEqual(Option.none())
      yield* repo.set(bench, 1.25)
      expect(yield* repo.get(bench)).toEqual(Option.some(1.25))
      expect(yield* storedRows).toEqual([
        { key: "catalog:bench-press", stepKg: 1.25, updatedAt: "2026-10-27T18:00:00.000Z" },
      ])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("set upserts one row per key; clear deletes it", () =>
    Effect.gen(function* () {
      const repo = yield* StepRepo
      yield* repo.set(bench, 1.25)
      yield* repo.set(bench, 5)
      expect((yield* storedRows).map((row) => row.stepKg)).toEqual([5])
      yield* repo.clear(bench)
      expect(yield* repo.get(bench)).toEqual(Option.none())
      expect(yield* storedRows).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )
})
