import { Exit, Option } from "effect"
import { useCallback, useState } from "react"
import { failureMessage, runtime } from "../services/runtime"
import { type LogSetInput, TodayRepo } from "../services/TodayRepo"

/**
 * Logs a set to the local store (offline), creating today's session on the first set. The promise
 * always resolves: `true` when the set was stored, `false` on failure (invalid input, store
 * error), whose message lands in `error` until the next log. `useToday` refreshes by itself.
 */
export const useLogSet = (): {
  readonly logSet: (input: LogSetInput) => Promise<boolean>
  readonly pending: boolean
  readonly error: Option.Option<string>
} => {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Option.Option<string>>(Option.none())
  const logSet = useCallback((input: LogSetInput) => {
    setPending(true)
    return runtime.runPromiseExit(TodayRepo.use((repo) => repo.logSet(input))).then((exit) => {
      setPending(false)
      setError(
        Exit.match(exit, {
          onFailure: (cause) => Option.some(failureMessage(cause)),
          onSuccess: () => Option.none(),
        }),
      )
      return Exit.isSuccess(exit)
    })
  }, [])
  return { logSet, pending, error }
}
