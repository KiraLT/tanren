import { FoodEntryRepo, PersistenceError } from "@tanren/db"
import { FoodEntry, Forbidden, totalsOf } from "@tanren/shared"
import { Array as Arr, DateTime, Effect, HashMap, Layer, Option, Order, Ref } from "effect"
import { MemoryStore } from "./MemoryStore"

const isLive = (row: FoodEntry) => Option.isNone(row.deletedAt)

const byLoggedAt: Order.Order<FoodEntry> = Order.combine(
  Order.mapInput(DateTime.Order, (row: FoodEntry) => row.loggedAt),
  Order.mapInput(Order.String, (row: FoodEntry) => row.id),
)

const totalsMatch = (row: FoodEntry): boolean => {
  const totals = totalsOf(row.items)
  return (
    totals.kcal === row.kcal &&
    totals.proteinG === row.proteinG &&
    totals.carbsG === row.carbsG &&
    totals.fatG === row.fatG
  )
}

/**
 * In-memory `FoodEntryRepo` for Node tests, on the shared `MemoryStore` (so `/sync/pull` sees the
 * rows). Like the D1 repo over `SyncStore.apply`: an id another user holds is `Forbidden`, totals
 * unequal to `totalsOf(items)` are a `PersistenceError` naming `invariantViolated` and the id. No
 * LWW: the last write wins.
 */
export const MemoryFoodEntry = {
  layer: Layer.effect(
    FoodEntryRepo,
    Effect.gen(function* () {
      const store = yield* MemoryStore

      const put = (userId: FoodEntry["userId"], rows: ReadonlyArray<FoodEntry>) =>
        Effect.gen(function* () {
          const held = (yield* Ref.get(store.state)).tables.foodEntry
          const foreign = Arr.some(rows, (row) =>
            Option.exists(HashMap.get(held, row.id), (stored) => stored.row.userId !== userId),
          )
          if (foreign) {
            return yield* new Forbidden({ message: "the food entry belongs to another user" })
          }
          const invalid = Arr.filter(rows, (row) => !totalsMatch(row))
          if (Arr.isReadonlyArrayNonEmpty(invalid)) {
            return yield* new PersistenceError({
              operation: "foodEntry.put",
              cause: Arr.map(invalid, (row) => `invariantViolated ${row.id}`),
            })
          }
          if (Arr.isReadonlyArrayNonEmpty(rows)) {
            yield* store.put("foodEntry", userId, rows)
          }
        })

      const listRange = (
        userId: FoodEntry["userId"],
        range: { readonly from: DateTime.Utc; readonly to: DateTime.Utc },
      ) =>
        Effect.map(store.rows("foodEntry", userId), (stored) =>
          Arr.sort(
            Arr.filter(
              Arr.map(stored, (s) => s.row),
              (row) =>
                isLive(row) &&
                !DateTime.isLessThan(row.loggedAt, range.from) &&
                DateTime.isLessThan(row.loggedAt, range.to),
            ),
            byLoggedAt,
          ),
        )

      const softDelete = (userId: FoodEntry["userId"], id: FoodEntry["id"]) =>
        Effect.gen(function* () {
          const live = Arr.findFirst(
            yield* store.rows("foodEntry", userId),
            (s) => s.row.id === id && isLive(s.row),
          )
          if (Option.isNone(live)) {
            return false
          }
          const now = yield* DateTime.now
          const row = yield* FoodEntry.makeEffect({
            ...live.value.row,
            updatedAt: now,
            deletedAt: Option.some(now),
          }).pipe(
            Effect.mapError(
              (cause) => new PersistenceError({ operation: "foodEntry.softDelete", cause }),
            ),
          )
          yield* store
            .put("foodEntry", userId, [row])
            .pipe(
              Effect.catchTag("Forbidden", (cause) =>
                Effect.fail(new PersistenceError({ operation: "foodEntry.softDelete", cause })),
              ),
            )
          return true
        })

      return FoodEntryRepo.of({ listRange, put, softDelete })
    }),
  ),
} as const
