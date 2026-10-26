import type { Activity, SessionId } from "@tanren/shared"
import { Array as Arr, Option } from "effect"

/**
 * The activity the Feed aside shows at desktop: the user's pick if it is still in the list, else
 * the newest activity (the list is newest first); `None` for an empty list.
 */
export const effectiveActivity = (
  activities: ReadonlyArray<Activity>,
  picked: Option.Option<SessionId>,
): Option.Option<Activity> =>
  Option.orElse(
    Option.flatMap(picked, (id) => Arr.findFirst(activities, (a) => a.sessionId === id)),
    () => Arr.head(activities),
  )
