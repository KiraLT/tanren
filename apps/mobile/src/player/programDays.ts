import { dayDurationSeconds, type ProgramDay } from "@tanren/shared"
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

/** "Day 2 of 30 · 7 exercises · 15 min" under the program name. */
export const dayCardLine = (day: ProgramDay, totalDays: number): string =>
  `Day ${day.dayNumber} of ${totalDays} · ${day.items.length} ${day.items.length === 1 ? "exercise" : "exercises"} · ${dayMinutes(day)} min`

/** "1 of 30 done", the accent counter above the day list. */
export const doneLabel = (currentDay: number, totalDays: number): string =>
  `${daysDone(currentDay, totalDays)} of ${totalDays} done`
