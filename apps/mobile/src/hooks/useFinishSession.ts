import type { SessionId } from "@tanren/shared"
import { Effect, Exit, Option } from "effect"
import { useCallback, useState } from "react"
import { failureMessage, runtime } from "../services/runtime"
import { SyncEngine } from "../services/SyncEngine"
import { type FinishedSession, TodayRepo } from "../services/TodayRepo"

export type { FinishedSession } from "../services/TodayRepo"

/**
 * Finishes Today's open session in the local store (works offline), then asks the sync loop for a
 * push. The promise always resolves: the summary when the session was finished, `None` when there
 * was nothing to finish or the write failed (message in `error`). `useToday` refreshes by itself.
 */
export const useFinishSession = (): {
  readonly finish: (sessionId: SessionId) => Promise<Option.Option<FinishedSession>>
  readonly pending: boolean
  readonly error: Option.Option<string>
} => {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Option.Option<string>>(Option.none())
  const finish = useCallback((sessionId: SessionId) => {
    setPending(true)
    const finished = TodayRepo.use((repo) => repo.finishSession(sessionId)).pipe(
      Effect.tap(() => SyncEngine.use((engine) => engine.requestSync)),
    )
    return runtime.runPromiseExit(finished).then((exit) => {
      setPending(false)
      setError(
        Exit.match(exit, {
          onFailure: (cause) => Option.some(failureMessage(cause)),
          onSuccess: () => Option.none(),
        }),
      )
      return Exit.match(exit, {
        onFailure: () => Option.none<FinishedSession>(),
        onSuccess: (result) => result,
      })
    })
  }, [])
  return { finish, pending, error }
}
