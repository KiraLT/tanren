import type { ExerciseId } from "@tanren/shared"
import { type DateTime, Effect, Exit, type Option, Stream } from "effect"
import { useCallback, useEffect, useState } from "react"
import {
  type ExerciseHistory,
  type ExerciseSummary,
  HistoryRepo,
  type HistoryRepoShape,
  type SessionSummary,
} from "../services/HistoryRepo"
import { failureMessage, runtime } from "../services/runtime"
import type { StoreError } from "../services/SqlDriver"
import { StoreEvents } from "../services/StoreEvents"

export type {
  ExerciseHistory,
  ExerciseSummary,
  MarkedSet,
  SessionSummary,
  WeekBucket,
} from "../services/HistoryRepo"

export type HistoryState<A> =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Failed"; readonly message: string }
  | { readonly _tag: "Ready"; readonly value: A }

type Read<Arg, A> = (
  repo: HistoryRepoShape,
  arg: Arg,
) => Effect.Effect<A, StoreError, DateTime.CurrentTimeZone>

/** Module-level readers: stable identities, so they can sit in the effect's dependencies. */
const readExercises: Read<undefined, ReadonlyArray<ExerciseSummary>> = (repo) => repo.exercises
const readExercise: Read<ExerciseId, Option.Option<ExerciseHistory>> = (repo, id) =>
  repo.exercise(id)
const readSessions: Read<number, ReadonlyArray<SessionSummary>> = (repo, limit) =>
  repo.sessions(limit)

/**
 * Runs one `HistoryRepo` read in the app runtime and re-runs it after every store write
 * (`StoreEvents`: logSet, sync). The previous value stays on screen while a re-read runs.
 */
const useHistoryRead = <Arg, A>(
  read: Read<Arg, A>,
  arg: Arg,
): { readonly state: HistoryState<A>; readonly reload: () => void } => {
  const [state, setState] = useState<HistoryState<A>>({ _tag: "Loading" })
  const [version, setVersion] = useState(0)
  const [storeVersion, setStoreVersion] = useState(0)
  const reload = useCallback(() => setVersion((current) => current + 1), [])

  // Follow the store version; the stream emits the current value first, so no write is missed.
  useEffect(() => {
    const controller = new AbortController()
    runtime.runPromiseExit(
      StoreEvents.use((events) =>
        Stream.runForEach(events.changes, (next) => Effect.sync(() => setStoreVersion(next))),
      ),
      { signal: controller.signal },
    )
    return () => controller.abort()
  }, [])

  // `version` / `storeVersion` are triggers only: bumping either re-reads.
  useEffect(() => {
    const controller = new AbortController()
    runtime
      .runPromiseExit(
        HistoryRepo.use((repo) => read(repo, arg)),
        { signal: controller.signal },
      )
      .then((exit) => {
        if (controller.signal.aborted) {
          return
        }
        setState(
          Exit.match(exit, {
            onFailure: (cause): HistoryState<A> => ({
              _tag: "Failed",
              message: failureMessage(cause),
            }),
            onSuccess: (value): HistoryState<A> => ({ _tag: "Ready", value }),
          }),
        )
      })
    return () => controller.abort()
  }, [read, arg, version, storeVersion])

  return { state, reload }
}

/** Exercises with at least one live set, most recently logged first. */
export const useExerciseSummaries = () => useHistoryRead(readExercises, undefined)

/** One exercise's best set, 8-week charts and recent sessions; `Ready(None)` when it is unknown. */
export const useExerciseHistory = (id: ExerciseId) => useHistoryRead(readExercise, id)

/** The newest `limit` live sessions. */
export const useSessionSummaries = (limit: number) => useHistoryRead(readSessions, limit)
