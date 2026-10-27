import type { Meal, QuickAddItem } from "@tanren/shared"
import { DateTime, Effect, Exit, Option } from "effect"
import { useCallback, useState } from "react"
import { buildQuickAddDraft } from "../components/health/quickAddMath"
import { FoodEntryRepo } from "../services/FoodEntryRepo"
import { failureMessage, runtime } from "../services/runtime"
import { SyncEngine } from "../services/SyncEngine"

export interface AddFoodInput {
  readonly item: QuickAddItem
  readonly multiplier: number
  readonly meal: Meal
}

/**
 * Quick-add: writes one `quick_add` FoodEntry (local store, dirty) stamped now, then asks the sync
 * loop for a push. Never rejects: `true` when stored, `false` with the message in `error`.
 */
export const useAddFood = (): {
  readonly add: (input: AddFoodInput) => Promise<boolean>
  readonly pending: boolean
  readonly error: Option.Option<string>
  readonly dismiss: () => void
} => {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Option.Option<string>>(Option.none())
  const add = useCallback((input: AddFoodInput) => {
    setPending(true)
    const added = Effect.gen(function* () {
      const now = yield* DateTime.now
      const repo = yield* FoodEntryRepo
      const entry = yield* repo.insert(buildQuickAddDraft({ ...input, now }))
      yield* SyncEngine.use((engine) => engine.requestSync)
      return entry
    })
    return runtime.runPromiseExit(added).then((exit) => {
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
  const dismiss = useCallback(() => setError(Option.none()), [])
  return { add, pending, error, dismiss }
}
