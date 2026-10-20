import type { DayNumber, ProgramEnrollmentId } from "@tanren/shared"
import { DateTime, Effect, Option } from "effect"
import { PhaseAlerts } from "../services/PhaseAlerts"
import { ProgramRepo } from "../services/ProgramRepo"
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

export interface FinishedRun {
  readonly enrollmentId: ProgramEnrollmentId
  readonly dayNumber: DayNumber
  readonly startedAtMs: number
  readonly durationSeconds: number
}

/** What the completion sheet shows. */
export type CompletionResult =
  | { readonly _tag: "Saved"; readonly durationSeconds: number }
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
    }),
  ).pipe(
    Effect.tap(() => SyncEngine.use((engine) => engine.requestSync)),
    Effect.map((): CompletionResult => ({ _tag: "Saved", durationSeconds: run.durationSeconds })),
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
