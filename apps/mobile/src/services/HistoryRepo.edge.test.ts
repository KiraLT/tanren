import { describe, expect, it } from "@effect/vitest"
import { ExerciseId, SyncChange } from "@tanren/shared"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import { TestClock } from "effect/testing"
import { LOCAL_USER_ID } from "../store/localUser"
import { HistoryRepo } from "./HistoryRepo"
import { LocalStore } from "./LocalStore"
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

// The pure PR edge cases moved to `@tanren/shared` (activity.test.ts, "PR edge cases").

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

  it.effect("a bodyweight-only exercise summarises with e1RM 0, best set the 10 reps", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.UTC(2026, 9, 21))
      yield* write(base(null))
      const [summary] = yield* HistoryRepo.use((r) => r.exercises)
      expect(summary).toMatchObject({ totalSets: 3, bestE1Rm: 0 })
      expect(summary?.best.reps).toBe(10)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a tombstoned exercise with live sets is not listed in exercises", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.UTC(2026, 9, 21))
      yield* write(base("2026-10-20T08:00:00.000Z"))
      expect(yield* HistoryRepo.use((r) => r.exercises)).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a tombstoned exercise has no detail", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.UTC(2026, 9, 21))
      yield* write(base("2026-10-20T08:00:00.000Z"))
      const found = yield* HistoryRepo.use((r) => r.exercise(ExerciseId.make(PULLUP)))
      expect(Option.isNone(found)).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )
})
