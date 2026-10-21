import { LocalDate } from "@tanren/shared"
import { Array as Arr, DateTime, Option, Schema } from "effect"
import type { ExerciseHistory, WeekBucket } from "../../services/HistoryRepo"
import { formatDayDate, localDateOf } from "../planFormat"

/** Copy for the Progress screens. Units are kg (ADR-0007); e1RM and trends round to 0.1 kg. */
const round1 = (n: number): number => Math.round(n * 10) / 10

export type SeriesUnit = "kg" | "reps"

export interface WeekSeries {
  readonly unit: SeriesUnit
  /** One value per week, oldest first. */
  readonly values: ReadonlyArray<number>
}

/** "116.7 kg" (no trailing zero). */
export const formatKg1 = (kg: number): string => `${round1(kg)} kg`

/** The Best-set tile's numeral and the unit line under it: `127.5` / `kg × 5`, or `12` / `reps`. */
export const bestSetParts = (
  weightKg: number,
  reps: number,
): { readonly value: string; readonly unit: string } =>
  weightKg <= 0
    ? { value: String(reps), unit: "reps" }
    : { value: String(round1(weightKg)), unit: `kg × ${reps}` }

/** "e1RM 116.7 kg". */
export const formatE1Rm = (e1Rm: number): string => `e1RM ${formatKg1(e1Rm)}`

/** "100 kg × 5"; a bodyweight set (no load) is "12 reps". */
export const formatSetText = (weightKg: number, reps: number): string =>
  weightKg <= 0 ? `${reps} reps` : `${formatKg1(weightKg)} × ${reps}`

/** "4,230 kg". */
export const formatVolume = (kg: number): string =>
  `${String(Math.round(kg)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} kg`

/** "21 Oct", in the device's local time. */
export const formatLoggedDate = (at: DateTime.Utc): string =>
  formatDayDate(localDateOf(new Date(DateTime.toEpochMillis(at))))

/** Volume per week, or reps per week when every week's volume is 0 and some reps were done. */
export const weekSeries = (weeks: ReadonlyArray<WeekBucket>): WeekSeries => {
  const bodyweight =
    Arr.every(weeks, (week) => week.volumeKg === 0) && Arr.some(weeks, (week) => week.reps > 0)
  return bodyweight
    ? { unit: "reps", values: Arr.map(weeks, (week) => week.reps) }
    : { unit: "kg", values: Arr.map(weeks, (week) => week.volumeKg) }
}

/** "Volume last 8 weeks: 0, 0, 120, 1250 kg" (oldest first). */
export const volumeLabel = (series: WeekSeries): string => {
  const noun = series.unit === "kg" ? "Volume" : "Reps"
  const values = Arr.map(series.values, (value) => String(Math.round(value))).join(", ")
  return `${noun} last ${series.values.length} weeks: ${values} ${series.unit}`
}

/** "Estimated 1RM, last 8 weeks: no sets, 116.7 kg" (oldest first). */
export const trendLabel = (trend: ExerciseHistory["e1RmTrend"]): string => {
  const values = Arr.map(trend, (week): string =>
    Option.match(week.e1Rm, { onNone: () => "no sets", onSome: (e1Rm) => String(round1(e1Rm)) }),
  ).join(", ")
  return `Estimated 1RM, last ${trend.length} weeks: ${values} kg`
}

/** "7 Sep" for a week's local-Monday `YYYY-MM-DD`; anything unparsable is shown as is. */
export const formatWeekStart = (weekStart: string): string =>
  Option.match(Schema.decodeUnknownOption(LocalDate)(weekStart), {
    onNone: () => weekStart,
    onSome: formatDayDate,
  })
