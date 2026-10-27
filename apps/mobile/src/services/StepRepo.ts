import type { CatalogId, ExerciseId } from "@tanren/shared"
import { Array as Arr, Context, DateTime, Effect, Layer, Option } from "effect"
import { LocalStore } from "./LocalStore"
import type { StoreError } from "./SqlDriver"

/**
 * Which exercise an override belongs to (weight-entry.md §2): the catalog id when the exercise is
 * linked, so Today and the program player share one override; else the user's own exercise id.
 */
export type StepKey = `catalog:${CatalogId}` | `exercise:${ExerciseId}`

export const stepKeyOf = (exercise: {
  readonly id: ExerciseId
  readonly catalogId: Option.Option<CatalogId>
}): StepKey =>
  Option.match(exercise.catalogId, {
    onNone: (): StepKey => `exercise:${exercise.id}`,
    onSome: (catalogId): StepKey => `catalog:${catalogId}`,
  })

export interface StepRepoShape {
  readonly get: (key: StepKey) => Effect.Effect<Option.Option<number>, StoreError>
  /** Upsert; `updatedAt` is now. */
  readonly set: (key: StepKey, stepKg: number) => Effect.Effect<void, StoreError>
  readonly clear: (key: StepKey) => Effect.Effect<void, StoreError>
}

const q = (sql: string, ...params: ReadonlyArray<string | number>) => ({ sql, params })

/** Device-local `exercise_step` (store v9, D2): the ± step override, never synced. */
export class StepRepo extends Context.Service<StepRepo, StepRepoShape>()("@tanren/StepRepo") {
  static readonly layer: Layer.Layer<StepRepo, never, LocalStore> = Layer.effect(
    this,
    Effect.gen(function* () {
      const store = yield* LocalStore
      return StepRepo.of({
        get: (key) =>
          store
            .all(q(`SELECT "stepKg" FROM "exercise_step" WHERE "key" = ?`, key))
            .pipe(
              Effect.map((rows) =>
                Option.flatMap(Arr.head(rows), (row) =>
                  typeof row.stepKg === "number" ? Option.some(row.stepKg) : Option.none(),
                ),
              ),
            ),
        set: (key, stepKg) =>
          DateTime.now.pipe(
            Effect.flatMap((now) =>
              store.exec([
                q(
                  `INSERT INTO "exercise_step" ("key", "stepKg", "updatedAt") VALUES (?, ?, ?)
                   ON CONFLICT ("key") DO UPDATE SET
                     "stepKg" = excluded."stepKg",
                     "updatedAt" = excluded."updatedAt"`,
                  key,
                  stepKg,
                  DateTime.formatIso(now),
                ),
              ]),
            ),
          ),
        clear: (key) => store.exec([q(`DELETE FROM "exercise_step" WHERE "key" = ?`, key)]),
      })
    }),
  )
}
