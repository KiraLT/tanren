import type { NutritionProfile } from "@tanren/shared"
import { Exit, Option } from "effect"
import { useCallback, useState } from "react"
import { failureMessage, runtime } from "../../services/runtime"
import { saveNutrition } from "./nutritionSettings"

/**
 * Settings → Nutrition writes: `save(Some)` stores the profile's nutrition, `save(None)` turns it
 * off. Never rejects; a failure lands in `error`. The screen reads the result back through
 * `useProfileState` (the save bumps `StoreEvents`).
 */
export const useNutritionSettings = (): {
  readonly save: (next: Option.Option<NutritionProfile>) => Promise<boolean>
  readonly error: Option.Option<string>
  readonly dismiss: () => void
} => {
  const [error, setError] = useState<Option.Option<string>>(Option.none())
  const save = useCallback(
    (next: Option.Option<NutritionProfile>) =>
      runtime.runPromiseExit(saveNutrition(next)).then((exit) =>
        Exit.match(exit, {
          onFailure: (cause) => {
            setError(Option.some(failureMessage(cause)))
            return false
          },
          onSuccess: () => {
            setError(Option.none())
            return true
          },
        }),
      ),
    [],
  )
  const dismiss = useCallback(() => setError(Option.none()), [])
  return { save, error, dismiss }
}
