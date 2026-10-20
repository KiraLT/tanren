import { Effect, Exit, Option, Stream } from "effect"
import { useCallback, useEffect, useState } from "react"
import { PlanWeekRepo, type PlanWeekView } from "../services/PlanWeekRepo"
import { failureMessage, runtime } from "../services/runtime"
import { StoreEvents } from "../services/StoreEvents"

export type {
  PlanDay,
  PlannedExerciseBlock,
  PlannedSessionStatus,
  PlanWeekView,
} from "../services/PlanWeekRepo"

export type PlanWeekState =
  | { readonly _tag: "Loading" }
  /** No active plan, or no week of it covering today. */
  | { readonly _tag: "Empty" }
  | { readonly _tag: "Failed"; readonly message: string }
  | { readonly _tag: "Ready"; readonly view: PlanWeekView }

export const toPlanWeekState = (view: Option.Option<PlanWeekView>): PlanWeekState =>
  Option.match(view, {
    onNone: () => ({ _tag: "Empty" }),
    onSome: (found) => ({ _tag: "Ready", view: found }),
  })

/**
 * The current plan week from the local store. Works offline and reloads by itself after every
 * store write (`StoreEvents`: logSet, sync); `reload` forces a re-read.
 */
export const usePlanWeek = (): { readonly state: PlanWeekState; readonly reload: () => void } => {
  const [state, setState] = useState<PlanWeekState>({ _tag: "Loading" })
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
        PlanWeekRepo.use((repo) => repo.currentWeek),
        { signal: controller.signal },
      )
      .then((exit) => {
        if (controller.signal.aborted) {
          return
        }
        setState(
          Exit.match(exit, {
            onFailure: (cause) => ({ _tag: "Failed", message: failureMessage(cause) }),
            onSuccess: toPlanWeekState,
          }),
        )
      })
    return () => controller.abort()
  }, [version, storeVersion])

  return { state, reload }
}
