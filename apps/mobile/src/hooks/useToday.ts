import type { PlannedSession } from "@tanren/shared"
import { Effect, Exit, Option, Stream } from "effect"
import { useCallback, useEffect, useState } from "react"
import { failureMessage, runtime } from "../services/runtime"
import { StoreEvents } from "../services/StoreEvents"
import { type OpenSession, type Today, type TodayExercise, TodayRepo } from "../services/TodayRepo"

export type { LogSetInput, TodayExercise } from "../services/TodayRepo"

export type TodayState =
  | { readonly _tag: "Loading" }
  /** No planned session today. */
  | { readonly _tag: "Empty" }
  | { readonly _tag: "Failed"; readonly message: string }
  | {
      readonly _tag: "Ready"
      readonly plannedSession: PlannedSession
      readonly exercises: ReadonlyArray<TodayExercise>
      /** The unfinished session (None before the first set and after Finish workout). */
      readonly session: Option.Option<OpenSession>
    }

export const toTodayState = (today: Option.Option<Today>): TodayState =>
  Option.match(today, {
    onNone: () => ({ _tag: "Empty" }),
    onSome: ({ plannedSession, exercises, session }) => ({
      _tag: "Ready",
      plannedSession,
      exercises,
      session,
    }),
  })

/**
 * Today's planned session from the local store. Works offline and reloads by itself after every
 * store write (`StoreEvents`: logSet, sync); `reload` forces a re-read. Read-only: stale sessions
 * are closed by `SyncEngine` after a complete pull, never here (a reload can land between pull
 * pages, REV-AF).
 */
export const useToday = (): { readonly state: TodayState; readonly reload: () => void } => {
  const [state, setState] = useState<TodayState>({ _tag: "Loading" })
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

  useEffect(() => {
    const controller = new AbortController()
    runtime
      .runPromiseExit(
        TodayRepo.use((repo) => repo.today),
        {
          signal: controller.signal,
        },
      )
      .then((exit) => {
        if (controller.signal.aborted) {
          return
        }
        setState(
          Exit.match(exit, {
            onFailure: (cause) => ({ _tag: "Failed", message: failureMessage(cause) }),
            onSuccess: toTodayState,
          }),
        )
      })
    return () => controller.abort()
  }, [version, storeVersion])

  return { state, reload }
}
