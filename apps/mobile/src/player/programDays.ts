import { dayDurationSeconds, type ProgramDay } from "@tanren/shared"
import { Match } from "effect"
import type { RowDisc } from "../ui"

/**
 * Pure parts of the Programs tab (ui-direction-final §5): the disc a day row shows, how far along
 * the enrolled program is, and the lines of text. No React, no Effect services.
 */

/** Done before the current day, `now` on it, `todo` after (the disc shows the day number). */
export const dayDisc = (dayNumber: number, currentDay: number): RowDisc => ({
  state: dayNumber < currentDay ? "done" : dayNumber === currentDay ? "now" : "todo",
  index: dayNumber,
})

/** Days in the phone's "This week" list. */
export const WEEK_LENGTH = 7

/**
 * The `WEEK_LENGTH` consecutive days around `currentDay` (3 before, 3 after), slid back inside the
 * program at either end; a program shorter than a week, or an enrollment past the last day, shows
 * what fits (the last week). Days keep their order.
 */
export const weekWindow = <Day extends { readonly dayNumber: number }>(
  days: ReadonlyArray<Day>,
  currentDay: number,
): ReadonlyArray<Day> => {
  const start = Math.max(
    0,
    Math.min(currentDay - 1 - Math.floor(WEEK_LENGTH / 2), days.length - WEEK_LENGTH),
  )
  return days.slice(start, start + WEEK_LENGTH)
}

/** Screen-reader suffix of a day row: "done", "up next" or "upcoming". */
export const dayStateLabel = (state: RowDisc["state"]): string =>
  Match.value(state).pipe(
    Match.when("done", () => "done"),
    Match.when("now", () => "up next"),
    Match.when("todo", () => "upcoming"),
    Match.exhaustive,
  )

/** Days finished, never past the program length (an enrollment can sit one past the last day). */
export const daysDone = (currentDay: number, totalDays: number): number =>
  Math.max(0, Math.min(currentDay - 1, totalDays))

/** Fraction of the program done, 0..1, for the 44 px ring. */
export const programProgress = (currentDay: number, totalDays: number): number =>
  totalDays <= 0 ? 0 : daysDone(currentDay, totalDays) / totalDays

/** Whole minutes of a day's plan. */
export const dayMinutes = (day: ProgramDay): number => Math.round(dayDurationSeconds(day) / 60)

/** Trailing value of a day row: "15 min". */
export const dayTrailing = (day: ProgramDay): string => `${dayMinutes(day)} min`

/** Subtitle of a desktop "What's inside" row: "7 exercises" (the day's routine size). */
export const daySubtitle = (day: ProgramDay): string =>
  `${day.items.length} ${day.items.length === 1 ? "exercise" : "exercises"}`

/** "Day 2 of 30 · 7 exercises · 15 min" under the program name. */
export const dayCardLine = (day: ProgramDay, totalDays: number): string =>
  `Day ${day.dayNumber} of ${totalDays} · ${day.items.length} ${day.items.length === 1 ? "exercise" : "exercises"} · ${dayMinutes(day)} min`

/** "1 of 30 done", the accent counter above the day list. */
export const doneLabel = (currentDay: number, totalDays: number): string =>
  `${daysDone(currentDay, totalDays)} of ${totalDays} done`

/** One row of the not-enrolled "What's inside" list. */
export interface InsideRow {
  readonly dayNumber: number
  readonly title: string
  /** "15 min". */
  readonly trailing: string
}

/** The first `WEEK_LENGTH` days of a program as rows (fewer when the program is shorter, none for none). */
export const insideRows = (days: ReadonlyArray<ProgramDay>): ReadonlyArray<InsideRow> =>
  days.slice(0, WEEK_LENGTH).map((day) => ({
    dayNumber: day.dayNumber,
    title: day.title,
    trailing: dayTrailing(day),
  }))

/**
 * Not-enrolled desktop stat row (ui-polish Programs 3): "30 days · 15 min · 7 exercises". Minutes
 * and exercises describe the first day (the program's typical day); an empty program shows 0.
 */
export const programStats = (
  days: ReadonlyArray<ProgramDay>,
): ReadonlyArray<{ readonly label: string; readonly value: string }> => {
  const first = days[0]
  return [
    { label: "Days", value: String(days.length) },
    { label: "Per day", value: first === undefined ? "0 min" : dayTrailing(first) },
    { label: "Exercises", value: String(first === undefined ? 0 : first.items.length) },
  ]
}
