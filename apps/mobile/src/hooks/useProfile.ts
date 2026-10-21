import type { Profile } from "@tanren/shared"
import { Effect, Exit, Option, Stream } from "effect"
import { useEffect, useState } from "react"
import { ProfileRepo } from "../services/ProfileRepo"
import { runtime } from "../services/runtime"
import { StoreEvents } from "../services/StoreEvents"

/**
 * The owner's profile from the local store (`None` until one is saved or synced). Re-read after
 * every store write (`StoreEvents` bumps on any table, profile included); a failed read keeps the
 * last value. Works offline.
 */
export const useProfile = (): Option.Option<Profile> => {
  const [profile, setProfile] = useState<Option.Option<Profile>>(Option.none())
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
        setProfile(exit.value)
      })
    return () => controller.abort()
  }, [storeVersion])

  return profile
}
