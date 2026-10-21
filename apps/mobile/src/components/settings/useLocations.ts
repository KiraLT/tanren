import type { LocationId, LocationPreset } from "@tanren/shared"
import { Exit, Option } from "effect"
import { useCallback, useState } from "react"
import { failureMessage, runtime } from "../../services/runtime"
import { addPresetLocation, applyLocations, type LocationsAction } from "./locationsState"

/**
 * Equipment & locations edits for the Settings screens: each call reads the profile, applies the
 * reducer and saves it dirty (sync pushes it). Never rejects; a failure lands in `error`. The
 * screens read the result back through `useProfile` (the save bumps `StoreEvents`).
 */
export const useLocations = (): {
  readonly apply: (action: LocationsAction) => Promise<boolean>
  readonly addPreset: (preset: LocationPreset) => Promise<Option.Option<LocationId>>
  readonly error: Option.Option<string>
  readonly dismiss: () => void
} => {
  const [error, setError] = useState<Option.Option<string>>(Option.none())
  const apply = useCallback(
    (action: LocationsAction) =>
      runtime.runPromiseExit(applyLocations(action)).then((exit) =>
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
  const addPreset = useCallback(
    (preset: LocationPreset) =>
      runtime.runPromiseExit(addPresetLocation(preset)).then((exit) =>
        Exit.match(exit, {
          onFailure: (cause): Option.Option<LocationId> => {
            setError(Option.some(failureMessage(cause)))
            return Option.none()
          },
          onSuccess: (id) => {
            setError(Option.none())
            return Option.some(id)
          },
        }),
      ),
    [],
  )
  const dismiss = useCallback(() => setError(Option.none()), [])
  return { apply, addPreset, error, dismiss }
}
