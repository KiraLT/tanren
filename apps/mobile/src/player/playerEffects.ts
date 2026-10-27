import type { CatalogId, DayNumber, ProgramEnrollmentId } from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Option } from "effect"
import { PhaseAlerts } from "../services/PhaseAlerts"
import { ProgramRepo, type SetEntry, volumeOf } from "../services/ProgramRepo"
import { SyncEngine } from "../services/SyncEngine"
import type { PhaseAlert } from "./cues"

/**
 * The player's Effects, run by `usePlayer` through the app `runtime` (tested here with test layers).
 */

/** Drop the pending phase-end alert, then schedule the new one if the phase has a deadline. */
export const syncAlerts = (
  alert: Option.Option<PhaseAlert>,
): Effect.Effect<void, never, PhaseAlerts> =>
  PhaseAlerts.use((alerts) =>
    alerts.cancelAll.pipe(
      Effect.andThen(
        Option.match(alert, {
          onNone: () => Effect.void,
          onSome: ({ atMs, text }) => alerts.schedule(DateTime.makeUnsafe(atMs), text),
        }),
      ),
    ),
  )

export const cancelAlerts: Effect.Effect<void, never, PhaseAlerts> = PhaseAlerts.use(
  (alerts) => alerts.cancelAll,
)

/**
 * `RunConfig.prefill` for a day's catalog ids: each loaded exercise's last logged load
 * (`ProgramRepo.lastLoads`). Never fails: a store error logs and yields an empty map (the steppers
 * then start at 0 kg × the target).
 */
export const loadPrefill = (
  catalogIds: ReadonlyArray<CatalogId>,
): Effect.Effect<ReadonlyMap<CatalogId, SetEntry>, never, ProgramRepo> =>
  ProgramRepo.use((repo) => repo.lastLoads(catalogIds)).pipe(
    Effect.map(
      (rows): ReadonlyMap<CatalogId, SetEntry> =>
        new Map(
          Arr.flatMap(rows, ({ catalogId, last }) =>
            Option.match(last, {
              onNone: () => [],
              onSome: (entry) => [[catalogId, entry] as const],
            }),
          ),
        ),
    ),
    Effect.catch((cause) =>
      Effect.logWarning("Player: loading the prefill failed", cause).pipe(
        Effect.as<ReadonlyMap<CatalogId, SetEntry>>(new Map()),
      ),
    ),
  )

export interface FinishedRun {
  readonly enrollmentId: ProgramEnrollmentId
  readonly dayNumber: DayNumber
  readonly startedAtMs: number
  readonly durationSeconds: number
  /** `PlayerRun.performedItems`: completed item-rounds; P5 logs only those. */
  readonly performedItems: number
  /** The exercise each of those item-rounds ran (a mid-workout swap changes later rounds only). */
  readonly performedIds: ReadonlyArray<CatalogId>
  /** `PlayerRun.entries`: each item-round's load, positional with `performedIds`. */
  readonly entries: ReadonlyArray<Option.Option<SetEntry>>
}

/** What the completion sheet shows. */
export type CompletionResult =
  | {
      readonly _tag: "Saved"
      readonly durationSeconds: number
      /** `Σ weightKg · reps` over `entries` (0 = no load: timed and bodyweight only). */
      readonly volumeKg: number
      /** Item-rounds logged as sets (= `performedItems`). */
      readonly sets: number
    }
  | { readonly _tag: "Failed"; readonly durationSeconds: number; readonly message: string }

export const COMPLETION_FAILED = "Could not save this workout on this device."

/**
 * Records the day (`ProgramRepo.complete`, which also logs the session), then asks for a push.
 * Never fails: a store error becomes `Failed` so the sheet can say so and the player stays up.
 */
export const completeDay = (
  run: FinishedRun,
): Effect.Effect<CompletionResult, never, ProgramRepo | SyncEngine> =>
  ProgramRepo.use((repo) =>
    repo.complete({
      enrollmentId: run.enrollmentId,
      dayNumber: run.dayNumber,
      startedAt: DateTime.makeUnsafe(run.startedAtMs),
      durationSeconds: run.durationSeconds,
      performedItems: run.performedItems,
      performedIds: run.performedIds,
      entries: run.entries,
    }),
  ).pipe(
    Effect.tap(() => SyncEngine.use((engine) => engine.requestSync)),
    Effect.map(
      (): CompletionResult => ({
        _tag: "Saved",
        durationSeconds: run.durationSeconds,
        volumeKg: volumeOf(run.entries),
        sets: run.performedItems,
      }),
    ),
    Effect.catch((cause) =>
      Effect.logWarning("Player: completing the day failed", cause).pipe(
        Effect.as<CompletionResult>({
          _tag: "Failed",
          durationSeconds: run.durationSeconds,
          message: COMPLETION_FAILED,
        }),
      ),
    ),
  )
