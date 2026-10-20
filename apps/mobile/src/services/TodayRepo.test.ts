import { describe, expect, it } from "@effect/vitest"
import { ExerciseId, IdGenerator, UserId } from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Layer, Option, Order } from "effect"
import { TestClock } from "effect/testing"
import { LOCAL_USER_ID } from "../store/localUser"
import { seedIfEmpty } from "../store/seed"
import { CurrentUser } from "./CurrentUser"
import { LocalStore } from "./LocalStore"
import type { SqlDriver } from "./SqlDriver"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"
import { type LogSetInput, type Today, TodayRepo } from "./TodayRepo"

/** 2026-10-20 08:00 UTC, a Tuesday; 11:00 in Vilnius. */
const NOW = Date.UTC(2026, 9, 20, 8)

const TestLayer = TodayRepo.layerNoDeps.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      LocalStore.layerNoDeps.pipe(
        Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
      ),
      IdGenerator.layerTest,
      CurrentUser.layerTest(Option.none()),
      DateTime.layerCurrentZoneNamed("Europe/Vilnius").pipe(Layer.orDie),
    ),
  ),
)

const SIGNED_IN = UserId.make("00000000-0000-4000-8000-0000000000aa")

/** Fresh in-memory database per test, clock at NOW. */
const run = <A, E>(
  body: Effect.Effect<
    A,
    E,
    | TodayRepo
    | LocalStore
    | StoreEvents
    | SqlDriver
    | IdGenerator
    | CurrentUser
    | DateTime.CurrentTimeZone
  >,
) => TestClock.setTime(NOW).pipe(Effect.andThen(body), Effect.provide(TestLayer))

const seededToday = Effect.gen(function* () {
  yield* seedIfEmpty
  const today = yield* (yield* TodayRepo).today
  return yield* Option.match(today, {
    onNone: () => Effect.die("expected a planned session today"),
    onSome: Effect.succeed,
  })
})

const firstExerciseId = (today: Today) =>
  Option.match(Option.fromNullishOr(today.exercises[0]), {
    onNone: () => Effect.die("expected a first exercise"),
    onSome: ({ exercise }) => Effect.succeed(exercise.id),
  })

const count = (sql: string) =>
  Effect.gen(function* () {
    const rows = yield* (yield* LocalStore).all({ sql, params: [] })
    return rows[0]?.n
  })

const squatInput = (
  exerciseId: LogSetInput["exerciseId"],
  weightKg: number,
  reps: number,
): LogSetInput => ({
  exerciseId,
  plannedSetId: Option.none(),
  weightKg,
  reps,
  rpe: Option.some(8),
})

describe("TodayRepo", () => {
  it.effect("returns no session when nothing is planned today", () =>
    run(
      Effect.gen(function* () {
        const today = yield* (yield* TodayRepo).today
        expect(Option.isNone(today)).toBe(true)
      }),
    ),
  )

  it.effect("reads the seeded session with its exercises in plan order", () =>
    run(
      Effect.gen(function* () {
        const today = yield* seededToday
        expect(today.plannedSession.name).toBe("Full body A")
        expect(today.exercises.map((e) => e.exercise.name)).toEqual([
          "Back Squat",
          "Bench Press",
          "Barbell Row",
          "Overhead Press",
        ])
        expect(today.exercises[0]?.plannedSets).toHaveLength(3)
      }),
    ),
  )

  it.effect("seeds only once", () =>
    run(
      Effect.gen(function* () {
        yield* seedIfEmpty
        yield* seedIfEmpty
        expect(yield* count(`SELECT COUNT(*) AS "n" FROM "exercise"`)).toBe(4)
      }),
    ),
  )

  it.effect("skips the demo seed when someone is signed in", () =>
    run(
      Effect.gen(function* () {
        yield* seedIfEmpty.pipe(Effect.provide(CurrentUser.layerTest(Option.some(SIGNED_IN))))
        expect(yield* count(`SELECT COUNT(*) AS "n" FROM "exercise"`)).toBe(0)
      }),
    ),
  )

  it.effect("writes new rows as the signed-in user", () =>
    Effect.gen(function* () {
      const exerciseId = ExerciseId.make("00000000-0000-4000-8000-0000000000e1")
      const set = yield* TodayRepo.use((repo) => repo.logSet(squatInput(exerciseId, 60, 5)))
      expect(set.userId).toBe(SIGNED_IN)
    }).pipe(
      Effect.provide(
        TodayRepo.layerNoDeps.pipe(
          Layer.provide(
            Layer.mergeAll(
              LocalStore.layerNoDeps.pipe(
                Layer.provide(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
              ),
              IdGenerator.layerTest,
              CurrentUser.layerTest(Option.some(SIGNED_IN)),
              DateTime.layerCurrentZoneNamed("Europe/Vilnius").pipe(Layer.orDie),
            ),
          ),
        ),
      ),
    ),
  )

  it.effect("seeds local demo rows that are not dirty", () =>
    run(
      Effect.gen(function* () {
        yield* seedIfEmpty
        expect(yield* count(`SELECT COUNT(*) AS "n" FROM "planned_set" WHERE "_dirty" = 1`)).toBe(0)
      }),
    ),
  )

  it.effect("returns no session on a day without a planned session", () =>
    run(
      Effect.gen(function* () {
        yield* seedIfEmpty
        yield* TestClock.adjust("1 day")
        const today = yield* (yield* TodayRepo).today
        expect(Option.isNone(today)).toBe(true)
      }),
    ),
  )

  it.effect("logs a set into a lazily created session, both dirty", () =>
    run(
      Effect.gen(function* () {
        const today = yield* seededToday
        const squat = yield* firstExerciseId(today)
        const set = yield* (yield* TodayRepo).logSet(squatInput(squat, 100, 5))
        expect(set.userId).toBe(LOCAL_USER_ID)
        expect(DateTime.formatIso(set.loggedAt)).toBe("2026-10-20T08:00:00.000Z")
        expect(yield* count(`SELECT COUNT(*) AS "n" FROM "workout_set" WHERE "_dirty" = 1`)).toBe(1)
        expect(
          yield* count(
            `SELECT COUNT(*) AS "n" FROM "workout_session" WHERE "_dirty" = 1 AND "plannedSessionId" = '${today.plannedSession.id}'`,
          ),
        ).toBe(1)
      }),
    ),
  )

  it.effect("reuses today's session for the second set", () =>
    run(
      Effect.gen(function* () {
        const today = yield* seededToday
        const squat = yield* firstExerciseId(today)
        const repo = yield* TodayRepo
        const first = yield* repo.logSet(squatInput(squat, 100, 5))
        const second = yield* repo.logSet(squatInput(squat, 100, 5))
        expect(second.sessionId).toBe(first.sessionId)
        expect(second.order).toBe(1)
        expect(yield* count(`SELECT COUNT(*) AS "n" FROM "workout_session"`)).toBe(1)
      }),
    ),
  )

  it.effect("shows logged sets and prefills from the next planned set", () =>
    run(
      Effect.gen(function* () {
        const seeded = yield* seededToday
        const squat = yield* firstExerciseId(seeded)
        const repo = yield* TodayRepo
        expect(seeded.exercises[0]?.prefill).toEqual({ weightKg: 100, reps: 5 })
        yield* repo.logSet(squatInput(squat, 102.5, 4))
        const today = yield* seededToday
        expect(today.exercises[0]?.loggedSets.map((s) => s.weightKg)).toEqual([102.5])
        expect(today.exercises[0]?.prefill).toEqual({ weightKg: 100, reps: 5 })
        expect(today.exercises[0]?.restSeconds).toBe(180)
      }),
    ),
  )

  it.effect("prefills from the last logged set once the plan is done", () =>
    run(
      Effect.gen(function* () {
        const seeded = yield* seededToday
        const squat = yield* firstExerciseId(seeded)
        const repo = yield* TodayRepo
        yield* repo.logSet(squatInput(squat, 100, 5))
        yield* repo.logSet(squatInput(squat, 100, 5))
        yield* repo.logSet(squatInput(squat, 105, 3))
        const today = yield* seededToday
        expect(today.exercises[0]?.prefill).toEqual({ weightKg: 105, reps: 3 })
        expect(today.exercises[0]?.restSeconds).toBe(120)
      }),
    ),
  )

  it.effect("rejects a weight off the 0.25 kg grid without writing", () =>
    run(
      Effect.gen(function* () {
        const seeded = yield* seededToday
        const squat = yield* firstExerciseId(seeded)
        const error = yield* Effect.flip((yield* TodayRepo).logSet(squatInput(squat, 100.1, 5)))
        expect(error._tag).toBe("ValidationError")
        expect(yield* count(`SELECT COUNT(*) AS "n" FROM "workout_set"`)).toBe(0)
      }),
    ),
  )

  it.effect("bumps the store version on every write", () =>
    run(
      Effect.gen(function* () {
        const seeded = yield* seededToday
        const events = yield* StoreEvents
        const before = yield* events.version
        yield* (yield* TodayRepo).logSet(squatInput(yield* firstExerciseId(seeded), 100, 5))
        expect(yield* events.version).toBe(before + 1)
      }),
    ),
  )

  it.effect("serialises concurrent logs into one session with distinct orders", () =>
    run(
      Effect.gen(function* () {
        const squat = yield* firstExerciseId(yield* seededToday)
        const repo = yield* TodayRepo
        const sets = yield* Effect.all(
          [repo.logSet(squatInput(squat, 100, 5)), repo.logSet(squatInput(squat, 100, 5))],
          { concurrency: 2 },
        )
        expect(
          Arr.sort(
            sets.map((set) => set.order),
            Order.Number,
          ),
        ).toEqual([0, 1])
        expect(yield* count(`SELECT COUNT(*) AS "n" FROM "workout_session"`)).toBe(1)
      }),
    ),
  )
})
