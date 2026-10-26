import { DateTime } from "effect"

// The PR math moved to `@tanren/shared` (`activity.ts`, ADR-0017); re-exported so no app import changes.
export {
  bestSet,
  Chronological,
  epley1Rm,
  markPrs,
  type ScoredSet,
  SetScore,
} from "@tanren/shared"

/** A `YYYY-MM-DD` as UTC midnight, so day arithmetic never meets a DST shift. */
const utcMidnight = (date: string): DateTime.Utc =>
  // Callers pass `formatIsoDate` output, which always parses.
  DateTime.makeUnsafe(`${date}T00:00:00.000Z`)

/** Calendar arithmetic on a `YYYY-MM-DD` date (negative `days` go back). */
export const shiftDate = (date: string, days: number): string =>
  DateTime.formatIsoDate(DateTime.add(utcMidnight(date), { days }))

/**
 * Local ISO week start (Monday) of `at` in its own zone, as `YYYY-MM-DD`. Only history buckets
 * snap to Monday; plan weeks start on any weekday (ADR-0007 Q3).
 */
export const weekStartOf = (at: DateTime.Zoned): string => {
  const localDate = DateTime.formatIsoDate(at)
  // `weekDay` counts from Sunday = 0, so Monday is 0 days back and Sunday 6.
  const daysSinceMonday = (DateTime.getPartUtc(utcMidnight(localDate), "weekDay") + 6) % 7
  return shiftDate(localDate, -daysSinceMonday)
}
