import { describe, expect, it } from "@effect/vitest"
import { CatalogId, DayNumber, ProgramEnrollmentId } from "@tanren/shared"
import { Effect, Layer, Option } from "effect"
import { DayProgressRepo, type DaySnapshot } from "./DayProgressRepo"
import { LocalStore } from "./LocalStore"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"

const TestLayer = DayProgressRepo.layer.pipe(
  Layer.provideMerge(
    LocalStore.layerNoDeps.pipe(
      Layer.provide(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
    ),
  ),
)

const enrollment = ProgramEnrollmentId.make("00000000-0000-4000-8000-0000000000e1")

const snapshot: DaySnapshot = {
  dayNumber: DayNumber.make(1),
  performedItems: 2,
  performedIds: [CatalogId.make("bench-press"), CatalogId.make("bench-press")],
  entries: [Option.some({ weightKg: 60, reps: 8 }), Option.some({ weightKg: 62.5, reps: 8 })],
  draft: Option.some({ weightKg: 62.5, reps: 7 }),
  startedAtMs: 1_000,
  pausedMs: 500,
  savedAtMs: 120_000,
  phase: { _tag: "Working", round: 0, stepIndex: 2, remainingMs: Option.none() },
}

describe("DayProgressRepo", () => {
  it.effect("write → read round-trips the snapshot, entries and draft included", () =>
    Effect.gen(function* () {
      const repo = yield* DayProgressRepo
      expect(yield* repo.read(enrollment)).toEqual(Option.none())
      yield* repo.write(enrollment, snapshot)
      expect(yield* repo.read(enrollment)).toEqual(Option.some(snapshot))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("write upserts one row per enrollment; clear deletes it", () =>
    Effect.gen(function* () {
      const repo = yield* DayProgressRepo
      yield* repo.write(enrollment, snapshot)
      const resting: DaySnapshot = {
        ...snapshot,
        performedItems: 3,
        phase: { _tag: "Resting", round: 0, stepIndex: 2, remainingMs: Option.some(45_000) },
      }
      yield* repo.write(enrollment, resting)
      expect(yield* repo.read(enrollment)).toEqual(Option.some(resting))
      const rows = yield* (yield* LocalStore).all({
        sql: `SELECT "dayNumber" FROM "program_day_progress"`,
        params: [],
      })
      expect(rows).toEqual([{ dayNumber: 1 }])
      yield* repo.clear(enrollment)
      expect(yield* repo.read(enrollment)).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )
})
