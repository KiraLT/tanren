import { D1Client } from "@effect/sql-d1"
import {
  type Forbidden,
  type Profile,
  ProfileRow,
  ROW_KEYS,
  ROW_TABLE,
  UserId,
} from "@tanren/shared"
import { Context, Effect, Layer, type Option, Schema } from "effect"
import { SqlSchema } from "effect/sql"
import { type PersistenceError, persistenceError } from "../errors"
import { makePut } from "../syncClock"

export interface ProfileRepoShape {
  /** The caller's profile (`id = user_id`), tombstoned or not. */
  readonly get: (userId: UserId) => Effect.Effect<Option.Option<Profile>, PersistenceError>
  /** Upsert in one batch (db.md §6); the table's `CHECK (id = user_id)` rejects a foreign id. */
  readonly put: (
    userId: UserId,
    rows: ReadonlyArray<Profile>,
  ) => Effect.Effect<void, PersistenceError | Forbidden>
}

export class ProfileRepo extends Context.Service<ProfileRepo, ProfileRepoShape>()(
  "@tanren/ProfileRepo",
  {
    make: Effect.gen(function* () {
      const sql = yield* D1Client.D1Client

      const findByUser = SqlSchema.findOneOption({
        Request: Schema.Struct({ userId: UserId }),
        Result: ProfileRow,
        execute: ({ userId }) => sql`SELECT * FROM profile WHERE user_id = ${userId}`,
      })

      return {
        get: (userId) =>
          findByUser({ userId }).pipe(Effect.mapError(persistenceError("profile.get"))),
        put: makePut(sql, "profile", ProfileRow, {
          table: ROW_TABLE.profile,
          keys: ROW_KEYS.profile,
          immutable: [],
        }),
      }
    }),
  },
) {
  /** Needs `D1Client` (`D1Layer(env.DB)`). */
  static readonly layer = Layer.effect(this, this.make)
}
