import type { D1Client } from "@effect/sql-d1"
import { Forbidden, type SyncTable, type UserId } from "@tanren/shared"
import { Array as Arr, Effect, Schema } from "effect"
import type { Statement } from "effect/sql"
import { type PersistenceError, persistenceError } from "./errors"

/**
 * The write path every repository `put` reuses (db.md §3, §6): one D1 batch (one transaction) that
 * bumps the user's sync clock, then upserts each row with `server_seq` = the bumped value.
 */

/** Starts every write batch: the user's next monotonic write position. */
export const bumpClock = (sql: D1Client.D1Client, userId: UserId): Statement.Statement<never> =>
  sql`INSERT INTO sync_clock (user_id, seq) VALUES (${userId}, 1)
    ON CONFLICT (user_id) DO UPDATE SET seq = seq + 1`

export interface UpsertTarget {
  /** SQL table name (`ROW_TABLE[t]`). */
  readonly table: string
  /** camelCase record keys (`ROW_KEYS[t]`); the client turns them into snake_case columns. */
  readonly keys: ReadonlyArray<string>
  /** Never updated on conflict, beyond `id`, `userId`, `createdAt`: immutable parent ids. */
  readonly immutable: ReadonlyArray<string>
}

const ALWAYS_IMMUTABLE: ReadonlyArray<string> = ["id", "userId", "createdAt"]

/**
 * `INSERT … ON CONFLICT (id) DO UPDATE` for one encoded row. The `WHERE` makes a foreign user's id
 * a no-op instead of an overwrite. One statement per row keeps us under D1's 100 bound parameters.
 */
export const upsertRow = (
  sql: D1Client.D1Client,
  target: UpsertTarget,
  userId: UserId,
  record: Readonly<Record<string, unknown>>,
): Statement.Statement<never> => {
  const updatable = target.keys.filter(
    (key) => !ALWAYS_IMMUTABLE.includes(key) && !target.immutable.includes(key),
  )
  return sql`INSERT INTO ${sql(target.table)}
    (${sql.csv(target.keys.map((key) => sql`${sql(key)}`))}, server_seq)
    VALUES (${sql.csv(target.keys.map((key) => sql`${record[key]}`))},
      (SELECT seq FROM sync_clock WHERE user_id = ${userId}))
    ON CONFLICT (id) DO UPDATE SET
      ${sql.csv(updatable.map((key) => sql`${sql(key)} = excluded.${sql(key)}`))},
      server_seq = excluded.server_seq
    WHERE ${sql(target.table)}.user_id = excluded.user_id`
}

/** A synced row: its owner is checked before anything is written. */
interface OwnedRow {
  readonly userId: UserId
}

/**
 * Builds a repository `put`: fails with `Forbidden` if any row belongs to another user, otherwise
 * encodes every row with its codec and writes clock bump + upserts in one batch. No LWW here.
 */
export const makePut =
  <A extends OwnedRow, I extends Readonly<Record<string, unknown>>>(
    sql: D1Client.D1Client,
    entity: SyncTable,
    codec: Schema.Codec<A, I>,
    target: UpsertTarget,
  ) =>
  (userId: UserId, rows: ReadonlyArray<A>): Effect.Effect<void, PersistenceError | Forbidden> =>
    Effect.gen(function* () {
      if (rows.some((row) => row.userId !== userId)) {
        return yield* new Forbidden({ message: `${entity} rows must belong to the caller` })
      }
      if (!Arr.isReadonlyArrayNonEmpty(rows)) {
        return
      }
      const records = yield* Effect.forEach(rows, (row) => Schema.encodeEffect(codec)(row)).pipe(
        Effect.mapError(persistenceError(`${entity}.put`)),
      )
      yield* sql
        .batch([
          bumpClock(sql, userId),
          ...records.map((record) => upsertRow(sql, target, userId, record)),
        ])
        .pipe(Effect.mapError(persistenceError(`${entity}.put`)))
    })
