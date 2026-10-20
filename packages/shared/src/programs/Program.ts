import { Array as Arr, Match, Schema } from "effect"
import { CatalogId, Slug } from "../catalog/taxonomy"
import { Label, Note, Reps, RestSeconds, Text } from "../common"

/**
 * Program definitions are static shared data (ADR-0013, v2-programs.md §1): what to do on day N.
 * What the user did lives in the synced `programEnrollment` / `programDayCompletion` rows.
 */

/** A program's stable key, e.g. `"core-30"`. */
export const ProgramId = Slug.pipe(Schema.brand("ProgramId"))
export type ProgramId = typeof ProgramId.Type

/** 1-based day within a program. */
export const DayNumber = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: 365 }),
)
export type DayNumber = typeof DayNumber.Type

/** Work duration of a timed item. */
export const Seconds = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: 3600 }),
)
export type Seconds = typeof Seconds.Type

export const TimedItem = Schema.Struct({
  kind: Schema.Literal("timed"),
  catalogId: CatalogId,
  seconds: Seconds,
  restSeconds: RestSeconds,
})
export type TimedItem = typeof TimedItem.Type

export const RepsItem = Schema.Struct({
  kind: Schema.Literal("reps"),
  catalogId: CatalogId,
  reps: Reps,
  restSeconds: RestSeconds,
})
export type RepsItem = typeof RepsItem.Type

/** One exercise of a round, discriminated on `kind`. */
export const ProgramItem = Schema.Union([TimedItem, RepsItem])
export type ProgramItem = typeof ProgramItem.Type

export const ProgramDay = Schema.Struct({
  dayNumber: DayNumber,
  /** "Day 12 · Build", "Day 7 · Recovery". */
  title: Label,
  rounds: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 5 })),
  items: Schema.Array(ProgramItem).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
  restBetweenRoundsSeconds: RestSeconds,
})
export type ProgramDay = typeof ProgramDay.Type

export class Program extends Schema.Class<Program>("@tanren/shared/Program")({
  programId: ProgramId,
  name: Label,
  tagline: Note,
  description: Text,
  days: Schema.Array(ProgramDay).check(Schema.isMinLength(1), Schema.isMaxLength(365)),
}) {}
export type ProgramEncoded = (typeof Program)["Encoded"]

/** Estimate for a reps item, which has no clock: one rep every 3 seconds. */
export const SECONDS_PER_REP = 3

const workSeconds = (item: ProgramItem): number =>
  Match.value(item).pipe(
    Match.discriminatorsExhaustive("kind")({
      timed: ({ seconds }) => seconds,
      reps: ({ reps }) => reps * SECONDS_PER_REP,
    }),
  )

/**
 * Planned length of a day: every round does each item's work; after an item comes its
 * `restSeconds`, except after the last item of a round, where `restBetweenRoundsSeconds` applies
 * instead (and nothing after the final round).
 */
export const dayDurationSeconds = (day: ProgramDay): number => {
  const work = Arr.reduce(day.items, 0, (total, item) => total + workSeconds(item))
  const restInRound = Arr.reduce(Arr.dropRight(day.items, 1), 0, (t, item) => t + item.restSeconds)
  return day.rounds * (work + restInRound) + (day.rounds - 1) * day.restBetweenRoundsSeconds
}
