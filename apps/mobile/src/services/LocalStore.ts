import {
  DailyHealthRow,
  ExerciseRow,
  FoodEntryRow,
  ImportedActivityRow,
  PlannedSessionRow,
  PlannedSetRow,
  PlanRow,
  PlanWeekRow,
  ProfileRow,
  ProgramDayCompletionRow,
  ProgramEnrollmentRow,
  ROW_KEYS,
  ROW_TABLE,
  SessionRow,
  type SyncChange,
  type SyncTable,
  UserProgramRow,
  WorkoutSetRow,
} from "@tanren/shared"
import { Context, Effect, Layer, Record as Rec, Schema } from "effect"
import { migrate } from "../store/migrations"
import {
  SqlDriver,
  type SqlRecord,
  type SqlStatement,
  type SqlValue,
  StoreError,
} from "./SqlDriver"
import { StoreEvents } from "./StoreEvents"

const recordMember = <T extends SyncTable, Row extends Schema.Constraint>(table: T, row: Row) =>
  Schema.Struct({ table: Schema.Literal(table), row })

/** A `SyncChange` whose row encodes to a local table record (JSON columns as strings). */
export const LocalChange = Schema.Union([
  recordMember("profile", ProfileRow),
  recordMember("exercise", ExerciseRow),
  recordMember("plan", PlanRow),
  recordMember("planWeek", PlanWeekRow),
  recordMember("plannedSession", PlannedSessionRow),
  recordMember("plannedSet", PlannedSetRow),
  recordMember("session", SessionRow),
  recordMember("set", WorkoutSetRow),
  recordMember("programEnrollment", ProgramEnrollmentRow),
  recordMember("programDayCompletion", ProgramDayCompletionRow),
  // Pull-only (garmin.md §9): applied from the server, never written or dirtied by the app.
  recordMember("importedActivity", ImportedActivityRow),
  recordMember("dailyHealth", DailyHealthRow),
  // Synced both ways (nutrition.md §2): quick-add writes dirty rows, MCP-logged rows are pulled.
  recordMember("foodEntry", FoodEntryRow),
  // Synced both ways (programs-mcp.md §2): the editor writes dirty rows, MCP-written rows are pulled.
  recordMember("program", UserProgramRow),
])

/**
 * `ExerciseRow.catalogId` is an optional key in the encoded type (pre-v2 records decode without
 * it) although encoding always writes a value or `null`; an absent key is stored as NULL.
 */
const toSqlRecord = (row: Readonly<Record<string, SqlValue | undefined>>): SqlRecord =>
  Rec.map(row, (value) => value ?? null)

/** Encodes an entity to the flat record stored in its table. */
export const encodeChange = (
  change: SyncChange,
): Effect.Effect<{ readonly table: SyncTable; readonly record: SqlRecord }, StoreError> =>
  Schema.encodeEffect(LocalChange)(change).pipe(
    Effect.map((encoded) => ({ table: encoded.table, record: toSqlRecord(encoded.row) })),
    Effect.mapError((cause) => new StoreError({ cause })),
  )

/** Decodes a selected record with a shared `*Row` codec; extra columns (`_dirty`…) are ignored. */
export const decodeRecords =
  <A>(codec: Schema.Decoder<A>) =>
  (records: ReadonlyArray<SqlRecord>): Effect.Effect<ReadonlyArray<A>, StoreError> =>
    Effect.forEach(records, (record) => Schema.decodeUnknownEffect(codec)(record)).pipe(
      Effect.mapError((cause) => new StoreError({ cause })),
    )

/**
 * Insert-or-replace one record into its table. Columns come from `ROW_KEYS` (never from the
 * record), so nothing user-supplied reaches the SQL text. `dirty` marks a local write that sync
 * must push; a remote apply passes `false`. Either way a stale reject reason is cleared.
 */
export const upsertStatement = (
  table: SyncTable,
  record: SqlRecord,
  dirty: boolean,
): SqlStatement => {
  const keys = ROW_KEYS[table]
  const columns = [...keys.map((key) => `"${key}"`), `"_dirty"`, `"_rejected"`]
  const updates = columns.filter((column) => column !== `"id"`).map((c) => `${c} = excluded.${c}`)
  return {
    sql: `INSERT INTO "${ROW_TABLE[table]}" (${columns.join(", ")}) VALUES (${columns
      .map(() => "?")
      .join(", ")}) ON CONFLICT ("id") DO UPDATE SET ${updates.join(", ")}`,
    params: [...keys.map((key) => record[key] ?? null), dirty ? 1 : 0, null],
  }
}

export interface LocalStoreShape {
  /** Raw read; decode the result with `decodeRecords(XRow)`. */
  readonly all: (statement: SqlStatement) => Effect.Effect<ReadonlyArray<SqlRecord>, StoreError>
  /**
   * Upserts the entities in one transaction, then bumps `StoreEvents`. Local writes pass
   * `dirty: true`.
   */
  readonly write: (
    changes: ReadonlyArray<SyncChange>,
    options: { readonly dirty: boolean },
  ) => Effect.Effect<void, StoreError>
  /**
   * Raw writes to a device-local table (`free_workout`: no sync columns, never pushed) in one
   * transaction, then bumps `StoreEvents`. Synced entities go through `write`.
   * Never use it for a synced table: it skips the codecs, `_dirty` and `updatedAt`, so the row never pushes.
   */
  readonly exec: (statements: ReadonlyArray<SqlStatement>) => Effect.Effect<void, StoreError>
}

/** The local offline store. Building the layer applies pending migrations. Needs `StoreEvents`. */
export class LocalStore extends Context.Service<LocalStore, LocalStoreShape>()(
  "@tanren/LocalStore",
) {
  static readonly layerNoDeps = Layer.effect(
    this,
    Effect.gen(function* () {
      const driver = yield* SqlDriver
      const events = yield* StoreEvents
      yield* migrate(driver)
      return LocalStore.of({
        all: driver.all,
        write: (changes, { dirty }) =>
          Effect.forEach(changes, encodeChange).pipe(
            Effect.flatMap((encoded) =>
              driver.batch(
                encoded.map(({ table, record }) => upsertStatement(table, record, dirty)),
              ),
            ),
            Effect.andThen(events.bump),
          ),
        exec: (statements) => driver.batch(statements).pipe(Effect.andThen(events.bump)),
      })
    }),
  )

  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(Layer.mergeAll(SqlDriver.layer, StoreEvents.layer)),
  )
}
