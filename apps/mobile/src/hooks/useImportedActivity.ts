import type { ImportedActivity, ImportedActivityId } from "@tanren/shared"
import { Cause, Effect, type Option, Stream } from "effect"
import { useEffect, useState } from "react"
import { ImportedActivityRepo } from "../services/ImportedActivityRepo"
import { failureMessage, runtime } from "../services/runtime"
import { StoreEvents } from "../services/StoreEvents"
import type { HistoryState } from "./useHistory"

/**
 * One imported activity for `/activity/imported/[id]` (garmin.md §6), re-read after every store
 * write (`StoreEvents`: sync pulls the rows). `Ready(None)` when it is missing or deleted; a failed
 * read is `Failed` with the store's message. The previous value stays on screen during a re-read.
 */
export const useImportedActivity = (
  id: ImportedActivityId,
): HistoryState<Option.Option<ImportedActivity>> => {
  const [state, setState] = useState<HistoryState<Option.Option<ImportedActivity>>>({
    _tag: "Loading",
  })

  useEffect(() => {
    const controller = new AbortController()
    // The stream emits the current store version first, so the first read runs at once.
    runtime.runPromiseExit(
      StoreEvents.use((events) =>
        Stream.runForEach(events.changes, () =>
          ImportedActivityRepo.use((repo) => repo.byId(id)).pipe(
            Effect.match({
              onFailure: (error): HistoryState<Option.Option<ImportedActivity>> => ({
                _tag: "Failed",
                message: failureMessage(Cause.fail(error)),
              }),
              onSuccess: (value): HistoryState<Option.Option<ImportedActivity>> => ({
                _tag: "Ready",
                value,
              }),
            }),
            Effect.flatMap((next) => Effect.sync(() => setState(next))),
          ),
        ),
      ),
      { signal: controller.signal },
    )
    return () => controller.abort()
  }, [id])

  return state
}
