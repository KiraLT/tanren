import { Context, Data, Effect, Layer, Schema, Semaphore } from "effect"

/** A value SQLite binds or returns in this store: no blobs, no booleans, no bigints. */
export type SqlValue = string | number | null
export type SqlRecord = Readonly<Record<string, SqlValue>>
export interface SqlStatement {
  readonly sql: string
  readonly params: ReadonlyArray<SqlValue>
}

/** Internal: a driver call failed or returned a value outside `SqlValue`. */
export class StoreError extends Data.TaggedError("StoreError")<{ readonly cause: unknown }> {}

export interface SqlDriverShape {
  readonly all: (statement: SqlStatement) => Effect.Effect<ReadonlyArray<SqlRecord>, StoreError>
  /** Runs every statement in one transaction: all apply or none. */
  readonly batch: (statements: ReadonlyArray<SqlStatement>) => Effect.Effect<void, StoreError>
}

/** Driver output is untrusted: every row is checked to hold only `SqlValue`s. */
const SqlRecords = Schema.Array(
  Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number, Schema.Null])),
)

export const toRecords = (rows: unknown): Effect.Effect<ReadonlyArray<SqlRecord>, StoreError> =>
  Schema.decodeUnknownEffect(SqlRecords)(rows).pipe(
    Effect.mapError((cause) => new StoreError({ cause })),
  )

const toStoreError = (cause: unknown): StoreError => new StoreError({ cause })

export const DATABASE_NAME = "tanren.db"

export class SqlDriver extends Context.Service<SqlDriver, SqlDriverShape>()("@tanren/SqlDriver") {
  /**
   * expo-sqlite (iOS + web). Imported lazily so that modules depending on the tag stay loadable
   * under Node (tests use `nodeSqlDriverLayer` from `SqlDriver.testing.ts`). A semaphore
   * serialises every call: `withTransactionAsync` is not exclusive, and any query issued while it
   * runs would otherwise join the transaction.
   */
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const sqlite = yield* Effect.tryPromise({
        try: () => import("expo-sqlite"),
        catch: toStoreError,
      })
      const db = yield* Effect.tryPromise({
        try: () => sqlite.openDatabaseAsync(DATABASE_NAME),
        catch: toStoreError,
      })
      const lock = yield* Semaphore.make(1)
      return SqlDriver.of({
        all: (statement) =>
          Effect.tryPromise({
            try: () => db.getAllAsync(statement.sql, [...statement.params]),
            catch: toStoreError,
          }).pipe(Effect.flatMap(toRecords), lock.withPermits(1)),
        batch: (statements) =>
          Effect.tryPromise({
            try: () =>
              db.withTransactionAsync(() =>
                statements
                  .reduce<Promise<unknown>>(
                    (previous, statement) =>
                      previous.then(() => db.runAsync(statement.sql, [...statement.params])),
                    Promise.resolve(),
                  )
                  .then(() => undefined),
              ),
            catch: toStoreError,
          }).pipe(lock.withPermits(1)),
      })
    }),
  )
}
