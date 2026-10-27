import type { CatalogId, ProgramEnrollmentId } from "@tanren/shared"
import { Exit, Option } from "effect"
import { useCallback, useRef, useState } from "react"
import { ProgramRepo } from "../../services/ProgramRepo"
import { failureMessage, runtime } from "../../services/runtime"
import { SyncEngine } from "../../services/SyncEngine"

const requestSync = SyncEngine.use((engine) => engine.requestSync)

/**
 * Writes a swap (or a revert, `to` = None) for one original catalog id through
 * `ProgramRepo.setSwap`, then asks for a sync. One write at a time: a double tap on a row is
 * ignored and resolves false. A failure sets `error`; the next try clears it.
 */
export const useSwap = (): {
  readonly choose: (
    enrollmentId: ProgramEnrollmentId,
    from: CatalogId,
    to: Option.Option<CatalogId>,
  ) => Promise<boolean>
  readonly busy: boolean
  readonly error: Option.Option<string>
} => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Option.Option<string>>(Option.none())
  const inFlight = useRef(false)
  const choose = useCallback(
    (enrollmentId: ProgramEnrollmentId, from: CatalogId, to: Option.Option<CatalogId>) => {
      if (inFlight.current) {
        return Promise.resolve(false)
      }
      // biome-ignore lint/plugin/noMutation: a ref flag, read synchronously by the guard above
      inFlight.current = true
      setBusy(true)
      setError(Option.none())
      return runtime
        .runPromiseExit(ProgramRepo.use((repo) => repo.setSwap(enrollmentId, from, to)))
        .then((exit) => {
          // biome-ignore lint/plugin/noMutation: a ref flag, read synchronously by the guard above
          inFlight.current = false
          setBusy(false)
          if (Exit.isFailure(exit)) {
            setError(Option.some(failureMessage(exit.cause)))
            return false
          }
          // Saved locally either way; a sync that cannot start does not undo the swap.
          runtime.runPromiseExit(requestSync)
          return true
        })
    },
    [],
  )
  return { choose, busy, error }
}
