import {
  DailyHealthRow,
  DataExport,
  ExerciseRow,
  ImportedActivityRow,
  PlannedSessionRow,
  PlannedSetRow,
  PlanRow,
  PlanWeekRow,
  ProfileRow,
  ProgramDayCompletionRow,
  ProgramEnrollmentRow,
  ROW_TABLE,
  SessionRow,
  type SyncChange,
  type SyncTable,
  UserId,
  WorkoutSetRow,
} from "@tanren/shared"
import { Array as Arr, Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { readOwner } from "../store/syncQueries"
import { decodeRecords, LocalStore } from "./LocalStore"
import { StoreError } from "./SqlDriver"

export interface DataExporterShape {
  /**
   * Every live row of every synced table as a pretty-printed `DataExport` JSON document, with the
   * file name taken from the same `exportedAt` (so it always names the day inside the file).
   */
  readonly exportAll: Effect.Effect<
    { readonly json: string; readonly fileName: string },
    StoreError
  >
}

/** `tanren-export-YYYY-MM-DD.json` for the day of `at` (UTC). */
export const exportFileName = (at: DateTime.Utc): string =>
  `tanren-export-${DateTime.formatIso(at).slice(0, 10)}.json`

const live = (table: SyncTable) => ({
  sql: `SELECT * FROM "${ROW_TABLE[table]}" WHERE "deletedAt" IS NULL ORDER BY "createdAt", "id"`,
  params: [],
})

/** Tags each decoded row with its table, the `SyncChange` envelope. */
const tagged =
  <T extends SyncTable>(table: T) =>
  <Row>(rows: ReadonlyArray<Row>) =>
    Arr.map(rows, (row) => ({ table, row }))

const toStoreError = (cause: unknown): StoreError => new StoreError({ cause })

const make = Effect.gen(function* () {
  const store = yield* LocalStore

  const readLive = <A, T extends SyncTable>(table: T, codec: Schema.Decoder<A>) =>
    store.all(live(table)).pipe(Effect.flatMap(decodeRecords(codec)), Effect.map(tagged(table)))

  const owner = store.all(readOwner).pipe(
    Effect.map((rows) => Option.fromNullishOr(rows[0]?.value)),
    Effect.map(Option.flatMap(Schema.decodeUnknownOption(UserId))),
  )

  const exportAll = Effect.gen(function* () {
    const exportedAt = yield* DateTime.now
    // Parents first, as `SYNC_TABLE_ORDER`, so the file can be replayed through the push path.
    const rows: ReadonlyArray<SyncChange> = Arr.flatten([
      yield* readLive("profile", ProfileRow),
      yield* readLive("exercise", ExerciseRow),
      yield* readLive("plan", PlanRow),
      yield* readLive("planWeek", PlanWeekRow),
      yield* readLive("plannedSession", PlannedSessionRow),
      yield* readLive("plannedSet", PlannedSetRow),
      yield* readLive("session", SessionRow),
      yield* readLive("set", WorkoutSetRow),
      yield* readLive("programEnrollment", ProgramEnrollmentRow),
      yield* readLive("programDayCompletion", ProgramDayCompletionRow),
      yield* readLive("importedActivity", ImportedActivityRow),
      yield* readLive("dailyHealth", DailyHealthRow),
    ])
    const encoded = yield* Schema.encodeEffect(DataExport)({
      format: "tanren.export",
      version: 1,
      exportedAt,
      userId: yield* owner,
      rows,
    }).pipe(Effect.mapError(toStoreError))
    return { json: JSON.stringify(encoded, null, 2), fileName: exportFileName(exportedAt) }
  })

  return { exportAll } satisfies DataExporterShape
})

/** Settings "Export my data": reads the local store only (works offline). Needs LocalStore. */
export class DataExporter extends Context.Service<DataExporter, DataExporterShape>()(
  "@tanren/DataExporter",
) {
  static readonly layer = Layer.effect(this, make)
}
