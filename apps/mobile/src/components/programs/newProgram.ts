import {
  newId,
  type Program,
  type ProgramDay,
  type ProgramSchedule,
  type ProgramSummary,
  UserProgram,
  UserProgramId,
} from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Option, Random } from "effect"
import { LOCAL_USER_ID } from "../../store/localUser"
import { BLANK_ITEM, defaultSchedule, MAX_DAYS, slugWithSuffix } from "./programEdit"

/** What a new program starts from: the content a blank or duplicated program carries. */
export interface ProgramContent {
  readonly title: string
  readonly summary: string
  readonly schedule: ProgramSchedule
  readonly days: ReadonlyArray<ProgramDay>
}

export const BLANK_TITLE = "New program"

/** One day with one exercise (a day needs at least one), three days a week. */
export const blankContent: ProgramContent = {
  title: BLANK_TITLE,
  summary: "My own program.",
  schedule: { kind: "daysPerWeek", days: 3 },
  days: [
    { dayNumber: 1, title: "Day 1", rounds: 1, items: [BLANK_ITEM], restBetweenRoundsSeconds: 60 },
  ],
}

const MAX_TITLE = 80

/**
 * A copy of any program, built-ins included: the days as they are (the first `MAX_DAYS`, a row holds
 * no more), the schedule of the original or, for a built-in, one derived from its day count.
 */
export const duplicateContent = (program: Program, summary: ProgramSummary): ProgramContent => ({
  title: `${program.name} copy`.slice(0, MAX_TITLE).trim(),
  summary: program.tagline,
  schedule: Option.getOrElse(summary.schedule, () => defaultSchedule(program.days.length)),
  days: Arr.take(program.days, MAX_DAYS),
})

/** How many days a duplicate drops (the 12-week built-in has 84; a row holds 60). */
export const droppedDays = (dayCount: number): number => Math.max(0, dayCount - MAX_DAYS)

const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"

/**
 * The first `program` row of a program the owner starts in the app: `source: "manual"`, version 1,
 * slug = slugified title + `-` + 4 random characters (`Random`, so tests seed it). `userId` is a
 * placeholder: `ProgramRepo.save` stamps the owner on insert.
 */
export const newProgramRow = (content: ProgramContent) =>
  Effect.gen(function* () {
    const id = yield* newId(UserProgramId)
    const now = yield* DateTime.now
    const picks = yield* Effect.forEach(Arr.range(1, 4), () =>
      Random.nextIntBetween(0, SUFFIX_ALPHABET.length, { halfOpen: true }),
    )
    const suffix = Arr.map(picks, (pick) => SUFFIX_ALPHABET.charAt(pick)).join("")
    return yield* UserProgram.makeEffect({
      id,
      userId: LOCAL_USER_ID,
      createdAt: now,
      updatedAt: now,
      deletedAt: Option.none(),
      title: content.title,
      slug: slugWithSuffix(content.title, suffix),
      summary: content.summary,
      description: Option.none(),
      days: content.days,
      schedule: content.schedule,
      source: "manual",
      version: 1,
    })
  })
