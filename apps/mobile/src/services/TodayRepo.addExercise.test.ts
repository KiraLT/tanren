import { describe, expect, it } from "@effect/vitest"
import { Exercise, ExerciseId, IdGenerator, PlannedSetRow } from "@tanren/shared"
import { DateTime, Effect, Layer, Option } from "effect"
import { TestClock } from "effect/testing"
import { LOCAL_USER_ID } from "../store/localUser"
import { seedIfEmpty } from "../store/seed"
import { CurrentUser } from "./CurrentUser"
import { decodeRecords, LocalStore } from "./LocalStore"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"
import { ADDED_SET_COUNT, ADDED_SET_REPS, TodayRepo } from "./TodayRepo"

/** 2026-10-20 08:00 UTC: the seed plans a session today (see TodayRepo.test.ts). */
const NOW = Date.UTC(2026, 9, 20, 8)
const CURLS = ExerciseId.make("00000000-0000-4000-8000-0000000000c1")

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

const run = <A, E>(
  body: Effect.Effect<
    A,
    E,
    TodayRepo | LocalStore | StoreEvents | IdGenerator | CurrentUser | DateTime.CurrentTimeZone
  >,
) => TestClock.setTime(NOW).pipe(Effect.andThen(body), Effect.provide(TestLayer))

/** The seed plus a synced user exercise that is not on today's plan. */
const seededWithCurls = Effect.gen(function* () {
  yield* seedIfEmpty
  const at = DateTime.makeUnsafe("2026-10-01T08:00:00.000Z")
  const curls = Exercise.make({
    id: CURLS,
    userId: LOCAL_USER_ID,
    createdAt: at,
    updatedAt: at,
    deletedAt: Option.none(),
    name: "Dumbbell Curl",
    aliases: [],
    muscleGroups: ["biceps"],
    notes: Option.none(),
  })
  yield* LocalStore.use((store) =>
    store.write([{ table: "exercise", row: curls }], { dirty: false }),
  )
})

const plannedSets = LocalStore.use((store) =>
  store
    .all({ sql: `SELECT * FROM "planned_set" ORDER BY "order", "id"`, params: [] })
    .pipe(Effect.flatMap(decodeRecords(PlannedSetRow))),
)

const addExercise = (id: ExerciseId) => TodayRepo.use((repo) => repo.addExercise(id))
const version = StoreEvents.use((events) => events.version)

describe("TodayRepo.addExercise", () => {
  it.effect("appends three dirty planned sets after the max order, then lists the exercise", () =>
    run(
      Effect.gen(function* () {
        yield* seededWithCurls
        const before = yield* plannedSets
        const maxOrder = Math.max(...before.map((set) => set.order))
        const startVersion = yield* version
        expect(yield* addExercise(CURLS)).toBe(true)
        const added = (yield* plannedSets).filter((set) => set.exerciseId === CURLS)
        expect(added.map((set) => set.order)).toEqual([maxOrder + 1, maxOrder + 2, maxOrder + 3])
        expect(added).toHaveLength(ADDED_SET_COUNT)
        expect(added.map((set) => set.targetReps)).toEqual(
          Array.from({ length: ADDED_SET_COUNT }, () => ({ _tag: "Exact", reps: ADDED_SET_REPS })),
        )
        expect(added.every((set) => Option.isNone(set.targetWeightKg))).toBe(true)
        expect(added.every((set) => Option.isNone(set.restSeconds))).toBe(true)
        const dirty = yield* LocalStore.use((store) =>
          store.all({
            sql: `SELECT COUNT(*) AS "n" FROM "planned_set" WHERE "_dirty" = 1`,
            params: [],
          }),
        )
        expect(dirty[0]?.n).toBe(ADDED_SET_COUNT)
        expect(yield* version).toBe(startVersion + 1)
        const today = yield* TodayRepo.use((repo) => repo.today)
        const names = Option.map(today, (t) => t.exercises.map((e) => e.exercise.name))
        expect(Option.map(names, (list) => list.at(-1))).toEqual(Option.some("Dumbbell Curl"))
      }),
    ),
  )

  it.effect("does not write again when the exercise is already planned today", () =>
    run(
      Effect.gen(function* () {
        yield* seededWithCurls
        yield* addExercise(CURLS)
        const afterFirst = yield* version
        expect(yield* addExercise(CURLS)).toBe(true)
        expect(yield* version).toBe(afterFirst)
        expect((yield* plannedSets).filter((set) => set.exerciseId === CURLS)).toHaveLength(
          ADDED_SET_COUNT,
        )
      }),
    ),
  )

  it.effect("returns false and writes nothing when no session is planned today", () =>
    run(
      Effect.gen(function* () {
        yield* seededWithCurls
        yield* TestClock.adjust("1 day")
        const before = yield* version
        expect(yield* addExercise(CURLS)).toBe(false)
        expect(yield* version).toBe(before)
        expect((yield* plannedSets).filter((set) => set.exerciseId === CURLS)).toHaveLength(0)
      }),
    ),
  )
})
