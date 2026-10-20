import { PersistenceError } from "@tanren/db"
import {
  Exercise,
  Forbidden,
  Plan,
  PlannedSession,
  PlannedSet,
  PlanWeek,
  Profile,
  Session,
  type SyncTable,
  type UserId,
  WorkoutSet,
} from "@tanren/shared"
import { Array as Arr, Context, Effect, HashMap, Layer, Option, pipe, Ref } from "effect"

/** The row type stored for each synced table. */
export interface RowByTable {
  readonly profile: Profile
  readonly exercise: Exercise
  readonly plan: Plan
  readonly planWeek: PlanWeek
  readonly plannedSession: PlannedSession
  readonly plannedSet: PlannedSet
  readonly session: Session
  readonly set: WorkoutSet
}

/** A row plus its server sync position (the in-memory `server_seq`, db.md §3). */
export interface StoredRow<Row> {
  readonly row: Row
  readonly seq: number
}

export type Tables = {
  readonly [T in SyncTable]: HashMap.HashMap<string, StoredRow<RowByTable[T]>>
}

export interface MemoryState {
  readonly tables: Tables
  /** Per-user write clock (`sync_clock`): bumped once per `put` batch. */
  readonly clock: HashMap.HashMap<UserId, number>
}

const emptyState: MemoryState = {
  tables: {
    profile: HashMap.empty(),
    exercise: HashMap.empty(),
    plan: HashMap.empty(),
    planWeek: HashMap.empty(),
    plannedSession: HashMap.empty(),
    plannedSet: HashMap.empty(),
    session: HashMap.empty(),
    set: HashMap.empty(),
  },
  clock: HashMap.empty(),
}

type AnyRow = RowByTable[SyncTable]

export interface MemoryStoreShape {
  /** Raw state, for `SyncStore.layerMemory` (pull by seq, atomic multi-table apply). */
  readonly state: Ref.Ref<MemoryState>
  /** The caller's rows of one table, tombstones included, in insertion-independent id order. */
  readonly rows: <T extends SyncTable>(
    table: T,
    userId: UserId,
  ) => Effect.Effect<ReadonlyArray<StoredRow<RowByTable[T]>>>
  /**
   * Upsert full rows as one batch sharing one new seq (db.md §6 semantics). Fails `Forbidden` on a
   * foreign `userId`, `PersistenceError` (nothing written) when a unique index would be violated.
   */
  readonly put: <T extends SyncTable>(
    table: T,
    userId: UserId,
    rows: ReadonlyArray<RowByTable[T]>,
  ) => Effect.Effect<void, Forbidden | PersistenceError>
}

const ownedBy = (userId: UserId) => (row: AnyRow) => row.userId === userId

/** Next seq for `userId` and the clock with it recorded. */
export const bumpClock = (
  clock: MemoryState["clock"],
  userId: UserId,
): readonly [number, MemoryState["clock"]] => {
  const seq = Option.getOrElse(HashMap.get(clock, userId), () => 0) + 1
  return [seq, HashMap.set(clock, userId, seq)]
}

type Keep<T extends SyncTable> = (stored: RowByTable[T], incoming: RowByTable[T]) => RowByTable[T]

/**
 * D1's upsert `SET` skips id, user_id, created_at and the immutable parent id: rebuild the incoming
 * row with the stored values. `makeOption` validates without throwing; it cannot fail for two valid
 * rows of the same table, and if it ever did the incoming row is kept.
 */
const keep: { readonly [T in SyncTable]: Keep<T> } = {
  profile: (s, i) =>
    Option.getOrElse(
      Profile.makeOption({ ...i, id: s.id, userId: s.userId, createdAt: s.createdAt }),
      () => i,
    ),
  exercise: (s, i) =>
    Option.getOrElse(
      Exercise.makeOption({ ...i, id: s.id, userId: s.userId, createdAt: s.createdAt }),
      () => i,
    ),
  plan: (s, i) =>
    Option.getOrElse(
      Plan.makeOption({ ...i, id: s.id, userId: s.userId, createdAt: s.createdAt }),
      () => i,
    ),
  planWeek: (s, i) =>
    Option.getOrElse(
      PlanWeek.makeOption({
        ...i,
        id: s.id,
        userId: s.userId,
        createdAt: s.createdAt,
        planId: s.planId,
      }),
      () => i,
    ),
  plannedSession: (s, i) =>
    Option.getOrElse(
      PlannedSession.makeOption({
        ...i,
        id: s.id,
        userId: s.userId,
        createdAt: s.createdAt,
        planWeekId: s.planWeekId,
      }),
      () => i,
    ),
  plannedSet: (s, i) =>
    Option.getOrElse(
      PlannedSet.makeOption({
        ...i,
        id: s.id,
        userId: s.userId,
        createdAt: s.createdAt,
        plannedSessionId: s.plannedSessionId,
      }),
      () => i,
    ),
  session: (s, i) =>
    Option.getOrElse(
      Session.makeOption({ ...i, id: s.id, userId: s.userId, createdAt: s.createdAt }),
      () => i,
    ),
  set: (s, i) =>
    Option.getOrElse(
      WorkoutSet.makeOption({
        ...i,
        id: s.id,
        userId: s.userId,
        createdAt: s.createdAt,
        sessionId: s.sessionId,
      }),
      () => i,
    ),
}

/**
 * Writes `rows` into one table at `seq`. Pure; callers own atomicity via `Ref.modify`. Like D1's
 * `WHERE <table>.user_id = excluded.user_id`, a row whose stored owner differs is silently skipped.
 */
export const writeRows = <T extends SyncTable>(
  tables: Tables,
  table: T,
  rows: ReadonlyArray<RowByTable[T]>,
  seq: number,
): Tables => {
  const current: HashMap.HashMap<string, StoredRow<RowByTable[T]>> = tables[table]
  const keepStored: Keep<T> = keep[table]
  const next = Arr.reduce(rows, current, (map, row) =>
    Option.match(HashMap.get(map, row.id), {
      onNone: () => HashMap.set(map, row.id, { row, seq }),
      onSome: (stored) =>
        stored.row.userId === row.userId
          ? HashMap.set(map, row.id, { row: keepStored(stored.row, row), seq })
          : map,
    }),
  )
  return { ...tables, [table]: next }
}

const liveRows = <T extends SyncTable>(
  tables: Tables,
  table: T,
  userId: UserId,
): ReadonlyArray<RowByTable[T]> => {
  const map: HashMap.HashMap<string, StoredRow<RowByTable[T]>> = tables[table]
  return pipe(
    Arr.fromIterable(HashMap.values(map)),
    Arr.map((stored) => stored.row),
    Arr.filter((row) => row.userId === userId && Option.isNone(row.deletedAt)),
  )
}

const hasDuplicate = (keys: ReadonlyArray<string>): boolean =>
  keys.some((key, i) => keys.indexOf(key) !== i)

/** The D1 unique indexes (db.md §2): the first one `tables` violates for `userId`, if any. */
export const uniqueViolation = (tables: Tables, userId: UserId): Option.Option<string> => {
  const plans = liveRows(tables, "plan", userId)
  const weeks = liveRows(tables, "planWeek", userId)
  const exercises = liveRows(tables, "exercise", userId)
  if (plans.filter((plan) => plan.status === "active").length > 1) {
    return Option.some("plan_user_active_unique")
  }
  if (hasDuplicate(weeks.map((week) => `${week.planId}:${week.weekStart}`))) {
    return Option.some("plan_week_plan_week_start_unique")
  }
  if (hasDuplicate(exercises.map((exercise) => exercise.name.toLowerCase()))) {
    return Option.some("exercise_user_name_unique")
  }
  return Option.none()
}

export class MemoryStore extends Context.Service<MemoryStore, MemoryStoreShape>()(
  "@tanren/worker/MemoryStore",
) {
  /** A fresh, empty store per layer build. */
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const state = yield* Ref.make(emptyState)
      const rows = <T extends SyncTable>(table: T, userId: UserId) =>
        Ref.get(state).pipe(
          Effect.map((s) => {
            const map: HashMap.HashMap<string, StoredRow<RowByTable[T]>> = s.tables[table]
            return pipe(
              Arr.fromIterable(HashMap.values(map)),
              Arr.filter((stored) => ownedBy(userId)(stored.row)),
            )
          }),
        )
      const put = <T extends SyncTable>(
        table: T,
        userId: UserId,
        batch: ReadonlyArray<RowByTable[T]>,
      ): Effect.Effect<void, Forbidden | PersistenceError> =>
        Arr.every(batch, ownedBy(userId))
          ? Ref.modify(state, (s): readonly [Option.Option<string>, MemoryState] => {
              const [seq, clock] = bumpClock(s.clock, userId)
              const tables = writeRows(s.tables, table, batch, seq)
              const violation = uniqueViolation(tables, userId)
              return Option.isSome(violation) ? [violation, s] : [violation, { tables, clock }]
            }).pipe(
              Effect.flatMap(
                Option.match({
                  onNone: () => Effect.void,
                  onSome: (index) =>
                    Effect.fail(new PersistenceError({ operation: `${table}.put`, cause: index })),
                }),
              ),
            )
          : Effect.fail(new Forbidden({ message: "rows must belong to the signed-in user" }))
      return MemoryStore.of({ state, rows, put })
    }),
  )
}
