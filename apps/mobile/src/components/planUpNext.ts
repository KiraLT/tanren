import type { LocalDate, Weekday } from "@tanren/shared"
import { Array as Arr, Option, Order, pipe } from "effect"
import type { PlanDay, PlanWeekView } from "../hooks/usePlanWeek"
import { formatDayDate, formatItemTarget, weekdayLabel } from "./planFormat"

type PlanSession = PlanDay["sessions"][number]

/** The desktop Plan aside's "Up next" card: the next upcoming session after today. */
export interface UpNext {
  readonly weekday: Weekday
  readonly date: LocalDate
  readonly session: PlanSession
}

/**
 * The first session of the week that is `upcoming` (not today's, not done, not missed) on a day
 * after `today`, earliest date first (sorted here, so the order does not depend on how `usePlanWeek`
 * lists the days; within a day, session order). Unscheduled sessions have no date and never
 * qualify. `None` when the week has nothing left: the card renders nothing.
 */
export const nextUpcoming = (
  view: Pick<PlanWeekView, "days">,
  today: LocalDate,
): Option.Option<UpNext> =>
  pipe(
    view.days,
    Arr.filter((day) => day.date > today),
    Arr.sort(Order.mapInput(Order.String, (day: PlanDay) => day.date)),
    Arr.findFirst((day) => Arr.some(day.sessions, (item) => item.status === "upcoming")),
    Option.flatMap((day) =>
      Option.map(
        Arr.findFirst(day.sessions, (item) => item.status === "upcoming"),
        (session): UpNext => ({ weekday: day.weekday, date: day.date, session }),
      ),
    ),
  )

/** "Thu 29 Oct". */
export const upNextDate = (next: Pick<UpNext, "weekday" | "date">): string =>
  `${weekdayLabel(next.weekday)} ${formatDayDate(next.date)}`

/** Most item lines the compact card prints (150 px high); the rest collapse into "+ n more". */
export const UP_NEXT_MAX_ITEMS = 3

export interface UpNextLine {
  /** `${exerciseId}-${index}`: stable and unique even when a session repeats an exercise. */
  readonly key: string
  readonly name: string
  /** "3 × 5 · 100 kg" (`formatItemTarget`). */
  readonly target: string
}

export interface UpNextLines {
  readonly lines: ReadonlyArray<UpNextLine>
  /** Items past `UP_NEXT_MAX_ITEMS`. */
  readonly more: number
}

/** One line per exercise block, at most `UP_NEXT_MAX_ITEMS`. */
export const upNextLines = (session: PlanSession): UpNextLines => ({
  lines: Arr.map(Arr.take(session.blocks, UP_NEXT_MAX_ITEMS), (block, index) => ({
    key: `${block.exercise.id}-${index}`,
    name: block.exercise.name,
    target: formatItemTarget(block.sets),
  })),
  more: Math.max(0, session.blocks.length - UP_NEXT_MAX_ITEMS),
})
