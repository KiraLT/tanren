import { Array as Arr, Effect, Match, Schema } from "effect"
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

/** Straight sets of one reps item (programs-player-v2 §7.2). */
export const SetCount = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: 10 }),
)
export type SetCount = typeof SetCount.Type

export const RepsItem = Schema.Struct({
  kind: Schema.Literal("reps"),
  catalogId: CatalogId,
  reps: Reps,
  restSeconds: RestSeconds,
  /**
   * Straight sets of this exercise before the next item; `restSeconds` applies between them too.
   * Absent on days written before sets existed: decodes as 1.
   */
  sets: SetCount.pipe(Schema.withDecodingDefaultKey(Effect.succeed(1))),
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

/** Estimate for a reps item, which has no clock: one rep every 2 seconds (ADR-0020 §3). */
export const SECONDS_PER_REP = 2

const workSeconds = (item: ProgramItem): number =>
  Match.value(item).pipe(
    Match.discriminatorsExhaustive("kind")({
      timed: ({ seconds }) => seconds,
      reps: ({ reps }) => reps * SECONDS_PER_REP,
    }),
  )

/** How many straight sets an item runs: a reps item's `sets`, 1 for a timed item. */
export const setsOf = (item: ProgramItem): number =>
  Match.value(item).pipe(
    Match.discriminatorsExhaustive("kind")({
      timed: () => 1,
      reps: ({ sets }) => sets,
    }),
  )

/** One work phase of a round: set `set` of `sets` of the day's item `exerciseIndex`. */
export interface Step {
  readonly item: ProgramItem
  /** 0-based index into `day.items`. */
  readonly exerciseIndex: number
  readonly exercises: number
  /** 1-based. */
  readonly set: number
  readonly sets: number
  /**
   * Rest after this step: the item's `restSeconds` (between sets and after the last one). The
   * player replaces it with `restBetweenRoundsSeconds` after the last step of a round.
   */
  readonly restSeconds: number
}

/** One round of `day` as work steps: every item's sets in order (programs-player-v2 §7.3). */
export const expandDay = (day: ProgramDay): ReadonlyArray<Step> =>
  Arr.flatMap(day.items, (item, exerciseIndex) => {
    const sets = setsOf(item)
    return Arr.map(Arr.range(1, sets), (set) => ({
      item,
      exerciseIndex,
      exercises: day.items.length,
      set,
      sets,
      restSeconds: item.restSeconds,
    }))
  })

/**
 * Planned length of a day: every round does each step's work; after a step comes its
 * `restSeconds`, except after the last step of a round, where `restBetweenRoundsSeconds` applies
 * instead (and nothing after the final round).
 */
export const dayDurationSeconds = (day: ProgramDay): number => {
  const steps = expandDay(day)
  const work = Arr.reduce(steps, 0, (total, s) => total + workSeconds(s.item))
  const restInRound = Arr.reduce(Arr.dropRight(steps, 1), 0, (t, s) => t + s.restSeconds)
  return day.rounds * (work + restInRound) + (day.rounds - 1) * day.restBetweenRoundsSeconds
}
