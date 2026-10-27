import { D1Client } from "@effect/sql-d1"
import {
  FoodEntry,
  type FoodEntryId,
  FoodEntryRow,
  Forbidden,
  type SyncChange,
  Timestamp,
  type UserId,
} from "@tanren/shared"
import { Array as Arr, Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlSchema } from "effect/sql"
import { PersistenceError, persistenceError } from "../errors"
import { SyncStore } from "../sync/SyncStore"

/** A half-open time range: `from` included, `to` excluded. */
export interface FoodEntryRange {
  readonly from: DateTime.Utc
  readonly to: DateTime.Utc
}

/**
 * The Worker's food log (nutrition.md §2). Every write is a `SyncChange` through
 * `SyncStore.apply`, so LWW, the totals invariant, `server_seq` and the pull cursor behave exactly
 * as for client pushes.
 */
export interface FoodEntryRepoShape {
  /** Live rows with `loggedAt` in `[from, to)`, ordered by `loggedAt` (then id). */
  readonly listRange: (
    userId: UserId,
    range: FoodEntryRange,
  ) => Effect.Effect<ReadonlyArray<FoodEntry>, PersistenceError>
  /**
   * Writes the rows (LWW: a row not newer than the stored one keeps the stored one). A row of
   * another user is `Forbidden`; any other rejection (`invariantViolated`: totals ≠
   * `totalsOf(items)`) is a Worker bug: `PersistenceError` naming the reason and id.
   */
  readonly put: (
    userId: UserId,
    rows: ReadonlyArray<FoodEntry>,
  ) => Effect.Effect<void, PersistenceError | Forbidden>
  /** Tombstones the live row `id`; `false` when the user has no live row with that id. */
  readonly softDelete: (userId: UserId, id: FoodEntryId) => Effect.Effect<boolean, PersistenceError>
}

/**
 * The Worker's write wins LWW: `now`, or 1 ms past the stored row when that is not older (equal
 * clocks would otherwise land in `conflicts` and write nothing).
 */
const stampAfter = (now: DateTime.Utc, stored: DateTime.Utc): DateTime.Utc =>
  DateTime.isGreaterThan(now, stored) ? now : DateTime.add(stored, { milliseconds: 1 })

export class FoodEntryRepo extends Context.Service<FoodEntryRepo, FoodEntryRepoShape>()(
  "@tanren/FoodEntryRepo",
  {
    make: Effect.gen(function* () {
      const sql = yield* D1Client.D1Client
      const store = yield* SyncStore

      const inRange = SqlSchema.findAll({
        Request: Schema.Struct({ userId: Schema.String, from: Timestamp, to: Timestamp }),
        Result: FoodEntryRow,
        execute: ({ userId, from, to }) =>
          sql`SELECT * FROM food_entry WHERE user_id = ${userId} AND deleted_at IS NULL
            AND logged_at >= ${from} AND logged_at < ${to} ORDER BY logged_at, id`,
      })
      const liveById = SqlSchema.findOneOption({
        Request: Schema.Struct({ userId: Schema.String, id: Schema.String }),
        Result: FoodEntryRow,
        execute: ({ userId, id }) =>
          sql`SELECT * FROM food_entry WHERE user_id = ${userId} AND id = ${id}
            AND deleted_at IS NULL`,
      })

      /** Applies the changes; `forbidden` → `Forbidden`, any other rejection → `PersistenceError`. */
      const write = (
        operation: string,
        userId: UserId,
        changes: ReadonlyArray<SyncChange>,
      ): Effect.Effect<number, PersistenceError | Forbidden> =>
        Effect.gen(function* () {
          const { accepted, rejected } = yield* store.apply(userId, changes)
          if (Arr.some(rejected, (r) => r.reason === "forbidden")) {
            return yield* new Forbidden({ message: "the food entry belongs to another user" })
          }
          if (Arr.isReadonlyArrayNonEmpty(rejected)) {
            return yield* new PersistenceError({
              operation,
              cause: Arr.map(rejected, (r) => `${r.reason} ${r.id}: ${r.message}`),
            })
          }
          return accepted.length
        })

      const softDelete = Effect.fn("FoodEntryRepo.softDelete")(function* (
        userId: UserId,
        id: FoodEntryId,
      ) {
        const live = yield* liveById({ userId, id }).pipe(
          Effect.mapError(persistenceError("foodEntry.softDelete")),
        )
        if (Option.isNone(live)) {
          return false
        }
        const at = stampAfter(yield* DateTime.now, live.value.updatedAt)
        const row = yield* FoodEntry.makeEffect({
          ...live.value,
          updatedAt: at,
          deletedAt: Option.some(at),
        }).pipe(Effect.mapError(persistenceError("foodEntry.softDelete")))
        const written = yield* write("foodEntry.softDelete", userId, [
          { table: "foodEntry", row },
        ]).pipe(
          Effect.catchTag("Forbidden", (cause) =>
            Effect.fail(new PersistenceError({ operation: "foodEntry.softDelete", cause })),
          ),
        )
        return written > 0
      })

      return {
        listRange: (userId, range) =>
          inRange({ userId, from: range.from, to: range.to }).pipe(
            Effect.mapError(persistenceError("foodEntry.listRange")),
          ),
        put: (userId, rows) =>
          Effect.asVoid(
            write(
              "foodEntry.put",
              userId,
              Arr.map(rows, (row): SyncChange => ({ table: "foodEntry", row })),
            ),
          ),
        softDelete,
      }
    }),
  },
) {
  /** Needs `D1Client` and `SyncStore`. Not in `Repositories.layer` (no SyncStore there). */
  static readonly layer = Layer.effect(this, this.make)
}
