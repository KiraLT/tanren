import { describe, expect, it } from "@effect/vitest"
import { ExerciseId, SyncChange } from "@tanren/shared"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import { TestClock } from "effect/testing"
import { LOCAL_USER_ID } from "../store/localUser"
import { HistoryRepo } from "./HistoryRepo"
import { LocalStore } from "./LocalStore"
import { bestSet, epley1Rm, markPrs } from "./progressMath"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"

const TestLayer = HistoryRepo.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      LocalStore.layerNoDeps.pipe(
        Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
      ),
      DateTime.layerCurrentZoneNamed("Europe/Vilnius").pipe(Layer.orDie),
    ),
  ),
)

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const STAMP = "2026-10-01T08:00:00.000Z"
const row = (id: string, deletedAt: string | null = null) => ({
  id,
  userId: LOCAL_USER_ID,
  createdAt: STAMP,
  updatedAt: STAMP,
  deletedAt,
})
const write = (wire: ReadonlyArray<unknown>) =>
  Schema.decodeUnknownEffect(Schema.Array(SyncChange))(wire).pipe(
    Effect.orDie,
    Effect.flatMap((changes) => LocalStore.use((store) => store.write(changes, { dirty: false }))),
  )

const at = (i: number) => DateTime.makeUnsafe(Date.UTC(2026, 9, 1, 8, i))
const scored = (id: string, weightKg: number, reps: number, i: number) => ({
  id,
  weightKg,
  reps,
  loggedAt: at(i),
})

describe("progressMath PR edge cases", () => {
  it("60 kg x 1 then 30 kg x 30 have equal e1RM, and the extra reps make the second a PR", () => {
    expect(epley1Rm(60, 1)).toBe(epley1Rm(30, 30))
    const marked = markPrs([scored("a", 60, 1, 0), scored("b", 30, 30, 1)])
    expect(marked.map((s) => s.isPr)).toEqual([false, true])
  })

  it("the same pair in the other order is not a PR (fewer reps at equal e1RM)", () => {
    const marked = markPrs([scored("a", 30, 30, 0), scored("b", 60, 1, 1)])
    expect(marked.map((s) => s.isPr)).toEqual([false, false])
  })

  it("bodyweight-only history: more reps is a PR, equal reps is not, bestSet is the max reps", () => {
    const sets = [scored("a", 0, 8, 0), scored("b", 0, 8, 1), scored("c", 0, 12, 2)]
    expect(markPrs(sets).map((s) => s.isPr)).toEqual([false, false, true])
    expect(Option.map(bestSet(sets), (s) => s.id)).toEqual(Option.some("c"))
  })

  it("added weight on a bodyweight exercise beats any bodyweight set of equal reps", () => {
    const marked = markPrs([scored("a", 0, 10, 0), scored("b", 5, 10, 1)])
    expect(marked.map((s) => s.isPr)).toEqual([false, true])
  })

  it("empty input and a lone zero-rep set do not throw and mark no PR", () => {
    expect(markPrs([])).toEqual([])
    expect(markPrs([scored("a", 100, 0, 0)]).map((s) => s.isPr)).toEqual([false])
    expect(Option.isNone(bestSet([]))).toBe(true)
  })

  it("epley1Rm is 0 for negative weight, negative reps and NaN-free for zero", () => {
    expect([epley1Rm(-5, 5), epley1Rm(50, -1), epley1Rm(0, 0), epley1Rm(0, 5)]).toEqual([
      0, 0, 0, 0,
    ])
  })
})

describe("HistoryRepo bodyweight and tombstones", () => {
  const PULLUP = uid(12)
  const SESS = uid(20)
  const base = (exerciseDeletedAt: string | null) => [
    {
      table: "exercise",
      row: {
        ...row(PULLUP, exerciseDeletedAt),
        name: "Pull-up",
        aliases: [],
        muscleGroups: ["lats"],
        notes: null,
      },
    },
    {
      table: "session",
      row: {
        ...row(SESS),
        startedAt: "2026-10-19T08:00:00.000Z",
        finishedAt: null,
        plannedSessionId: null,
        notes: null,
      },
    },
    ...[8, 8, 10].map((reps, n) => ({
      table: "set",
      row: {
        ...row(uid(30 + n)),
        sessionId: SESS,
        exerciseId: PULLUP,
        order: n,
        weightKg: 0,
        reps,
        rpe: null,
        note: null,
        plannedSetId: null,
        loggedAt: `2026-10-19T08:0${n}:00.000Z`,
      },
    })),
  ]

  it.effect(
    "a bodyweight-only exercise summarises with e1RM 0 and zero volume, PR on the 10 reps",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.UTC(2026, 9, 21))
        yield* write(base(null))
        const [summary] = yield* HistoryRepo.use((r) => r.exercises)
        expect(summary).toMatchObject({ totalSets: 3, bestE1Rm: 0 })
        expect(summary?.best.reps).toBe(10)
        const [s] = yield* HistoryRepo.use((r) => r.sessions(5))
        expect(s).toMatchObject({ sets: 3, volumeKg: 0, prs: 1 })
      }).pipe(Effect.provide(TestLayer)),
  )

  // DEFECT: HistoryRepo.exercises / exercise() select exercise rows without `deletedAt IS NULL`, so a tombstoned exercise with live sets is listed and openable (HistoryRepo.ts exercises, exercise)
  it.effect.fails("a tombstoned exercise with live sets is not listed in exercises", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.UTC(2026, 9, 21))
      yield* write(base("2026-10-20T08:00:00.000Z"))
      expect(yield* HistoryRepo.use((r) => r.exercises)).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  // DEFECT: HistoryRepo.exercise(id) returns Some for a tombstoned exercise row (HistoryRepo.ts exercise, no deletedAt filter)
  it.effect.fails("a tombstoned exercise has no detail", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.UTC(2026, 9, 21))
      yield* write(base("2026-10-20T08:00:00.000Z"))
      const found = yield* HistoryRepo.use((r) => r.exercise(ExerciseId.make(PULLUP)))
      expect(Option.isNone(found)).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("sessions(0) and a negative limit return nothing and do not fail", () =>
    Effect.gen(function* () {
      yield* write(base(null))
      expect(yield* HistoryRepo.use((r) => r.sessions(0))).toEqual([])
      expect(yield* HistoryRepo.use((r) => r.sessions(-3))).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )
})
