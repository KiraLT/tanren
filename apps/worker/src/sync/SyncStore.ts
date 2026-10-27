import {
  decodeCursor,
  encodeCursor,
  PersistenceError,
  type Position,
  positionOrder,
  START,
  SyncStore,
  type SyncStoreShape,
  tableRank,
} from "@tanren/db"
import {
  type AcceptedChange,
  type RejectedChange,
  SYNC_TABLE_ORDER,
  type SyncChange,
  type SyncTable,
  type UserId,
} from "@tanren/shared"
import { Array as Arr, DateTime, Effect, HashMap, Layer, Option, pipe, Ref } from "effect"
import {
  bumpClock,
  type MemoryState,
  MemoryStore,
  type RowByTable,
  type StoredRow,
  type Tables,
  uniqueViolation,
  writeRows,
} from "../repos"

// The sync port is `@tanren/db`'s `SyncStore` (D1, LWW and per-change rejection live there).
export { SyncStore }

/** Pairs a row with its table literal. Indexed by a generic key, so pairing stays type-correct. */
const wrap: { readonly [T in SyncTable]: (row: RowByTable[T]) => SyncChange } = {
  profile: (row) => ({ table: "profile", row }),
  exercise: (row) => ({ table: "exercise", row }),
  plan: (row) => ({ table: "plan", row }),
  planWeek: (row) => ({ table: "planWeek", row }),
  plannedSession: (row) => ({ table: "plannedSession", row }),
  plannedSet: (row) => ({ table: "plannedSet", row }),
  session: (row) => ({ table: "session", row }),
  set: (row) => ({ table: "set", row }),
  programEnrollment: (row) => ({ table: "programEnrollment", row }),
  programDayCompletion: (row) => ({ table: "programDayCompletion", row }),
  importedActivity: (row) => ({ table: "importedActivity", row }),
  dailyHealth: (row) => ({ table: "dailyHealth", row }),
  foodEntry: (row) => ({ table: "foodEntry", row }),
  program: (row) => ({ table: "program", row }),
}

interface Entry extends Position {
  readonly change: SyncChange
}

const entriesOf = <T extends SyncTable>(
  tables: Tables,
  table: T,
  userId: UserId,
): ReadonlyArray<Entry> => {
  const map: HashMap.HashMap<string, StoredRow<RowByTable[T]>> = tables[table]
  const toChange = wrap[table]
  return pipe(
    Arr.fromIterable(HashMap.values(map)),
    Arr.filter((stored) => stored.row.userId === userId),
    Arr.map((stored) => ({
      seq: stored.seq,
      rank: tableRank(table),
      id: stored.row.id,
      change: toChange(stored.row),
    })),
  )
}

const lookup = <T extends SyncTable>(
  tables: Tables,
  table: T,
  id: string,
  userId: UserId,
): Option.Option<SyncChange> => {
  const map: HashMap.HashMap<string, StoredRow<RowByTable[T]>> = tables[table]
  const toChange = wrap[table]
  return pipe(
    HashMap.get(map, id),
    Option.filter((stored) => stored.row.userId === userId),
    Option.map((stored) => toChange(stored.row)),
  )
}

/** Writes one change; `table` and `row` come from the same union member. */
const writeChange = (tables: Tables, change: SyncChange, seq: number): Tables =>
  writeRows(tables, change.table, [change.row], seq)

const makeMemory = Effect.gen(function* () {
  const { state } = yield* MemoryStore
  const store: SyncStoreShape = {
    getRows: (userId, keys) =>
      Ref.get(state).pipe(
        Effect.map((s) =>
          Arr.getSomes(Arr.map(keys, (key) => lookup(s.tables, key.table, key.id, userId))),
        ),
      ),
    apply: Effect.fn("SyncStore.apply")(function* (userId, changes) {
      const now = yield* DateTime.now
      const owned = Arr.filter(changes, (change) => change.row.userId === userId)
      const foreign = Arr.filter(changes, (change) => change.row.userId !== userId)
      const violation = yield* Ref.modify(
        state,
        (s): readonly [Option.Option<string>, MemoryState] => {
          const [seq, clock] = bumpClock(s.clock, userId)
          const tables = Arr.reduce(owned, s.tables, (acc, change) => writeChange(acc, change, seq))
          const found = uniqueViolation(tables, userId)
          return Option.isSome(found) ? [found, s] : [found, { tables, clock }]
        },
      )
      if (Option.isSome(violation)) {
        return yield* new PersistenceError({ operation: "sync.apply", cause: violation.value })
      }
      return {
        accepted: Arr.map(
          owned,
          (change): AcceptedChange => ({
            table: change.table,
            id: change.row.id,
            updatedAt: change.row.updatedAt,
          }),
        ),
        conflicts: [],
        rejected: Arr.map(
          foreign,
          (change): RejectedChange => ({
            table: change.table,
            id: change.row.id,
            reason: "forbidden",
            message: "the row belongs to another user",
          }),
        ),
        serverTime: now,
      }
    }),
    pull: Effect.fn("SyncStore.pull")(function* (userId, after, limit) {
      const from = Option.isSome(after) ? yield* decodeCursor(after.value) : START
      const s = yield* Ref.get(state)
      const pending = pipe(
        SYNC_TABLE_ORDER,
        Arr.flatMap((table) => entriesOf(s.tables, table, userId)),
        Arr.filter((entry) => positionOrder(entry, from) > 0),
        Arr.sort(positionOrder),
      )
      const page = Arr.take(pending, limit)
      const last = Option.getOrElse(Arr.last(page), () => from)
      return {
        changes: Arr.map(page, (entry) => entry.change),
        cursor: encodeCursor(last),
        hasMore: pending.length > page.length,
      }
    }),
  }
  return store
})

/**
 * A Node-test fake of `@tanren/db`'s `SyncStore` on the shared `MemoryStore`, so REST writes show
 * up in pull. `apply` writes every own row at one seq and rejects foreign `userId`s; it has no LWW,
 * clamp, parent or foreign-id checks (those are `@tanren/db`'s, tested in workerd).
 */
export const SyncStoreMemory: Layer.Layer<SyncStore, never, MemoryStore> = Layer.effect(
  SyncStore,
  makeMemory,
)
