import {
  FoodEntry,
  FoodEntryId,
  type FoodEntryInsert,
  FoodEntryRow,
  IdGenerator,
  totalsOf,
} from "@tanren/shared"
import { Array as Arr, Context, DateTime, Effect, Layer, Option, Semaphore } from "effect"
import { CurrentUser, ownerId } from "./CurrentUser"
import { decodeRecords, LocalStore, type LocalStoreShape } from "./LocalStore"
import { StoreError } from "./SqlDriver"

/** What a caller supplies: the repo derives the four totals from `items` (SyncStore invariant). */
export type FoodEntryDraft = Omit<FoodEntryInsert, "kcal" | "proteinG" | "carbsG" | "fatG">

export interface FoodEntryRepoShape {
  /** Stamps id, owner, sync columns and `totalsOf(items)`; writes the row dirty (synced). */
  readonly insert: (draft: FoodEntryDraft) => Effect.Effect<FoodEntry, StoreError>
  /** Live rows with `loggedAt` in `[from, to)`, `loggedAt` ascending. */
  readonly list: (range: {
    readonly from: DateTime.Utc
    readonly to: DateTime.Utc
  }) => Effect.Effect<ReadonlyArray<FoodEntry>, StoreError>
  /** `true` when a live row was tombstoned (dirty); `false` when missing or already deleted. */
  readonly softDelete: (id: FoodEntryId) => Effect.Effect<boolean, StoreError>
  /** `true` when a deleted row came back (dirty); `false` when missing or live. */
  readonly restore: (id: FoodEntryId) => Effect.Effect<boolean, StoreError>
}

const LIST = `SELECT * FROM "food_entry" WHERE "deletedAt" IS NULL AND "loggedAt" >= ? AND "loggedAt" < ?
  ORDER BY "loggedAt" ASC, "id" ASC`
const BY_ID = `SELECT * FROM "food_entry" WHERE "id" = ? LIMIT 1`

/** The one live-food query: rows with `loggedAt` in `[from, to)`, ascending. `NutritionRepo` reuses it. */
export const liveFoodEntries = (
  store: LocalStoreShape,
  range: { readonly from: DateTime.Utc; readonly to: DateTime.Utc },
): Effect.Effect<ReadonlyArray<FoodEntry>, StoreError> =>
  store
    .all({ sql: LIST, params: [DateTime.formatIso(range.from), DateTime.formatIso(range.to)] })
    .pipe(Effect.flatMap(decodeRecords(FoodEntryRow)))

/**
 * Delete / Undo for the food log: runs `flip` (`softDelete` or `restore`), then `requestSync` only
 * when the row changed. A store failure succeeds with `false`, so the caller never sees an error.
 */
export const flipAndSync = <R>(
  flip: (repo: FoodEntryRepoShape) => Effect.Effect<boolean, StoreError>,
  requestSync: Effect.Effect<void, never, R>,
): Effect.Effect<boolean, never, FoodEntryRepo | R> =>
  FoodEntryRepo.use(flip).pipe(
    Effect.tap((changed) => (changed ? requestSync : Effect.void)),
    Effect.catch(() => Effect.succeed(false)),
  )

export class FoodEntryRepo extends Context.Service<FoodEntryRepo, FoodEntryRepoShape>()(
  "@tanren/FoodEntryRepo",
) {
  /** Needs `LocalStore`, `CurrentUser` and `IdGenerator`, as `ProfileRepo` does. */
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const store = yield* LocalStore
      const ids = yield* IdGenerator
      const owner = ownerId(yield* CurrentUser)
      // One permit: a tombstone/restore reads then writes, and two must not interleave.
      const lock = yield* Semaphore.make(1)

      const save = (entry: FoodEntry) =>
        store.write([{ table: "foodEntry", row: entry }], { dirty: true })

      const build = (fields: ConstructorParameters<typeof FoodEntry>[0]) =>
        FoodEntry.makeEffect(fields).pipe(Effect.mapError((cause) => new StoreError({ cause })))

      const insert = (draft: FoodEntryDraft) =>
        Effect.gen(function* () {
          const userId = yield* owner
          const now = yield* DateTime.now
          const id = FoodEntryId.make(yield* ids.next)
          const entry = yield* build({
            ...draft,
            ...totalsOf(draft.items),
            id,
            userId,
            createdAt: now,
            updatedAt: now,
            deletedAt: Option.none(),
          })
          yield* save(entry)
          return entry
        })

      const list = (range: { readonly from: DateTime.Utc; readonly to: DateTime.Utc }) =>
        liveFoodEntries(store, range)

      const byId = (id: FoodEntryId) =>
        store
          .all({ sql: BY_ID, params: [id] })
          .pipe(Effect.flatMap(decodeRecords(FoodEntryRow)), Effect.map(Arr.head))

      /** Rewrites the row when `eligible` holds for it; `true` when it did. */
      const flip = (
        id: FoodEntryId,
        eligible: (entry: FoodEntry) => boolean,
        deletedAt: (now: DateTime.Utc) => Option.Option<DateTime.Utc>,
      ) =>
        lock.withPermits(1)(
          Effect.gen(function* () {
            const found = Option.filter(yield* byId(id), eligible)
            if (Option.isNone(found)) {
              return false
            }
            const now = yield* DateTime.now
            yield* save(yield* build({ ...found.value, updatedAt: now, deletedAt: deletedAt(now) }))
            return true
          }),
        )

      const softDelete = (id: FoodEntryId) =>
        flip(id, (entry) => Option.isNone(entry.deletedAt), Option.some)
      const restore = (id: FoodEntryId) =>
        flip(id, (entry) => Option.isSome(entry.deletedAt), Option.none)

      return FoodEntryRepo.of({ insert, list, softDelete, restore })
    }),
  )
}
