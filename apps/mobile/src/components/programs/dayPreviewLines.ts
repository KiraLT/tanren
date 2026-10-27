import {
  applySwaps,
  DayNumber,
  type EnrollmentStatus,
  type Program,
  type ProgramDay,
  type ProgramItem,
  type Swaps,
} from "@tanren/shared"
import { Array as Arr, Option, Schema, String as Str } from "effect"
import { itemAmount } from "../../player/cues"

/** The parts of a running enrollment the preview reads (`ActiveProgram.enrollment`). */
export interface PreviewEnrollment {
  readonly status: EnrollmentStatus
  readonly currentDay: number
  readonly swaps: Swaps
}

/** The `n` route param as a day number; `None` for anything that is not an integer 1–365. */
export const dayParam = (raw: string | ReadonlyArray<string> | undefined): Option.Option<number> =>
  typeof raw === "string" && /^\d+$/.test(raw)
    ? Schema.decodeUnknownOption(DayNumber)(Number(raw))
    : Option.none()

/** Day `n` of the program with the running enrollment's swaps applied; `None` when out of range. */
export const previewDay = (
  program: Program,
  dayNumber: number,
  enrollment: Option.Option<PreviewEnrollment>,
): Option.Option<ProgramDay> =>
  Option.map(
    Arr.findFirst(program.days, (day) => day.dayNumber === dayNumber),
    (day) =>
      Option.match(enrollment, {
        onNone: () => day,
        onSome: ({ swaps }) => applySwaps(day, swaps),
      }),
  )

/**
 * "Day 5 of 84 · Week 1 · Push" from the title "Day 5 · Week 1 · Push": the leading "Day N" part
 * of the title becomes "Day N of total"; a title without one keeps every part.
 */
export const positionLabel = (day: ProgramDay, totalDays: number): string => {
  const parts = Arr.map(Str.split(day.title, "·"), Str.trim)
  const rest = Arr.filter(
    Arr.isReadonlyArrayNonEmpty(parts) && /^Day \d+$/.test(parts[0]) ? Arr.drop(parts, 1) : parts,
    Str.isNonEmpty,
  )
  return Arr.join([`Day ${day.dayNumber} of ${totalDays}`, ...rest], " · ")
}

/** "12 reps · 30 s rest", "40 s · 15 s rest"; an item with no rest drops the second part. */
export const itemLine = (item: ProgramItem): string =>
  item.restSeconds > 0 ? `${itemAmount(item)} · ${item.restSeconds} s rest` : itemAmount(item)

/** "Start this day" shows only on the current day of an `active` enrollment. */
export const startable = (enrollment: Option.Option<PreviewEnrollment>, dayNumber: number) =>
  Option.exists(
    enrollment,
    (running) => running.status === "active" && running.currentDay === dayNumber,
  )
