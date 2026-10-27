import type { DailyHealth, LocalDate } from "@tanren/shared"
import { Effect, Option, Stream } from "effect"
import { useEffect, useState } from "react"
import { DailyHealthRepo } from "../services/DailyHealthRepo"
import { runtime } from "../services/runtime"
import { StoreEvents } from "../services/StoreEvents"

/**
 * Today's imported health summary (garmin.md §7), re-read after every store write (`StoreEvents`:
 * sync pulls the rows). None while loading, on a failed read and when the day has no live row:
 * the Today strip is simply hidden in each case.
 */
export const useDailyHealth = (localDate: LocalDate): Option.Option<DailyHealth> => {
  const [health, setHealth] = useState<Option.Option<DailyHealth>>(Option.none())

  useEffect(() => {
    const controller = new AbortController()
    // The stream emits the current store version first, so the first read runs at once.
    runtime.runPromiseExit(
      StoreEvents.use((events) =>
        Stream.runForEach(events.changes, () =>
          DailyHealthRepo.use((repo) => repo.today(localDate)).pipe(
            Effect.catch(() => Effect.succeed(Option.none<DailyHealth>())),
            Effect.flatMap((next) => Effect.sync(() => setHealth(next))),
          ),
        ),
      ),
      { signal: controller.signal },
    )
    return () => controller.abort()
  }, [localDate])

  return health
}
