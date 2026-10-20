import type { LocalDate, PlannedSessionId } from "@tanren/shared"
import { Array as Arr, Option, pipe } from "effect"
import type { PlanDay, PlanWeekView } from "../hooks/usePlanWeek"

type PlanSession = PlanDay["sessions"][number]

/** Every session of the week in display order: the seven days, then the unscheduled ones. */
const allSessions = (view: PlanWeekView): ReadonlyArray<PlanSession> => [
  ...Arr.flatMap(view.days, (day) => day.sessions),
  ...view.unscheduled,
]

/** Default for the wide Plan aside: today's session, else the next upcoming one, else the first. */
export const defaultSession = (view: PlanWeekView, today: LocalDate): Option.Option<PlanSession> =>
  pipe(
    Arr.findFirst(view.days, (day) => day.date === today),
    Option.flatMap((day) => Arr.head(day.sessions)),
    Option.orElse(() => Arr.findFirst(allSessions(view), (item) => item.status === "upcoming")),
    Option.orElse(() => Arr.head(allSessions(view))),
  )

/**
 * The session the aside shows: the one the user tapped while it is still in the week (a reload can
 * drop it), else `defaultSession`.
 */
export const selectedSession = (
  view: PlanWeekView,
  today: LocalDate,
  selectedId: Option.Option<PlannedSessionId>,
): Option.Option<PlanSession> =>
  pipe(
    selectedId,
    Option.flatMap((id) =>
      Arr.findFirst(allSessions(view), (item) => item.plannedSession.id === id),
    ),
    Option.orElse(() => defaultSession(view, today)),
  )
