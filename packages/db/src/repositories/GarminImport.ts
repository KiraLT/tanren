import { D1Client } from "@effect/sql-d1"
import {
  DailyHealth,
  DailyHealthId,
  type DailyHealthInsert,
  DailyHealthRow,
  IdGenerator,
  ImportedActivity,
  ImportedActivityId,
  type ImportedActivityInsert,
  ImportedActivityRow,
  type LocalDate,
  type Provider,
  type SyncChange,
  Timestamp,
  type UserId,
} from "@tanren/shared"
import {
  Array as Arr,
  Context,
  DateTime,
  Effect,
  HashMap,
  Layer,
  Option,
  Result,
  Schema,
} from "effect"
import { SqlSchema, type Statement } from "effect/sql"
import { PersistenceError, persistenceError } from "../errors"
import { SyncStore } from "../sync/SyncStore"

/** Live imported rows of one user and provider (`ProviderStatus.imports`, garmin.md §1). */
export interface ImportCounts {
  readonly activities: number
  readonly days: number
}

/**
 * The Worker's write path for the pull-only import tables (garmin.md §2). Every write is a
 * `SyncChange` through `SyncStore.apply` with the Worker as author, so LWW, `server_seq` and the
 * pull cursor behave exactly as for client pushes. A natural key (`(provider, externalId)` /
 * `(provider, date)`) that already has a row, tombstone included, reuses that row's id and
 * `createdAt`; a repeated key in one call keeps its last row.
 */
export interface GarminImportRepoShape {
  /** Returns the number of rows written. */
  readonly upsertActivities: (
    userId: UserId,
    rows: ReadonlyArray<ImportedActivityInsert>,
  ) => Effect.Effect<number, PersistenceError>
  readonly upsertDays: (
    userId: UserId,
    rows: ReadonlyArray<DailyHealthInsert>,
  ) => Effect.Effect<number, PersistenceError>
  /** Soft-deletes every live row of `provider` in both tables, 500 per apply; returns the count. */
  readonly softDeleteAll: (
    userId: UserId,
    provider: Provider,
  ) => Effect.Effect<number, PersistenceError>
  /** Live (not soft-deleted) rows per table. */
  readonly counts: (
    userId: UserId,
    provider: Provider,
  ) => Effect.Effect<ImportCounts, PersistenceError>
  /** Live day rows (every provider) with `date` in `[from, to]`, both ends included, by date. */
  readonly listDays: (
    userId: UserId,
    from: LocalDate,
    to: LocalDate,
  ) => Effect.Effect<ReadonlyArray<DailyHealth>, PersistenceError>
  /**
   * Live activities (every provider) with `from <= started_at < to`, newest first by
   * `(started_at DESC, id)`, at most `limit` (one statement).
   */
  readonly listActivities: (
    userId: UserId,
    range: { readonly from: DateTime.Utc; readonly to: DateTime.Utc },
    limit: number,
  ) => Effect.Effect<ReadonlyArray<ImportedActivity>, PersistenceError>
}

/** One `SyncStore.apply` per page: `MAX_PUSH_CHANGES`. */
const PAGE = 500

const CountsRecord = Schema.Struct({ activities: Schema.Number, days: Schema.Number })

const activityKey = (row: { readonly provider: Provider; readonly externalId: string }) =>
  `${row.provider}|${row.externalId}`
const dayKey = (row: { readonly provider: Provider; readonly date: string }) =>
  `${row.provider}|${row.date}`

/** The last row per key, in first-seen order. */
const lastByKey = <A>(rows: ReadonlyArray<A>, key: (a: A) => string): ReadonlyArray<A> => {
  const last = HashMap.fromIterable(Arr.map(rows, (row) => [key(row), row] as const))
  return Arr.filterMap(Arr.dedupe(Arr.map(rows, key)), (k) =>
    Option.match(HashMap.get(last, k), {
      onNone: () => Result.failVoid,
      onSome: (row) => Result.succeed(row),
    }),
  )
}

/**
 * The Worker's write wins LWW: `now`, or 1 ms past the stored row when that is not older (equal
 * clocks would otherwise land in `conflicts` and write nothing).
 */
const stampAfter = (now: DateTime.Utc, existing: Option.Option<DateTime.Utc>): DateTime.Utc =>
  Option.match(existing, {
    onNone: () => now,
    onSome: (stored) =>
      DateTime.isGreaterThan(now, stored) ? now : DateTime.add(stored, { milliseconds: 1 }),
  })

/**
 * Every column of two encoded records is equal, `updatedAt` aside. A pull re-reads yesterday and
 * today on every run: an unchanged live row is skipped, so it keeps its `server_seq` and clients do
 * not download it again.
 */
const sameRecord = (
  stored: Readonly<Record<string, unknown>>,
  next: Readonly<Record<string, unknown>>,
): boolean => Object.keys(next).every((key) => key === "updatedAt" || stored[key] === next[key])

const encodeActivity = Schema.encodeEffect(ImportedActivityRow)
const encodeDay = Schema.encodeEffect(DailyHealthRow)

/**
 * The in-batch half of the disconnect gate (`SyncStore.apply`'s `guard`): passes while
 * `(userId, provider)` has an active integration, else errors and aborts the D1 batch (one
 * transaction). `json()` of non-JSON text is that runtime error. Exported for its test.
 */
export const activeIntegrationGuard = (
  sql: D1Client.D1Client,
  userId: UserId,
  provider: Provider,
): Statement.Statement<unknown> =>
  sql`SELECT CASE WHEN EXISTS (SELECT 1 FROM integration WHERE user_id = ${userId}
      AND provider = ${provider} AND status = 'active') THEN 1
    ELSE json('no active ' || ${provider} || ' integration') END AS ok`

export class GarminImportRepo extends Context.Service<GarminImportRepo, GarminImportRepoShape>()(
  "@tanren/GarminImportRepo",
  {
    make: Effect.gen(function* () {
      const sql = yield* D1Client.D1Client
      const store = yield* SyncStore
      const ids = yield* IdGenerator

      const activitiesByKey = SqlSchema.findAll({
        Request: Schema.Struct({ userId: Schema.String, keys: Schema.String }),
        Result: ImportedActivityRow,
        execute: ({ userId, keys }) =>
          sql`SELECT * FROM imported_activity WHERE user_id = ${userId}
            AND provider || '|' || external_id IN (SELECT value FROM json_each(${keys}))`,
      })
      const daysByKey = SqlSchema.findAll({
        Request: Schema.Struct({ userId: Schema.String, keys: Schema.String }),
        Result: DailyHealthRow,
        execute: ({ userId, keys }) =>
          sql`SELECT * FROM daily_health WHERE user_id = ${userId}
            AND provider || '|' || date IN (SELECT value FROM json_each(${keys}))`,
      })
      const liveActivities = SqlSchema.findAll({
        Request: Schema.Struct({ userId: Schema.String, provider: Schema.String }),
        Result: ImportedActivityRow,
        execute: ({ userId, provider }) =>
          sql`SELECT * FROM imported_activity WHERE user_id = ${userId}
            AND provider = ${provider} AND deleted_at IS NULL ORDER BY id LIMIT ${PAGE}`,
      })
      const liveDays = SqlSchema.findAll({
        Request: Schema.Struct({ userId: Schema.String, provider: Schema.String }),
        Result: DailyHealthRow,
        execute: ({ userId, provider }) =>
          sql`SELECT * FROM daily_health WHERE user_id = ${userId}
            AND provider = ${provider} AND deleted_at IS NULL ORDER BY id LIMIT ${PAGE}`,
      })
      const daysInRange = SqlSchema.findAll({
        Request: Schema.Struct({ userId: Schema.String, from: Schema.String, to: Schema.String }),
        Result: DailyHealthRow,
        execute: ({ userId, from, to }) =>
          sql`SELECT * FROM daily_health WHERE user_id = ${userId} AND deleted_at IS NULL
            AND date >= ${from} AND date <= ${to} ORDER BY date, provider`,
      })
      const activitiesInRange = SqlSchema.findAll({
        Request: Schema.Struct({
          userId: Schema.String,
          from: Timestamp,
          to: Timestamp,
          limit: Schema.Number,
        }),
        Result: ImportedActivityRow,
        execute: ({ userId, from, to, limit }) =>
          sql`SELECT * FROM imported_activity WHERE user_id = ${userId} AND deleted_at IS NULL
            AND started_at >= ${from} AND started_at < ${to}
            ORDER BY started_at DESC, id LIMIT ${limit}`,
      })
      const countRows = SqlSchema.findOne({
        Request: Schema.Struct({ userId: Schema.String, provider: Schema.String }),
        Result: CountsRecord,
        execute: ({ userId, provider }) =>
          sql`SELECT
            (SELECT count(*) FROM imported_activity WHERE user_id = ${userId}
              AND provider = ${provider} AND deleted_at IS NULL) AS activities,
            (SELECT count(*) FROM daily_health WHERE user_id = ${userId}
              AND provider = ${provider} AND deleted_at IS NULL) AS days`,
      })

      /**
       * Applies Worker-authored changes, `PAGE` per apply; returns the rows written. A rejection is
       * a Worker bug, never a client's: `PersistenceError`.
       */
      const write = (
        operation: string,
        userId: UserId,
        changes: ReadonlyArray<SyncChange>,
        guard?: Statement.Statement<unknown>,
      ): Effect.Effect<number, PersistenceError> =>
        Effect.reduce(
          Arr.chunksOf(changes, PAGE),
          () => 0,
          (total, chunk) =>
            store
              .apply(userId, chunk, guard)
              .pipe(
                Effect.flatMap((result) =>
                  Arr.isReadonlyArrayNonEmpty(result.rejected)
                    ? Effect.fail(new PersistenceError({ operation, cause: result.rejected }))
                    : Effect.succeed(total + result.accepted.length),
                ),
              ),
        )

      /** The changes an activity upsert writes: new or changed rows, revived tombstones. */
      const activityChanges = Effect.fn("GarminImportRepo.activityChanges")(
        function* (userId: UserId, rows: ReadonlyArray<ImportedActivityInsert>) {
          const unique = lastByKey(rows, activityKey)
          const existing = yield* activitiesByKey({
            userId,
            keys: JSON.stringify(Arr.map(unique, activityKey)),
          })
          const stored = HashMap.fromIterable(
            Arr.map(existing, (row) => [activityKey(row), row] as const),
          )
          const now = yield* DateTime.now
          const changes = yield* Effect.forEach(unique, (insert) =>
            Effect.gen(function* () {
              const prior = HashMap.get(stored, activityKey(insert))
              const id = Option.isSome(prior)
                ? prior.value.id
                : ImportedActivityId.make(yield* ids.next)
              const row = yield* ImportedActivity.makeEffect({
                ...insert,
                id,
                userId,
                createdAt: Option.match(prior, { onNone: () => now, onSome: (p) => p.createdAt }),
                updatedAt: stampAfter(
                  now,
                  Option.map(prior, (p) => p.updatedAt),
                ),
                deletedAt: Option.none(),
              })
              if (Option.isSome(prior) && Option.isNone(prior.value.deletedAt)) {
                const before = yield* encodeActivity(prior.value)
                const after = yield* encodeActivity(row)
                if (sameRecord(before, after)) {
                  return Option.none<SyncChange>()
                }
              }
              return Option.some<SyncChange>({ table: "importedActivity", row })
            }),
          )
          return Arr.getSomes(changes)
        },
        Effect.mapError(persistenceError("garminImport.upsertActivities")),
      )

      /** The changes a day upsert writes: new or changed rows, revived tombstones. */
      const dayChanges = Effect.fn("GarminImportRepo.dayChanges")(
        function* (userId: UserId, rows: ReadonlyArray<DailyHealthInsert>) {
          const unique = lastByKey(rows, dayKey)
          const existing = yield* daysByKey({
            userId,
            keys: JSON.stringify(Arr.map(unique, dayKey)),
          })
          const stored = HashMap.fromIterable(
            Arr.map(existing, (row) => [dayKey(row), row] as const),
          )
          const now = yield* DateTime.now
          const changes = yield* Effect.forEach(unique, (insert) =>
            Effect.gen(function* () {
              const prior = HashMap.get(stored, dayKey(insert))
              const id = Option.isSome(prior) ? prior.value.id : DailyHealthId.make(yield* ids.next)
              const row = yield* DailyHealth.makeEffect({
                ...insert,
                id,
                userId,
                createdAt: Option.match(prior, { onNone: () => now, onSome: (p) => p.createdAt }),
                updatedAt: stampAfter(
                  now,
                  Option.map(prior, (p) => p.updatedAt),
                ),
                deletedAt: Option.none(),
              })
              if (Option.isSome(prior) && Option.isNone(prior.value.deletedAt)) {
                const before = yield* encodeDay(prior.value)
                const after = yield* encodeDay(row)
                if (sameRecord(before, after)) {
                  return Option.none<SyncChange>()
                }
              }
              return Option.some<SyncChange>({ table: "dailyHealth", row })
            }),
          )
          return Arr.getSomes(changes)
        },
        Effect.mapError(persistenceError("garminImport.upsertDays")),
      )

      /** One page of tombstones for the live rows of `provider` in both tables. */
      const tombstonePage = Effect.fn("GarminImportRepo.tombstonePage")(
        function* (userId: UserId, provider: Provider) {
          const now = yield* DateTime.now
          const activities = yield* liveActivities({ userId, provider })
          const days = yield* liveDays({ userId, provider })
          const tombstones = yield* Effect.all([
            Effect.forEach(activities, (live) => {
              const at = stampAfter(now, Option.some(live.updatedAt))
              return Effect.map(
                ImportedActivity.makeEffect({ ...live, updatedAt: at, deletedAt: Option.some(at) }),
                (row): SyncChange => ({ table: "importedActivity", row }),
              )
            }),
            Effect.forEach(days, (live) => {
              const at = stampAfter(now, Option.some(live.updatedAt))
              return Effect.map(
                DailyHealth.makeEffect({ ...live, updatedAt: at, deletedAt: Option.some(at) }),
                (row): SyncChange => ({ table: "dailyHealth", row }),
              )
            }),
          ])
          return {
            changes: [...tombstones[0], ...tombstones[1]],
            full: activities.length === PAGE || days.length === PAGE,
          }
        },
        Effect.mapError(persistenceError("garminImport.softDeleteAll")),
      )

      /** Tombstones page after page while a page came back full (and wrote something). */
      const deletePages = (
        userId: UserId,
        provider: Provider,
        done: number,
      ): Effect.Effect<number, PersistenceError> =>
        Effect.gen(function* () {
          const page = yield* tombstonePage(userId, provider)
          const written = yield* write("garminImport.softDeleteAll", userId, page.changes)
          return page.full && written > 0
            ? yield* deletePages(userId, provider, done + written)
            : done + written
        })

      /**
       * Disconnect wins over a pull in flight (it soft-deletes, then removes the row): an upsert
       * writes nothing without an active connection, checked before building the changes and again
       * inside the write batch, where `activeGuard` aborts it if the row went away meanwhile.
       */
      const activeIntegration = SqlSchema.findAll({
        Request: Schema.Struct({ userId: Schema.String, provider: Schema.String }),
        Result: Schema.Struct({ id: Schema.String }),
        execute: ({ userId, provider }) =>
          sql`SELECT id FROM integration WHERE user_id = ${userId}
            AND provider = ${provider} AND status = 'active'`,
      })
      const activeGuard = (userId: UserId, provider: Provider) =>
        activeIntegrationGuard(sql, userId, provider)

      /** Writes `changes` for each provider they carry, only while that provider is connected. */
      const writeConnected = (
        operation: string,
        userId: UserId,
        providers: ReadonlyArray<Provider>,
        changesOf: (
          provider: Provider,
        ) => Effect.Effect<ReadonlyArray<SyncChange>, PersistenceError>,
      ) =>
        Effect.reduce(
          Arr.dedupe(providers),
          () => 0,
          (total, provider) =>
            Effect.gen(function* () {
              const active = yield* activeIntegration({ userId, provider }).pipe(
                Effect.mapError(persistenceError(operation)),
              )
              if (!Arr.isReadonlyArrayNonEmpty(active)) {
                return total
              }
              const changes = yield* changesOf(provider)
              return (
                total + (yield* write(operation, userId, changes, activeGuard(userId, provider)))
              )
            }),
        )

      return {
        upsertActivities: (userId, rows) =>
          writeConnected(
            "garminImport.upsertActivities",
            userId,
            Arr.map(rows, (r) => r.provider),
            (provider) =>
              activityChanges(
                userId,
                Arr.filter(rows, (r) => r.provider === provider),
              ),
          ),
        upsertDays: (userId, rows) =>
          writeConnected(
            "garminImport.upsertDays",
            userId,
            Arr.map(rows, (r) => r.provider),
            (provider) =>
              dayChanges(
                userId,
                Arr.filter(rows, (r) => r.provider === provider),
              ),
          ),
        softDeleteAll: (userId, provider) => deletePages(userId, provider, 0),
        counts: (userId, provider) =>
          countRows({ userId, provider }).pipe(
            Effect.mapError(persistenceError("garminImport.counts")),
          ),
        listDays: (userId, from, to) =>
          daysInRange({ userId, from, to }).pipe(
            Effect.mapError(persistenceError("garminImport.listDays")),
          ),
        listActivities: (userId, { from, to }, limit) =>
          activitiesInRange({ userId, from, to, limit }).pipe(
            Effect.mapError(persistenceError("garminImport.listActivities")),
          ),
      }
    }),
  },
) {
  /** Needs `D1Client`, `SyncStore` and `IdGenerator`. Not in `Repositories.layer` (no IdGenerator there). */
  static readonly layer = Layer.effect(this, this.make)
}
