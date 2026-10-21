import {
  type CatalogExercise,
  type CatalogId,
  Exercise,
  ExerciseId,
  ExerciseRow,
  findCatalogExercise,
  IdGenerator,
  newId,
  type SyncChange,
} from "@tanren/shared"
import { Array as Arr, Context, Data, DateTime, Effect, Layer, Option, Semaphore } from "effect"
import { CurrentUser, ownerId } from "./CurrentUser"
import { decodeRecords, LocalStore } from "./LocalStore"
import { StoreError } from "./SqlDriver"

/**
 * Internal cause of the `StoreError` `ensure` fails with when the id is not in the bundled catalog
 * (e.g. a row synced from a newer app version). Wrapped so `ensure` keeps the frozen §4 signature.
 */
export class UnknownCatalogExercise extends Data.TaggedError("UnknownCatalogExercise")<{
  readonly catalogId: CatalogId
}> {}

export interface ExerciseLinkShape {
  /**
   * Live exercise with this catalogId → its id; else a live unlinked exercise whose name/alias matches the
   * catalog name or an alias (case-insensitive) → patch its catalogId, return it; else insert
   * { name, aliases, muscleGroups: primary ++ secondary, notes: None, catalogId } and return the
   * new id. Dirty-marks what it writes; `LocalStore.write` bumps `StoreEvents`. An id missing from
   * the catalog fails with a `StoreError` whose cause is `UnknownCatalogExercise`, without writing.
   */
  readonly ensure: (catalogId: CatalogId) => Effect.Effect<ExerciseId, StoreError>
}

const lower = (value: string): string => value.toLowerCase()

/** Name and aliases, lower-cased: the terms a user exercise is matched on. */
const terms = (entry: { readonly name: string; readonly aliases: ReadonlyArray<string> }) =>
  [entry.name, ...entry.aliases].map(lower)

const matchesCatalog = (catalog: CatalogExercise) => {
  const wanted = terms(catalog)
  return (exercise: Exercise): boolean => terms(exercise).some((term) => wanted.includes(term))
}

const toStoreError = (cause: unknown): StoreError => new StoreError({ cause })

export class ExerciseLink extends Context.Service<ExerciseLink, ExerciseLinkShape>()(
  "@tanren/ExerciseLink",
) {
  /**
   * Needs `LocalStore | CurrentUser | IdGenerator`; `StoreEvents` (named in the §4 port) is reached
   * through `LocalStore.write`, which bumps it, so it is not a direct requirement.
   */
  static readonly layerNoDeps = Layer.effect(
    this,
    Effect.gen(function* () {
      const store = yield* LocalStore
      const ids = yield* IdGenerator
      const owner = ownerId(yield* CurrentUser)
      /** Two quick taps must not both insert the same catalog exercise. */
      const lock = yield* Semaphore.make(1)

      const liveExercises = (userId: string) =>
        store
          .all({
            sql: `SELECT * FROM "exercise" WHERE "userId" = ? AND "deletedAt" IS NULL
                  ORDER BY "createdAt", "id"`,
            params: [userId],
          })
          .pipe(Effect.flatMap(decodeRecords(ExerciseRow)))

      const writeExercise = (row: Exercise) =>
        store.write([{ table: "exercise", row } satisfies SyncChange], { dirty: true })

      const ensure = (catalogId: CatalogId) =>
        lock.withPermits(1)(
          Effect.gen(function* () {
            const catalog = yield* Option.match(findCatalogExercise(catalogId), {
              onNone: () => Effect.fail(toStoreError(new UnknownCatalogExercise({ catalogId }))),
              onSome: Effect.succeed,
            })
            const userId = yield* owner
            const exercises = yield* liveExercises(userId)
            const linked = Arr.findFirst(exercises, (exercise) =>
              Option.exists(exercise.catalogId, (id) => id === catalogId),
            )
            if (Option.isSome(linked)) {
              return linked.value.id
            }
            const now = yield* DateTime.now
            // Only unlinked rows: a row linked to another entry keeps its link (no flip-flopping).
            const matches = matchesCatalog(catalog)
            const named = Arr.findFirst(
              exercises,
              (exercise) => Option.isNone(exercise.catalogId) && matches(exercise),
            )
            if (Option.isSome(named)) {
              const patched = yield* Exercise.makeEffect({
                ...named.value,
                catalogId: Option.some(catalogId),
                updatedAt: now,
              }).pipe(Effect.mapError(toStoreError))
              yield* writeExercise(patched)
              return patched.id
            }
            const id = yield* newId(ExerciseId).pipe(Effect.provideService(IdGenerator, ids))
            const inserted = yield* Exercise.makeEffect({
              id,
              userId,
              createdAt: now,
              updatedAt: now,
              deletedAt: Option.none(),
              name: catalog.name,
              aliases: catalog.aliases,
              muscleGroups: Arr.dedupe([...catalog.primaryMuscles, ...catalog.secondaryMuscles]),
              notes: Option.none(),
              catalogId: Option.some(catalogId),
            }).pipe(Effect.mapError(toStoreError))
            yield* writeExercise(inserted)
            return inserted.id
          }),
        )

      return ExerciseLink.of({ ensure })
    }),
  )
}
