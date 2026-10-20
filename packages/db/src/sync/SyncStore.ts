import { D1Client } from "@effect/sql-d1"
import {
  type AcceptedChange,
  ExerciseRow,
  PlannedSessionRow,
  PlannedSetRow,
  PlanRow,
  PlanWeekRow,
  ProfileRow,
  type PushResponse,
  type RejectedChange,
  type RejectReason,
  ROW_KEYS,
  ROW_TABLE,
  SessionRow,
  SYNC_TABLE_ORDER,
  type SyncChange,
  type SyncCursor,
  type SyncTable,
  Timestamp,
  type UserId,
  type ValidationError,
  WorkoutSetRow,
} from "@tanren/shared"
import {
  Array as Arr,
  Context,
  DateTime,
  Effect,
  HashMap,
  HashSet,
  Layer,
  Match,
  Option,
  Order,
  pipe,
  Result,
  Schema,
} from "effect"
import { type PersistenceError, persistenceError } from "../errors"
import { bumpClock, upsertRow } from "../syncClock"
import {
  decodeCursor,
  encodeCursor,
  type Position,
  positionOrder,
  START,
  tableRank,
} from "./Cursor"

export interface SyncKey {
  readonly table: SyncTable
  readonly id: string
}

/** The full `PushResponse`; `serverTime` is the store's `DateTime.now` (DM §10.2 rule 1). */
export type PushResult = PushResponse

export interface PullPage {
  readonly changes: ReadonlyArray<SyncChange>
  /** Position of the last change (or the input position when the page is empty). */
  readonly cursor: SyncCursor
  readonly hasMore: boolean
}

export interface SyncStoreShape {
  /** The caller's existing rows for `keys` (tombstones included). Unknown keys are skipped. */
  readonly getRows: (
    userId: UserId,
    keys: ReadonlyArray<SyncKey>,
  ) => Effect.Effect<ReadonlyArray<SyncChange>, PersistenceError>
  /**
   * Applies a push by the DM §10.2 rules: parents first, per-change `forbidden` / `invariantViolated`
   * / `missingParent` / `immutableFieldChanged` rejections (a repeated `(table, id)` after its first
   * change in request order is `invariantViolated`; a parent that is missing, another user's, or
   * rejected in this push is `missingParent`), LWW on `updatedAt` (ties and older go to
   * `conflicts` with the server row), `updatedAt` > now + 5 min clamped to now. Every accepted row is
   * written in ONE `D1Client.batch` behind one clock bump, so all share one `server_seq`; a failing
   * statement aborts the whole push (`PersistenceError`, nothing written). No accepted rows: no write.
   */
  readonly apply: (
    userId: UserId,
    changes: ReadonlyArray<SyncChange>,
  ) => Effect.Effect<PushResult, PersistenceError>
  /** Rows after `after` in the server sync order `(seq, table rank, id)`, tombstones included. */
  readonly pull: (
    userId: UserId,
    after: Option.Option<SyncCursor>,
    limit: number,
  ) => Effect.Effect<PullPage, PersistenceError | ValidationError>
}

type Key = string
const keyOf = (table: SyncTable, id: string): Key => `${table}:${id}`
const changeKey = (change: SyncChange): Key => keyOf(change.table, change.row.id)

/** D1 allows 100 bound parameters per statement; `user_id` takes one. */
const ID_CHUNK = 90

const CLOCK_SKEW_LIMIT = { minutes: 5 } as const

/** Decodes a DB record (camelCase) of `table` into its change. Uniform type per table. */
const decodeRow: {
  readonly [T in SyncTable]: (record: unknown) => Effect.Effect<SyncChange, Schema.SchemaError>
} = {
  profile: (r) =>
    Effect.map(Schema.decodeUnknownEffect(ProfileRow)(r), (row) => ({ table: "profile", row })),
  exercise: (r) =>
    Effect.map(Schema.decodeUnknownEffect(ExerciseRow)(r), (row) => ({ table: "exercise", row })),
  plan: (r) =>
    Effect.map(Schema.decodeUnknownEffect(PlanRow)(r), (row) => ({ table: "plan", row })),
  planWeek: (r) =>
    Effect.map(Schema.decodeUnknownEffect(PlanWeekRow)(r), (row) => ({ table: "planWeek", row })),
  plannedSession: (r) =>
    Effect.map(Schema.decodeUnknownEffect(PlannedSessionRow)(r), (row) => ({
      table: "plannedSession",
      row,
    })),
  plannedSet: (r) =>
    Effect.map(Schema.decodeUnknownEffect(PlannedSetRow)(r), (row) => ({
      table: "plannedSet",
      row,
    })),
  session: (r) =>
    Effect.map(Schema.decodeUnknownEffect(SessionRow)(r), (row) => ({ table: "session", row })),
  set: (r) =>
    Effect.map(Schema.decodeUnknownEffect(WorkoutSetRow)(r), (row) => ({ table: "set", row })),
}

const encodeRow = (
  change: SyncChange,
): Effect.Effect<Readonly<Record<string, unknown>>, Schema.SchemaError> =>
  Match.value(change).pipe(
    Match.discriminatorsExhaustive("table")({
      profile: ({ row }) => Schema.encodeEffect(ProfileRow)(row),
      exercise: ({ row }) => Schema.encodeEffect(ExerciseRow)(row),
      plan: ({ row }) => Schema.encodeEffect(PlanRow)(row),
      planWeek: ({ row }) => Schema.encodeEffect(PlanWeekRow)(row),
      plannedSession: ({ row }) => Schema.encodeEffect(PlannedSessionRow)(row),
      plannedSet: ({ row }) => Schema.encodeEffect(PlannedSetRow)(row),
      session: ({ row }) => Schema.encodeEffect(SessionRow)(row),
      set: ({ row }) => Schema.encodeEffect(WorkoutSetRow)(row),
    }),
  )

const syncKey = (table: SyncTable, id: string): SyncKey => ({ table, id })

/** Parents that must exist for the same user (DM §10.2; the FKs of db.md §1). */
const parentKeys = (change: SyncChange): ReadonlyArray<SyncKey> =>
  Match.value(change).pipe(
    Match.discriminatorsExhaustive("table")({
      profile: () => [],
      exercise: () => [],
      plan: () => [],
      planWeek: ({ row }) => [syncKey("plan", row.planId)],
      plannedSession: ({ row }) => [syncKey("planWeek", row.planWeekId)],
      plannedSet: ({ row }) => [
        syncKey("plannedSession", row.plannedSessionId),
        syncKey("exercise", row.exerciseId),
      ],
      session: () => [],
      set: ({ row }) => [syncKey("session", row.sessionId), syncKey("exercise", row.exerciseId)],
    }),
  )

/** The owning parent of a row (its immutable parent key, DM §11.1), none for root tables. */
const chainParent = (change: SyncChange): Option.Option<SyncKey> =>
  Match.value(change).pipe(
    Match.discriminatorsExhaustive("table")({
      profile: () => Option.none(),
      exercise: () => Option.none(),
      plan: () => Option.none(),
      planWeek: ({ row }) => Option.some(syncKey("plan", row.planId)),
      plannedSession: ({ row }) => Option.some(syncKey("planWeek", row.planWeekId)),
      plannedSet: ({ row }) => Option.some(syncKey("plannedSession", row.plannedSessionId)),
      session: () => Option.none(),
      set: ({ row }) => Option.some(syncKey("session", row.sessionId)),
    }),
  )

/** The immutable parent id of a row (DM §11.1), `""` for tables without one. */
const immutableParent = (change: SyncChange): string =>
  Option.match(chainParent(change), { onNone: () => "", onSome: (parent) => parent.id })

const IMMUTABLE: { readonly [T in SyncTable]: ReadonlyArray<string> } = {
  profile: [],
  exercise: [],
  plan: [],
  planWeek: ["planId"],
  plannedSession: ["planWeekId"],
  plannedSet: ["plannedSessionId"],
  session: [],
  set: ["sessionId"],
}

const pushOrder: Order.Order<SyncChange> = Order.combine(
  Order.mapInput(Order.Number, (change: SyncChange) => tableRank(change.table)),
  Order.mapInput(DateTime.Order, (change: SyncChange) => change.row.updatedAt),
)

interface Write {
  readonly change: SyncChange
  readonly updatedAt: DateTime.Utc
}

interface Outcome {
  readonly accepted: ReadonlyArray<AcceptedChange>
  readonly conflicts: ReadonlyArray<SyncChange>
  readonly rejected: ReadonlyArray<RejectedChange>
  readonly writes: ReadonlyArray<Write>
  /** Keys that exist for this user or were accepted earlier in this push. */
  readonly known: HashSet.HashSet<Key>
  /** The subset of `known` that is soft-deleted after the changes accepted so far. */
  readonly tombstoned: HashSet.HashSet<Key>
}

interface Snapshot {
  readonly userId: UserId
  readonly now: DateTime.Utc
  readonly own: HashMap.HashMap<Key, SyncChange>
  readonly foreign: HashSet.HashSet<Key>
}

const reject = (
  outcome: Outcome,
  change: SyncChange,
  reason: RejectReason,
  message: string,
): Outcome => ({
  ...outcome,
  rejected: [
    ...outcome.rejected,
    { table: change.table, id: change.row.id, reason, message } satisfies RejectedChange,
  ],
})

const accept = (outcome: Outcome, change: SyncChange, updatedAt: DateTime.Utc): Outcome => ({
  ...outcome,
  accepted: [...outcome.accepted, { table: change.table, id: change.row.id, updatedAt }],
  writes: [...outcome.writes, { change, updatedAt }],
  known: HashSet.add(outcome.known, changeKey(change)),
  tombstoned: Option.isSome(change.row.deletedAt)
    ? HashSet.add(outcome.tombstoned, changeKey(change))
    : HashSet.remove(outcome.tombstoned, changeKey(change)),
})

/** One step of DM §10.2 rule 3. Pure: all lookups come from the snapshot. */
const decide = (snapshot: Snapshot, outcome: Outcome, change: SyncChange): Outcome => {
  const { row } = change
  const key = changeKey(change)
  if (row.userId !== snapshot.userId || HashSet.has(snapshot.foreign, key)) {
    return reject(outcome, change, "forbidden", "the row belongs to another user")
  }
  if (change.table === "profile" && row.id !== snapshot.userId) {
    return reject(outcome, change, "invariantViolated", "profile.id must equal the user id")
  }
  const missing = Arr.filter(
    Arr.map(parentKeys(change), (parent) => keyOf(parent.table, parent.id)),
    (parent) => !HashSet.has(outcome.known, parent),
  )
  if (Arr.isReadonlyArrayNonEmpty(missing)) {
    return reject(outcome, change, "missingParent", `missing parent ${missing.join(", ")}`)
  }
  // A soft-deleted owner gains no live children (a deleted session cannot gain sets); tombstones
  // still go through, so a cascaded delete (parent + children in one push) is accepted.
  const deletedOwner = Option.filter(
    Option.map(chainParent(change), (parent) => keyOf(parent.table, parent.id)),
    (parent) => Option.isNone(row.deletedAt) && HashSet.has(outcome.tombstoned, parent),
  )
  if (Option.isSome(deletedOwner)) {
    return reject(outcome, change, "missingParent", `deleted parent ${deletedOwner.value}`)
  }
  const limit = DateTime.add(snapshot.now, CLOCK_SKEW_LIMIT)
  const effective = DateTime.isGreaterThan(row.updatedAt, limit) ? snapshot.now : row.updatedAt
  return Option.match(HashMap.get(snapshot.own, key), {
    onNone: () => accept(outcome, change, effective),
    onSome: (existing) => {
      if (
        !DateTime.Equivalence(existing.row.createdAt, row.createdAt) ||
        immutableParent(existing) !== immutableParent(change)
      ) {
        return reject(outcome, change, "immutableFieldChanged", "createdAt or parent id changed")
      }
      return DateTime.isGreaterThan(effective, existing.row.updatedAt)
        ? accept(outcome, change, effective)
        : { ...outcome, conflicts: [...outcome.conflicts, existing] }
    },
  })
}

interface Split {
  readonly unique: ReadonlyArray<SyncChange>
  readonly duplicates: ReadonlyArray<SyncChange>
}

/** Splits off every change after the first for its `(table, id)`, in request order. O(n). */
const splitDuplicates = (changes: ReadonlyArray<SyncChange>): Split => {
  const firstIndex = Arr.reduce(changes, HashMap.empty<Key, number>(), (acc, change, i) =>
    HashMap.has(acc, changeKey(change)) ? acc : HashMap.set(acc, changeKey(change), i),
  )
  const [unique, duplicates] = Arr.partition(changes, (change, i) =>
    Option.exists(HashMap.get(firstIndex, changeKey(change)), (first) => first === i)
      ? Result.succeed(change)
      : Result.fail(change),
  )
  return { unique, duplicates }
}

const IdRecord = Schema.Struct({ id: Schema.String })
const PositionRecord = Schema.Struct({ id: Schema.String, serverSeq: Schema.Number })

interface Entry extends Position {
  readonly change: SyncChange
}

export class SyncStore extends Context.Service<SyncStore, SyncStoreShape>()("@tanren/SyncStore", {
  make: Effect.gen(function* () {
    const sql = yield* D1Client.D1Client

    const idsByTable = (keys: ReadonlyArray<SyncKey>, table: SyncTable) =>
      Arr.chunksOf(
        Arr.dedupe(
          Arr.map(
            Arr.filter(keys, (k) => k.table === table),
            (k) => k.id,
          ),
        ),
        ID_CHUNK,
      )

    /** The caller's rows for `keys`, tombstones included. */
    const ownRows = (userId: UserId, keys: ReadonlyArray<SyncKey>) =>
      Effect.forEach(SYNC_TABLE_ORDER, (table) =>
        Effect.forEach(idsByTable(keys, table), (ids) =>
          sql`SELECT * FROM ${sql(ROW_TABLE[table])}
            WHERE user_id = ${userId} AND ${sql.in("id", ids)}`.pipe(
            Effect.flatMap((records) => Effect.forEach(records, decodeRow[table])),
          ),
        ),
      ).pipe(Effect.map((tables) => Arr.flatten(Arr.flatten(tables))))

    /** Keys among `keys` whose id is taken by another user's row: an upsert would be a no-op. */
    const foreignKeys = (userId: UserId, keys: ReadonlyArray<SyncKey>) =>
      Effect.forEach(SYNC_TABLE_ORDER, (table) =>
        Effect.forEach(idsByTable(keys, table), (ids) =>
          sql`SELECT id FROM ${sql(ROW_TABLE[table])}
            WHERE user_id <> ${userId} AND ${sql.in("id", ids)}`.pipe(
            Effect.flatMap((records) =>
              Effect.forEach(records, (r) => Schema.decodeUnknownEffect(IdRecord)(r)),
            ),
            Effect.map(Arr.map(({ id }) => keyOf(table, id))),
          ),
        ),
      ).pipe(Effect.map((tables) => HashSet.fromIterable(Arr.flatten(Arr.flatten(tables)))))

    const toRecord = ({ change, updatedAt }: Write) =>
      Effect.gen(function* () {
        const record = yield* encodeRow(change)
        return { ...record, updatedAt: yield* Schema.encodeEffect(Timestamp)(updatedAt) }
      })

    const apply = Effect.fn("SyncStore.apply")(
      function* (userId: UserId, changes: ReadonlyArray<SyncChange>) {
        const now = yield* DateTime.now
        const { unique, duplicates } = splitDuplicates(changes)
        const sorted = Arr.sort(unique, pushOrder)
        const keys = Arr.map(sorted, (c) => ({ table: c.table, id: c.row.id }))
        const own = yield* ownRows(userId, Arr.appendAll(keys, Arr.flatMap(sorted, parentKeys)))
        const snapshot: Snapshot = {
          userId,
          now,
          own: HashMap.fromIterable(Arr.map(own, (c) => [changeKey(c), c] as const)),
          foreign: yield* foreignKeys(userId, keys),
        }
        const initial: Outcome = {
          accepted: [],
          conflicts: [],
          rejected: [],
          writes: [],
          known: HashSet.fromIterable(HashMap.keys(snapshot.own)),
          tombstoned: HashSet.fromIterable(
            Arr.map(
              Arr.filter(own, (c) => Option.isSome(c.row.deletedAt)),
              changeKey,
            ),
          ),
        }
        const outcome = Arr.reduce(
          duplicates,
          Arr.reduce(sorted, initial, (acc, change) => decide(snapshot, acc, change)),
          (acc, change) =>
            reject(acc, change, "invariantViolated", "the push already changes this row"),
        )
        if (Arr.isReadonlyArrayNonEmpty(outcome.writes)) {
          const records = yield* Effect.forEach(outcome.writes, toRecord)
          const statements = Arr.map(Arr.zip(outcome.writes, records), ([{ change }, record]) =>
            upsertRow(
              sql,
              {
                table: ROW_TABLE[change.table],
                keys: ROW_KEYS[change.table],
                immutable: IMMUTABLE[change.table],
              },
              userId,
              record,
            ),
          )
          yield* sql.batch([bumpClock(sql, userId), ...statements])
        }
        return {
          accepted: outcome.accepted,
          conflicts: outcome.conflicts,
          rejected: outcome.rejected,
          serverTime: now,
        } satisfies PushResult
      },
      Effect.mapError(persistenceError("sync.apply")),
    )

    /** Rows of one table after `from`, at most `limit`, in sync order. */
    const pageOf = (userId: UserId, table: SyncTable, from: Position, limit: number) => {
      const rank = tableRank(table)
      const after =
        rank > from.rank
          ? sql`server_seq >= ${from.seq}`
          : rank < from.rank
            ? sql`server_seq > ${from.seq}`
            : sql`(server_seq > ${from.seq} OR (server_seq = ${from.seq} AND id > ${from.id}))`
      return sql`SELECT * FROM ${sql(ROW_TABLE[table])}
        WHERE user_id = ${userId} AND ${after}
        ORDER BY server_seq, id LIMIT ${limit}`.pipe(
        Effect.flatMap((records) =>
          Effect.forEach(records, (record) =>
            Effect.all({
              position: Schema.decodeUnknownEffect(PositionRecord)(record),
              change: decodeRow[table](record),
            }).pipe(
              Effect.map(
                ({ position, change }): Entry => ({
                  seq: position.serverSeq,
                  rank,
                  id: position.id,
                  change,
                }),
              ),
            ),
          ),
        ),
      )
    }

    const pull = Effect.fn("SyncStore.pull")(function* (
      userId: UserId,
      after: Option.Option<SyncCursor>,
      limit: number,
    ) {
      const from = Option.isSome(after) ? yield* decodeCursor(after.value) : START
      // Each table's first `limit + 1` rows contain the merged first `limit + 1`.
      const pending = yield* Effect.forEach(SYNC_TABLE_ORDER, (table) =>
        pageOf(userId, table, from, limit + 1),
      ).pipe(
        Effect.map((tables) => Arr.sort(Arr.flatten(tables), positionOrder)),
        Effect.mapError(persistenceError("sync.pull")),
      )
      const page = Arr.take(pending, limit)
      const last: Position = pipe(
        Arr.last(page),
        Option.getOrElse(() => from),
      )
      return {
        changes: Arr.map(page, (entry) => entry.change),
        cursor: encodeCursor(last),
        hasMore: pending.length > page.length,
      } satisfies PullPage
    })

    const getRows = (userId: UserId, keys: ReadonlyArray<SyncKey>) =>
      ownRows(userId, keys).pipe(Effect.mapError(persistenceError("sync.getRows")))

    return { getRows, apply, pull }
  }),
}) {
  /** Needs `D1Client` (`D1Layer(env.DB)`). */
  static readonly layer = Layer.effect(this, this.make)
}
