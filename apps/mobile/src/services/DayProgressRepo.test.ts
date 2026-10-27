import { describe, expect, it } from "@effect/vitest"
import { CatalogId, DayNumber, ProgramDay, ProgramEnrollmentId } from "@tanren/shared"
import { Effect, Layer, Option, Schema } from "effect"
import { DayProgressRepo, DaySnapshot, snapshotFits } from "./DayProgressRepo"
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

/** The failure message of decoding `input` as a `DaySnapshot` (empty when it decodes). */
const decodeFailure = (input: unknown) =>
  Schema.decodeUnknownEffect(DaySnapshot)(input).pipe(
    Effect.flip,
    Effect.map((error) => error.message),
  )

describe("DaySnapshot", () => {
  const wire = Schema.encodeSync(DaySnapshot)(snapshot)

  it.effect("decodes a full snapshot from its wire form", () =>
    Effect.gen(function* () {
      expect(yield* Schema.decodeUnknownEffect(DaySnapshot)(wire)).toEqual(snapshot)
    }),
  )

  it.effect("rejects an unknown phase tag, naming phase._tag", () =>
    Effect.gen(function* () {
      const message = yield* decodeFailure({ ...wire, phase: { ...wire.phase, _tag: "Idle" } })
      expect(message).toContain('["phase"]["_tag"]')
    }),
  )

  it.effect("rejects a non-numeric entry reps, naming entries[0].reps", () =>
    Effect.gen(function* () {
      const message = yield* decodeFailure({
        ...wire,
        entries: [{ weightKg: 60, reps: "x" }, null],
      })
      expect(message).toContain('["entries"][0]["reps"]')
    }),
  )

  it.effect("rejects a negative round, naming phase.round", () =>
    Effect.gen(function* () {
      const message = yield* decodeFailure({ ...wire, phase: { ...wire.phase, round: -1 } })
      expect(message).toContain('["phase"]["round"]')
    }),
  )

  it.effect("rejects a negative stepIndex, naming phase.stepIndex", () =>
    Effect.gen(function* () {
      const message = yield* decodeFailure({ ...wire, phase: { ...wire.phase, stepIndex: -1 } })
      expect(message).toContain('["phase"]["stepIndex"]')
    }),
  )

  it.effect("round-trips an unperformed entry (None) beside a draft", () =>
    Effect.gen(function* () {
      const partial: DaySnapshot = {
        ...snapshot,
        entries: [Option.none(), Option.some({ weightKg: 0, reps: 12 })],
        draft: Option.some({ weightKg: 0, reps: 12 }),
        phase: { _tag: "Resting", round: 1, stepIndex: 0, remainingMs: Option.some(30_000) },
      }
      const decoded = yield* Schema.decodeUnknownEffect(DaySnapshot)(
        yield* Schema.encodeEffect(DaySnapshot)(partial),
      )
      expect(decoded).toEqual(partial)
    }),
  )
})

describe("snapshotFits", () => {
  const day = Schema.decodeUnknownSync(ProgramDay)({
    dayNumber: 3,
    title: "Day 3 · Push",
    rounds: 2,
    items: [
      { kind: "reps", catalogId: "bench-press", reps: 8, restSeconds: 60, sets: 2 },
      { kind: "timed", catalogId: "plank", seconds: 30, restSeconds: 20 },
    ],
    restBetweenRoundsSeconds: 60,
  })
  // Three steps per round (two bench sets + the plank) and two rounds.
  const at = (dayNumber: number, round: number, stepIndex: number): DaySnapshot => ({
    ...snapshot,
    dayNumber: DayNumber.make(dayNumber),
    phase: { _tag: "Working", round, stepIndex, remainingMs: Option.none() },
  })

  it("is false when the snapshot is for another day", () => {
    expect(snapshotFits(at(2, 0, 0), day, 3)).toBe(false)
  })

  it("is false when the step no longer exists", () => {
    expect(snapshotFits(at(3, 0, 3), day, 3)).toBe(false)
  })

  it("is false when the round no longer exists", () => {
    expect(snapshotFits(at(3, 2, 0), day, 3)).toBe(false)
  })

  it("is true for the last step of the last round", () => {
    expect(snapshotFits(at(3, 1, 2), day, 3)).toBe(true)
  })
})
