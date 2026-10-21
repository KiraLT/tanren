import type { Profile } from "@tanren/shared"
import { Effect, Exit, Option, Stream } from "effect"
import { useEffect, useState } from "react"
import { ProfileRepo } from "../services/ProfileRepo"
import { runtime } from "../services/runtime"
import { StoreEvents } from "../services/StoreEvents"

/**
 * The profile as a screen sees it: `Loading` until the first read finishes, then `Loaded` with the
 * row (`None` = no profile saved or synced yet). `P` narrows the row for pure helpers and tests.
 */
export type ProfileState<P = Profile> =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Loaded"; readonly profile: Option.Option<P> }

/**
 * The owner's profile from the local store. Re-read after every store write (`StoreEvents` bumps on
 * any table, profile included); a failed read keeps the last value (a failed first read stays
 * `Loading`). Works offline.
 */
export const useProfileState = (): ProfileState => {
  const [state, setState] = useState<ProfileState>({ _tag: "Loading" })
  const [storeVersion, setStoreVersion] = useState(0)

  // The stream emits the current version first, so no write is missed.
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
        ProfileRepo.use((repo) => repo.get),
        { signal: controller.signal },
      )
      .then((exit) => {
        if (controller.signal.aborted || Exit.isFailure(exit)) {
          return
        }
        setState({ _tag: "Loaded", profile: exit.value })
      })
    return () => controller.abort()
  }, [storeVersion])

  return state
}

/**
 * The profile, `None` while loading or when there is none. For screens where "not loaded yet" and
 * "no profile" look the same (an absent filter chip); gate anything else on `useProfileState`.
 */
export const useProfile = (): Option.Option<Profile> => {
  const state = useProfileState()
  return state._tag === "Loaded" ? state.profile : Option.none()
}
