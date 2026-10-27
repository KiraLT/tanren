import {
  CatalogId,
  DayNumber,
  expandDay,
  type ProgramDay,
  type ProgramEnrollmentId,
} from "@tanren/shared"
import { Array as Arr, Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { LocalStore } from "./LocalStore"
import { StoreError } from "./SqlDriver"

/** One performed step's load (`ProgramRepo.SetEntry`) on the wire of the snapshot JSON. */
const SnapshotEntry = Schema.Struct({ weightKg: Schema.Number, reps: Schema.Number })

/**
 * An unfinished program day (programs-player-v2 §3.2, with PROG-3's `entries` / `draft` and
 * PROG-5's `stepIndex`): what the player needs to come back paused at the same step.
 */
export const DaySnapshot = Schema.Struct({
  dayNumber: DayNumber,
  /** Step-rounds whose work finished; `performedIds` / `entries` are positional with it. */
  performedItems: Schema.Int,
  performedIds: Schema.Array(CatalogId),
  entries: Schema.Array(Schema.OptionFromNullOr(SnapshotEntry)),
  /** The steppers' value for the step being worked (`PlayerRun.draft`). */
  draft: Schema.OptionFromNullOr(SnapshotEntry),
  /** Wall-clock run accounting (playerMachine `RunClock`). */
  startedAtMs: Schema.Number,
  pausedMs: Schema.Number,
  savedAtMs: Schema.Number,
  /** The open phase; restored as `Paused` with `remainingMs` (None for a reps item). */
  phase: Schema.Struct({
    _tag: Schema.Literals(["Working", "Resting"]),
    round: Schema.Int,
    stepIndex: Schema.Int,
    remainingMs: Schema.OptionFromNullOr(Schema.Number),
  }),
})
export type DaySnapshot = typeof DaySnapshot.Type

const SnapshotJson = Schema.fromJsonString(DaySnapshot)

/**
 * Whether `snapshot` still describes `day` as day `currentDay` of the enrollment: same day number,
 * a step and round that exist (a built-in or a user program edited under an open day is stale).
 */
export const snapshotFits = (snapshot: DaySnapshot, day: ProgramDay, currentDay: number): boolean =>
  snapshot.dayNumber === currentDay &&
  snapshot.phase.stepIndex < expandDay(day).length &&
  snapshot.phase.round < day.rounds

export interface DayProgressRepoShape {
  readonly read: (id: ProgramEnrollmentId) => Effect.Effect<Option.Option<DaySnapshot>, StoreError>
  /** Upsert. */
  readonly write: (
    id: ProgramEnrollmentId,
    snapshot: DaySnapshot,
  ) => Effect.Effect<void, StoreError>
  readonly clear: (id: ProgramEnrollmentId) => Effect.Effect<void, StoreError>
}

const q = (sql: string, ...params: ReadonlyArray<string | number>) => ({ sql, params })

/** The player's read when it latches a day (`useDaySnapshot`). */
export const readProgress = (id: ProgramEnrollmentId) =>
  DayProgressRepo.use((repo) => repo.read(id))

/** The player's write on every phase change (`usePlayer`). */
export const saveProgress = (id: ProgramEnrollmentId, snapshot: DaySnapshot) =>
  DayProgressRepo.use((repo) => repo.write(id, snapshot))

/** Device-local `program_day_progress` (store v8, D2): never synced. */
export class DayProgressRepo extends Context.Service<DayProgressRepo, DayProgressRepoShape>()(
  "@tanren/DayProgressRepo",
) {
  static readonly layer: Layer.Layer<DayProgressRepo, never, LocalStore> = Layer.effect(
    this,
    Effect.gen(function* () {
      const store = yield* LocalStore
      const toStoreError = (cause: unknown) => new StoreError({ cause })
      return DayProgressRepo.of({
        read: (id) =>
          store
            .all(q(`SELECT "snapshot" FROM "program_day_progress" WHERE "enrollmentId" = ?`, id))
            .pipe(
              Effect.flatMap((rows) =>
                Effect.transposeOption(
                  Option.map(Arr.head(rows), (row) =>
                    Schema.decodeUnknownEffect(SnapshotJson)(row.snapshot).pipe(
                      Effect.mapError(toStoreError),
                    ),
                  ),
                ),
              ),
            ),
        write: (id, snapshot) =>
          Schema.encodeEffect(SnapshotJson)(snapshot).pipe(
            Effect.mapError(toStoreError),
            Effect.flatMap((json) =>
              store.exec([
                q(
                  `INSERT INTO "program_day_progress" ("enrollmentId", "dayNumber", "snapshot", "updatedAt")
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT ("enrollmentId") DO UPDATE SET
                     "dayNumber" = excluded."dayNumber",
                     "snapshot" = excluded."snapshot",
                     "updatedAt" = excluded."updatedAt"`,
                  id,
                  snapshot.dayNumber,
                  json,
                  Option.match(DateTime.make(snapshot.savedAtMs), {
                    onNone: () => "",
                    onSome: DateTime.formatIso,
                  }),
                ),
              ]),
            ),
          ),
        // Only an existing row is deleted, so a clear with nothing saved bumps no `StoreEvents`.
        clear: (id) =>
          store
            .all(q(`SELECT 1 AS "found" FROM "program_day_progress" WHERE "enrollmentId" = ?`, id))
            .pipe(
              Effect.flatMap((rows) =>
                Arr.isReadonlyArrayEmpty(rows)
                  ? Effect.void
                  : store.exec([
                      q(`DELETE FROM "program_day_progress" WHERE "enrollmentId" = ?`, id),
                    ]),
              ),
            ),
      })
    }),
  )
}
