import { describe, expect, it } from "@effect/vitest"
import {
  CatalogId,
  Exercise,
  ExerciseId,
  ExerciseRow,
  findCatalogExercise,
  IdGenerator,
} from "@tanren/shared"
import { DateTime, Effect, Layer, Option } from "effect"
import { TestClock } from "effect/testing"
import { LOCAL_USER_ID } from "../store/localUser"
import { CurrentUser } from "./CurrentUser"
import { ExerciseLink } from "./ExerciseLink"
import { decodeRecords, LocalStore } from "./LocalStore"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"

const NOW = Date.UTC(2026, 9, 21, 8)
const EARLIER = DateTime.makeUnsafe("2026-10-01T08:00:00.000Z")
const SQUAT = CatalogId.make("barbell-back-squat")
const USER_EXERCISE = ExerciseId.make("00000000-0000-4000-8000-0000000000e1")

const TestLayer = ExerciseLink.layerNoDeps.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      LocalStore.layerNoDeps.pipe(
        Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
      ),
      IdGenerator.layerTest,
      CurrentUser.layerTest(Option.none()),
    ),
  ),
)

/** Fresh in-memory database per test, clock at NOW. */
const run = <A, E>(body: Effect.Effect<A, E, ExerciseLink | LocalStore | StoreEvents>) =>
  TestClock.setTime(NOW).pipe(Effect.andThen(body), Effect.provide(TestLayer))

const userExercise = (fields: {
  readonly name: string
  readonly aliases?: ReadonlyArray<string>
  readonly catalogId?: CatalogId
  readonly deleted?: boolean
  readonly id?: ExerciseId
}) =>
  Exercise.make({
    id: fields.id ?? USER_EXERCISE,
    userId: LOCAL_USER_ID,
    createdAt: EARLIER,
    updatedAt: EARLIER,
    deletedAt: fields.deleted === true ? Option.some(EARLIER) : Option.none(),
    name: fields.name,
    aliases: fields.aliases ?? [],
    muscleGroups: [],
    notes: Option.none(),
    catalogId: Option.fromNullishOr(fields.catalogId),
  })

/** Seeds rows as synced (not dirty). */
const given = (...rows: ReadonlyArray<Exercise>) =>
  LocalStore.use((store) =>
    store.write(
      rows.map((row) => ({ table: "exercise", row }) as const),
      { dirty: false },
    ),
  )

const exercises = LocalStore.use((store) =>
  store
    .all({ sql: `SELECT * FROM "exercise" ORDER BY "createdAt", "id"`, params: [] })
    .pipe(Effect.flatMap(decodeRecords(ExerciseRow))),
)

const dirtyCount = LocalStore.use((store) =>
  store.all({ sql: `SELECT COUNT(*) AS "n" FROM "exercise" WHERE "_dirty" = 1`, params: [] }),
).pipe(Effect.map((rows) => rows[0]?.n))

const ensure = (catalogId: CatalogId) => ExerciseLink.use((link) => link.ensure(catalogId))
const version = StoreEvents.use((events) => events.version)

describe("ExerciseLink.ensure", () => {
  it.effect("returns an exercise already linked to the catalog id without writing", () =>
    run(
      Effect.gen(function* () {
        yield* given(userExercise({ name: "My Squat", catalogId: SQUAT }))
        const before = yield* version
        expect(yield* ensure(SQUAT)).toBe(USER_EXERCISE)
        expect(yield* version).toBe(before)
        expect(yield* dirtyCount).toBe(0)
      }),
    ),
  )

  it.effect("links an exercise whose name equals the catalog name, case-insensitively", () =>
    run(
      Effect.gen(function* () {
        yield* given(userExercise({ name: "barbell BACK squat" }))
        const before = yield* version
        expect(yield* ensure(SQUAT)).toBe(USER_EXERCISE)
        const [row] = yield* exercises
        expect(row?.catalogId).toEqual(Option.some(SQUAT))
        expect(row?.name).toBe("barbell BACK squat")
        expect(row && DateTime.formatIso(row.updatedAt)).toBe("2026-10-21T08:00:00.000Z")
        expect(yield* dirtyCount).toBe(1)
        expect(yield* version).toBe(before + 1)
      }),
    ),
  )

  it.effect("links an exercise named like a catalog alias", () =>
    run(
      Effect.gen(function* () {
        yield* given(userExercise({ name: "Back Squat" }))
        expect(yield* ensure(SQUAT)).toBe(USER_EXERCISE)
        expect((yield* exercises).map((row) => row.catalogId)).toEqual([Option.some(SQUAT)])
        expect(yield* dirtyCount).toBe(1)
      }),
    ),
  )

  it.effect("links an exercise whose own alias matches a catalog alias", () =>
    run(
      Effect.gen(function* () {
        yield* given(userExercise({ name: "Leg Day Lift", aliases: ["bb squat"] }))
        const before = yield* version
        expect(yield* ensure(SQUAT)).toBe(USER_EXERCISE)
        expect((yield* exercises).map((row) => row.catalogId)).toEqual([Option.some(SQUAT)])
        expect(yield* version).toBe(before + 1)
      }),
    ),
  )

  it.effect("inserts the catalog exercise when nothing matches, dirty", () =>
    run(
      Effect.gen(function* () {
        yield* given(userExercise({ name: "Bench Press" }))
        const before = yield* version
        const id = yield* ensure(SQUAT)
        expect(id).toBe("00000000-0000-4000-8000-000000000001")
        const catalog = yield* Option.match(findCatalogExercise(SQUAT), {
          onNone: () => Effect.die("barbell-back-squat must be in the catalog"),
          onSome: Effect.succeed,
        })
        const inserted = (yield* exercises).find((row) => row.id === id)
        expect(inserted).toMatchObject({
          userId: LOCAL_USER_ID,
          name: catalog.name,
          aliases: catalog.aliases,
          muscleGroups: [...catalog.primaryMuscles, ...catalog.secondaryMuscles],
          notes: Option.none(),
          catalogId: Option.some(SQUAT),
          deletedAt: Option.none(),
        })
        expect(yield* dirtyCount).toBe(1)
        expect(yield* version).toBe(before + 1)
      }),
    ),
  )

  it.effect("ignores tombstoned exercises, linked or named alike", () =>
    run(
      Effect.gen(function* () {
        yield* given(
          userExercise({ name: "Old Squat", catalogId: SQUAT, deleted: true }),
          userExercise({
            name: "Back Squat",
            deleted: true,
            id: ExerciseId.make("00000000-0000-4000-8000-0000000000e2"),
          }),
        )
        const id = yield* ensure(SQUAT)
        expect(id).toBe("00000000-0000-4000-8000-000000000001")
        expect(yield* dirtyCount).toBe(1)
        expect((yield* exercises).filter((row) => Option.isNone(row.deletedAt))).toHaveLength(1)
      }),
    ),
  )

  it.effect("fails with a StoreError for an id missing from the catalog, without writing", () =>
    run(
      Effect.gen(function* () {
        const before = yield* version
        const error = yield* Effect.flip(ensure(CatalogId.make("no-such-exercise")))
        expect(error._tag).toBe("StoreError")
        expect(error.cause).toMatchObject({
          _tag: "UnknownCatalogExercise",
          catalogId: "no-such-exercise",
        })
        expect(yield* exercises).toHaveLength(0)
        expect(yield* version).toBe(before)
      }),
    ),
  )

  it.effect("serialises concurrent calls into one insert", () =>
    run(
      Effect.gen(function* () {
        const [first, second] = yield* Effect.all([ensure(SQUAT), ensure(SQUAT)], {
          concurrency: 2,
        })
        expect(second).toBe(first)
        expect(yield* exercises).toHaveLength(1)
      }),
    ),
  )
})
