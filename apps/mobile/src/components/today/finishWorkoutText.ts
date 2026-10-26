import { Option } from "effect"
import type { FinishedSession, OpenSession } from "../../services/TodayRepo"
import { formatDuration } from "../feed/feedGroups"

/** "Finish workout" shows only for an open session with at least one live set. */
export const canFinish = (session: Option.Option<OpenSession>): boolean =>
  Option.exists(session, (open) => open.setCount >= 1 && Option.isNone(open.session.finishedAt))

/** "Workout saved · 5 sets · 48 min" (duration in the feed's words). */
export const finishedLine = ({ setCount, durationSeconds }: FinishedSession): string =>
  `Workout saved · ${setCount} ${setCount === 1 ? "set" : "sets"} · ${formatDuration(durationSeconds)}`
