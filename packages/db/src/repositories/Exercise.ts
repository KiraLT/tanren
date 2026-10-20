import { D1Client } from "@effect/sql-d1"
import {
  type Exercise,
  ExerciseId,
  ExerciseRow,
  type Forbidden,
  ROW_KEYS,
  ROW_TABLE,
  UserId,
} from "@tanren/shared"
import { Context, Effect, Layer, type Option, Schema } from "effect"
import { SqlSchema } from "effect/sql"
import { type PersistenceError, persistenceError } from "../errors"
import { makePut } from "../syncClock"

export interface ExerciseRepoShape {
  readonly get: (
    userId: UserId,
    id: ExerciseId,
  ) => Effect.Effect<Option.Option<Exercise>, PersistenceError>
  /** Ordered by `(created_at, id)`; tombstones only with `includeDeleted`. */
  readonly list: (
    userId: UserId,
    opts: { readonly includeDeleted: boolean },
  ) => Effect.Effect<ReadonlyArray<Exercise>, PersistenceError>
  /** Upsert full rows in one batch (db.md §6). A second live row with the same `lower(name)` aborts it. */
  readonly put: (
    userId: UserId,
    rows: ReadonlyArray<Exercise>,
  ) => Effect.Effect<void, PersistenceError | Forbidden>
}

export class ExerciseRepo extends Context.Service<ExerciseRepo, ExerciseRepoShape>()(
  "@tanren/ExerciseRepo",
  {
    make: Effect.gen(function* () {
      const sql = yield* D1Client.D1Client

      const findById = SqlSchema.findOneOption({
        Request: Schema.Struct({ userId: UserId, id: ExerciseId }),
        Result: ExerciseRow,
        execute: ({ userId, id }) =>
          sql`SELECT * FROM exercise WHERE user_id = ${userId} AND id = ${id}`,
      })
      const findAll = SqlSchema.findAll({
        Request: Schema.Struct({ userId: UserId, includeDeleted: Schema.Boolean }),
        Result: ExerciseRow,
        execute: ({ userId, includeDeleted }) =>
          sql`SELECT * FROM exercise WHERE user_id = ${userId}
            ${includeDeleted ? sql`` : sql`AND deleted_at IS NULL`}
            ORDER BY created_at, id`,
      })

      return {
        get: (userId, id) =>
          findById({ userId, id }).pipe(Effect.mapError(persistenceError("exercise.get"))),
        list: (userId, { includeDeleted }) =>
          findAll({ userId, includeDeleted }).pipe(
            Effect.mapError(persistenceError("exercise.list")),
          ),
        put: makePut(sql, "exercise", ExerciseRow, {
          table: ROW_TABLE.exercise,
          keys: ROW_KEYS.exercise,
          immutable: [],
        }),
      }
    }),
  },
) {
  /** Needs `D1Client` (`D1Layer(env.DB)`). */
  static readonly layer = Layer.effect(this, this.make)
}
