import { type DailyHealth, formatInt } from "@tanren/shared"
import { Array as Arr, Option } from "effect"

/** Fewer days with a resting heart rate than this: the average is shown muted (a weak signal). */
export const RESTING_HR_MIN_DAYS = 3

/** The `/health` week's resting heart rate (plan Amendment 26: one small weekly stat). */
export interface RestingHrWeek {
  /** Rounded mean over the days that have a value; None when no day has one. */
  readonly averageBpm: Option.Option<number>
  /** Days with a value (0 … 7). */
  readonly days: number
}

/** The mean resting heart rate over the week's `daily_health` rows (one per date). */
export const restingHrWeek = (
  rows: ReadonlyArray<Pick<DailyHealth, "restingHeartRate">>,
): RestingHrWeek => {
  const values = Arr.getSomes(Arr.map(rows, (row) => row.restingHeartRate))
  return {
    averageBpm: Arr.match(values, {
      onEmpty: () => Option.none(),
      onNonEmpty: (some) =>
        Option.some(Math.round(Arr.reduce(some, 0, (sum, bpm) => sum + bpm) / some.length)),
    }),
    days: values.length,
  }
}

/** "52" or "—" for the stat value. */
export const restingHrText = (week: RestingHrWeek): string =>
  Option.match(week.averageBpm, { onNone: () => "—", onSome: formatInt })

/** True when too few days carry a value for the average to mean much. */
export const restingHrWeak = (week: RestingHrWeek): boolean => week.days < RESTING_HR_MIN_DAYS
