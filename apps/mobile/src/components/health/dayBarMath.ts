import { type DayTotals, LocalDate, type WeekReview } from "@tanren/shared"
import { Array as Arr, DateTime, Option, pipe } from "effect"
import { shiftDate } from "../../services/progressMath"
import { kcalText } from "./nutritionText"

/** One column of the `/health` week bars (nutrition.md §6 "7 days"). */
export interface DayBarColumn {
  readonly date: LocalDate
  /** "M" … "S". */
  readonly letter: string
  /** Eaten kcal as a bar height in px, 0 … `maxHeight`. */
  readonly eatenHeight: number
  /** Garmin burned kcal as a bar height in px; 0 without a `daily_health` row. */
  readonly burnedHeight: number
  readonly isToday: boolean
  /** After today: no bars, "upcoming". */
  readonly isFuture: boolean
  /** "Monday: eaten 1,420 kcal, burned 1,840 kcal". */
  readonly accessibilityLabel: string
}

/** Days in a `/health` week (Mon–Sun): the protein and review "n / 7" denominators. */
export const WEEK_DAYS = 7

/** Sunday-first, matching `DateTime.getPartUtc(…, "weekDay")`. */
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const

/** 0 = Sunday … 6 = Saturday; the date is read at UTC midnight, so no zone shifts it. */
const weekDayOf = (date: LocalDate): number =>
  DateTime.getPartUtc(DateTime.makeUnsafe(`${date}T00:00:00.000Z`), "weekDay")

const dayNameOf = (date: LocalDate): string => DAY_NAMES[weekDayOf(date)] ?? date

/** The Monday on or before `today` (the `/health` week, Decision D3). */
export const weekStartFor = (today: LocalDate): LocalDate =>
  LocalDate.make(shiftDate(today, -((weekDayOf(today) + 6) % 7)))

/** The largest value one bar may show: eaten, burned or the day's budget over the shown days. */
const scaleOf = (days: ReadonlyArray<DayTotals>): number =>
  pipe(
    days,
    Arr.flatMap((day) => [
      day.eaten.kcal,
      ...Option.toArray(day.burned),
      ...Option.toArray(day.budgetKcal),
    ]),
    Arr.reduce(0, Math.max),
  )

const heightOf = (kcal: number, scale: number, maxHeight: number): number =>
  scale > 0 ? Math.round((kcal / scale) * maxHeight) : 0

const labelOf = (day: DayTotals, name: string): string => {
  const logged = day.entries.length > 0 || day.eaten.kcal > 0
  return Option.match(day.burned, {
    onNone: () =>
      logged
        ? `${name}: eaten ${kcalText(day.eaten.kcal)} kcal, burned: no data`
        : `${name}: nothing logged`,
    onSome: (burned) =>
      `${name}: eaten ${kcalText(day.eaten.kcal)} kcal, burned ${kcalText(burned)} kcal`,
  })
}

/**
 * The week's columns, in the order given (Mon–Sun from `WeekReview.days`). Heights scale to the
 * week's largest eaten, burned or budget value, so that value fills `maxHeight`; days after
 * `today` are empty and "upcoming".
 */
export const dayBarColumns = (
  days: ReadonlyArray<DayTotals>,
  today: LocalDate,
  maxHeight: number,
): ReadonlyArray<DayBarColumn> => {
  const shown = Arr.filter(days, (day) => day.date <= today)
  const scale = scaleOf(shown)
  return Arr.map(days, (day) => {
    const name = dayNameOf(day.date)
    const isFuture = day.date > today
    return {
      date: day.date,
      letter: name.slice(0, 1),
      eatenHeight: isFuture ? 0 : heightOf(day.eaten.kcal, scale, maxHeight),
      burnedHeight: isFuture
        ? 0
        : heightOf(
            Option.getOrElse(day.burned, () => 0),
            scale,
            maxHeight,
          ),
      isToday: day.date === today,
      isFuture,
      accessibilityLabel: isFuture
        ? `${name}: upcoming`
        : labelOf(day, day.date === today ? `Today, ${name}` : name),
    }
  })
}

/** `-310` → "−310" (U+2212, as in the design), `1420` → "1,420". */
export const signedKcalText = (n: number): string => (n < 0 ? `−${kcalText(-n)}` : kcalText(n))

/** The week's average eaten − burned per day with a Garmin total; `None` when no day has one. */
export const avgBalanceText = (review: Pick<WeekReview, "netKcal" | "daysWithBurn">): string =>
  pipe(
    review.netKcal,
    Option.filter(() => review.daysWithBurn > 0),
    Option.match({
      onNone: () => "—",
      onSome: (net) => `${signedKcalText(Math.round(net / review.daysWithBurn))} kcal/day`,
    }),
  )
