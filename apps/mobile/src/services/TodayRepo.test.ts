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

const isPlanned = (today: Today): today is Extract<Today, { readonly _tag: "Planned" }> =>
  today._tag === "Planned"

const seededToday = Effect.gen(function* () {
  yield* seedIfEmpty
  const today = yield* (yield* TodayRepo).today
  return yield* Option.match(Option.filter(today, isPlanned), {
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

/** The seeded plan's exercise ids in plan order: squat, bench, row, press (seeded at NOW). */
const seededExerciseIds = seededToday.pipe(
  Effect.map((today) => today.exercises.map(({ exercise }) => exercise.id)),
)

const nth = (ids: ReadonlyArray<ExerciseId>, n: number) =>
  Option.match(Arr.get(ids, n), {
    onNone: () => Effect.die(`expected exercise ${n}`),
    onSome: Effect.succeed,
  })

/** Today's free workout, or a defect when Today is anything else. */
const freeToday = TodayRepo.use((repo) => repo.today).pipe(
  Effect.flatMap((today) =>
    Option.match(today, {
      onNone: () => Effect.die("expected a free workout, got none"),
      onSome: (found) =>
        found._tag === "Free" ? Effect.succeed(found) : Effect.die("expected a free workout"),
    }),
  ),
)

const freeRowCount = count(`SELECT COUNT(*) AS "n" FROM "free_workout"`)

describe("TodayRepo free workout (ADR-0028)", () => {
  it.effect("start shows an empty free workout on a day with no plan; cancel empties Today", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* TodayRepo
        yield* repo.startFreeWorkout
        const free = yield* freeToday
        expect(free.exercises).toEqual([])
        expect(Option.isNone(free.session)).toBe(true)
        yield* repo.cancelFreeWorkout
        expect(Option.isNone(yield* repo.today)).toBe(true)
        expect(yield* freeRowCount).toBe(0)
      }),
    ),
  )

  it.effect("start twice keeps the exercises already added", () =>
    run(
      Effect.gen(function* () {
        const ids = yield* seededExerciseIds
        yield* TestClock.adjust("1 day")
        const repo = yield* TodayRepo
        const bench = yield* nth(ids, 1)
        yield* repo.addExercise(bench)
        yield* repo.startFreeWorkout
        expect((yield* freeToday).exercises.map(({ exercise }) => exercise.id)).toEqual([bench])
      }),
    ),
  )

  it.effect("a planned session beats today's free workout", () =>
    run(
      Effect.gen(function* () {
        yield* seedIfEmpty
        const repo = yield* TodayRepo
        yield* repo.startFreeWorkout
        const today = yield* repo.today
        expect(Option.map(today, (t) => t._tag)).toEqual(Option.some("Planned"))
      }),
    ),
  )

  it.effect("lists the row's exercises in order, then ones logged here but not in the row", () =>
    run(
      Effect.gen(function* () {
        const ids = yield* seededExerciseIds
        yield* TestClock.adjust("1 day")
        const repo = yield* TodayRepo
        const [squat, bench, press] = [yield* nth(ids, 0), yield* nth(ids, 1), yield* nth(ids, 3)]
        yield* repo.addExercise(press)
        yield* repo.addExercise(bench)
        yield* repo.logSet(squatInput(squat, 60, 8))
        const free = yield* freeToday
        expect(free.exercises.map(({ exercise }) => exercise.id)).toEqual([press, bench, squat])
        expect(free.exercises.map(({ plannedSets }) => plannedSets.length)).toEqual([0, 0, 0])
        expect(free.exercises.map(({ loggedSets }) => loggedSets.length)).toEqual([0, 0, 1])
        expect(free.exercises.map(({ restSeconds }) => restSeconds)).toEqual([120, 120, 120])
        expect(Option.map(free.session, (open) => open.setCount)).toEqual(Option.some(1))
        expect(
          Option.map(free.session, (open) => Option.isNone(open.session.plannedSessionId)),
        ).toEqual(Option.some(true))
      }),
    ),
  )

  it.effect("prefills a free exercise from its last set in an older session, else 0 × 0", () =>
    run(
      Effect.gen(function* () {
        const ids = yield* seededExerciseIds
        const squat = yield* nth(ids, 0)
        const row = yield* nth(ids, 2)
        const repo = yield* TodayRepo
        yield* repo.logSet(squatInput(squat, 100, 5))
        yield* TestClock.adjust("1 minute")
        yield* repo.logSet(squatInput(squat, 105, 3))
        yield* TestClock.adjust("1 day")
        yield* repo.addExercise(squat)
        yield* repo.addExercise(row)
        const free = yield* freeToday
        expect(free.exercises.map(({ prefill }) => prefill)).toEqual([
          { weightKg: 105, reps: 3 },
          { weightKg: 0, reps: 0 },
        ])
        yield* repo.logSet(squatInput(squat, 110, 2))
        const after = yield* freeToday
        expect(after.exercises[0]?.prefill).toEqual({ weightKg: 110, reps: 2 })
      }),
    ),
  )

  it.effect("finishing the unplanned session deletes today's row and empties Today", () =>
    run(
      Effect.gen(function* () {
        const ids = yield* seededExerciseIds
        yield* TestClock.adjust("1 day")
        const repo = yield* TodayRepo
        const squat = yield* nth(ids, 0)
        yield* repo.addExercise(squat)
        // A day whose session `finishStaleSessions` closed after midnight leaves its row behind.
        yield* LocalStore.use((store) =>
          store.exec([
            {
              sql: `INSERT INTO "free_workout" ("localDate", "exerciseIds") VALUES (?, ?)`,
              params: ["2026-10-20", JSON.stringify([squat])],
            },
          ]),
        )
        expect(yield* freeRowCount).toBe(2)
        const set = yield* repo.logSet(squatInput(squat, 60, 8))
        const finished = yield* repo.finishSession(set.sessionId)
        expect(Option.map(finished, (f) => f.setCount)).toEqual(Option.some(1))
        expect(yield* freeRowCount).toBe(0)
        expect(Option.isNone(yield* repo.today)).toBe(true)
      }),
    ),
  )

  it.effect("finishing a planned session leaves a free-workout row alone", () =>
    run(
      Effect.gen(function* () {
        const ids = yield* seededExerciseIds
        const repo = yield* TodayRepo
        yield* repo.startFreeWorkout
        const set = yield* repo.logSet(squatInput(yield* nth(ids, 0), 100, 5))
        yield* repo.finishSession(set.sessionId)
        expect(yield* freeRowCount).toBe(1)
      }),
    ),
  )
})

describe("TodayRepo free workout, failure and races", () => {
  it.effect.each(["not json", '["x"]'])(
    "a corrupt free_workout row (%s) fails today with a StoreError",
    (raw) =>
      run(
        Effect.gen(function* () {
          yield* LocalStore.use((store) =>
            store.exec([
              {
                sql: `INSERT INTO "free_workout" ("localDate", "exerciseIds") VALUES (?, ?)`,
                params: ["2026-10-20", raw],
              },
            ]),
          )
          const error = yield* Effect.flip((yield* TodayRepo).today)
          expect(error._tag).toBe("StoreError")
        }),
      ),
  )

  it.effect("a double tap on add answers added then alreadyPlanned and stores the id once", () =>
    run(
      Effect.gen(function* () {
        const ids = yield* seededExerciseIds
        yield* TestClock.adjust("1 day")
        const bench = yield* nth(ids, 1)
        const add = TodayRepo.use((repo) => repo.addExercise(bench))
        const answers = yield* Effect.all([add, add], { concurrency: 2 })
        expect(answers).toEqual(["added", "alreadyPlanned"])
        const rows = yield* (yield* LocalStore).all({
          sql: `SELECT "exerciseIds" FROM "free_workout"`,
          params: [],
        })
        expect(rows).toEqual([{ exerciseIds: JSON.stringify([bench]) }])
      }),
    ),
  )
})
