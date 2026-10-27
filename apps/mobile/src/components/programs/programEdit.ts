import {
  type CatalogExercise,
  CatalogId,
  DayNumber,
  dayDurationSeconds,
  type ProgramDay,
  ProgramId,
  type ProgramItem,
  type ProgramSchedule,
  Reps,
  type Weekday,
} from "@tanren/shared"
import { Array as Arr, Match, Option, Schema } from "effect"

/**
 * Pure edits behind the program editor (ADR-0026, programs-mcp.md §4). Every function returns a new
 * value; the screens hand the result to `useProgramUpdate`, which writes the row.
 */

/** `ProgramDays` allows 1 to 84 days (the 12-week built-in); a day holds at most 12 items. */
export const MAX_DAYS = 84
export const MAX_ITEMS = 12
/** The "days per week" choices the schedule picker offers. */
export const PER_WEEK = [3, 4, 5, 6] as const
const MAX_PER_WEEK = Math.max(...PER_WEEK)

/** The longest slug base: 64 (the `Slug` limit) minus `-` and the 4 random characters. */
const SLUG_BASE_MAX = 59

/**
 * "Push & Pull — Évening" → "push-pull-evening": accents folded, runs of anything else become one
 * hyphen, no leading or trailing hyphen, at most `max` characters; an empty result is `"program"`.
 * Always matches `Slug`.
 */
const slugify = (text: string, max = 64): string => {
  const folded = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
  const cut = folded.slice(0, max).replace(/-+$/, "")
  return cut.length === 0 ? "program" : cut
}

/** The slug of a new row: `slugify(title)` (leaving room) + `-` + 4 characters from `suffix`. */
export const slugWithSuffix = (title: string, suffix: string): string =>
  `${slugify(title, SLUG_BASE_MAX)}-${suffix}`

/** Swaps the item at `index` with its neighbour in `direction`; out of range is a no-op (same array). */
export const moveItem = <A>(
  items: ReadonlyArray<A>,
  index: number,
  direction: -1 | 1,
): ReadonlyArray<A> => {
  const target = index + direction
  return Option.match(Option.all({ from: Arr.get(items, index), to: Arr.get(items, target) }), {
    onNone: () => items,
    onSome: ({ from, to }) =>
      Arr.map(items, (item, i) => (i === index ? to : i === target ? from : item)),
  })
}

export interface StepRange {
  readonly min: number
  readonly max: number
  readonly step: number
}

/** `current + direction * step`, clamped into the range. */
const stepValue = (current: number, direction: -1 | 1, range: StepRange): number =>
  Math.min(range.max, Math.max(range.min, current + direction * range.step))

/** Stepper ranges of the day editor (programs-mcp.md §4). */
export const RANGES = {
  rounds: { min: 1, max: 5, step: 1 },
  restBetweenRounds: { min: 0, max: 300, step: 15 },
  seconds: { min: 10, max: 600, step: 5 },
  reps: { min: 1, max: 100, step: 1 },
  sets: { min: 1, max: 10, step: 1 },
  rest: { min: 0, max: 300, step: 5 },
} as const satisfies Record<string, StepRange>

// Days -------------------------------------------------------------------------------------------

/** "Day 7 · Push" stays "Day 7 · Push" when it is day 7; a title that starts "Day N" follows its place. */
const retitle = (title: string, dayNumber: number): string =>
  title.replace(/^Day \d+/, `Day ${dayNumber}`)

/** Day numbers follow the order (1-based); a leading "Day N" in a title follows too. */
const renumber = (days: ReadonlyArray<ProgramDay>): ReadonlyArray<ProgramDay> =>
  Arr.map(days, (day, index) => ({
    ...day,
    dayNumber: index + 1,
    title: retitle(day.title, index + 1),
  }))

export const moveDay = (
  days: ReadonlyArray<ProgramDay>,
  index: number,
  direction: -1 | 1,
): ReadonlyArray<ProgramDay> => renumber(moveItem(days, index, direction))

/** "Add day": a copy of the last day at the end; at `MAX_DAYS` nothing changes. */
export const addDay = (days: ReadonlyArray<ProgramDay>): ReadonlyArray<ProgramDay> =>
  days.length >= MAX_DAYS
    ? days
    : Option.match(Arr.last(days), {
        onNone: () => days,
        onSome: (last) => renumber([...days, last]),
      })

/** Removes a day; the only day stays (a program has at least one). */
export const removeDay = (
  days: ReadonlyArray<ProgramDay>,
  index: number,
): ReadonlyArray<ProgramDay> =>
  days.length <= 1 ? days : renumber(Arr.filter(days, (_, i) => i !== index))

/** Applies `change` to day number `dayNumber`; any other day is untouched. */
export const updateDay = (
  days: ReadonlyArray<ProgramDay>,
  dayNumber: number,
  change: (day: ProgramDay) => ProgramDay,
): ReadonlyArray<ProgramDay> =>
  Arr.map(days, (day) => (day.dayNumber === dayNumber ? change(day) : day))

/** "N items · ≈ M min", the subtitle of a day row. */
export const daySubtitle = (day: ProgramDay): string => {
  const minutes = Math.max(1, Math.round(dayDurationSeconds(day) / 60))
  return `${day.items.length} ${day.items.length === 1 ? "item" : "items"} · ≈ ${minutes} min`
}

// Items ------------------------------------------------------------------------------------------

const DEFAULT_REST_SECONDS = 30
const DEFAULT_REPS = 10
const DEFAULT_SECONDS = 30

const timedItem = (catalogId: CatalogId, seconds: number, restSeconds: number): ProgramItem => ({
  kind: "timed",
  catalogId,
  seconds,
  restSeconds,
})

// `Reps.make` throws on a bad value; every call here passes a number already inside RANGES.reps.
const repsItem = (catalogId: CatalogId, reps: number, restSeconds: number): ProgramItem => ({
  kind: "reps",
  catalogId,
  reps: Reps.make(reps),
  restSeconds,
  sets: 1,
})

/** A catalog entry as a new item: timed entries 30 s, everything else 10 reps, rest 30 s. */
export const itemFromCatalog = (entry: Pick<CatalogExercise, "catalogId" | "kind">): ProgramItem =>
  entry.kind === "timed"
    ? timedItem(entry.catalogId, DEFAULT_SECONDS, DEFAULT_REST_SECONDS)
    : repsItem(entry.catalogId, DEFAULT_REPS, DEFAULT_REST_SECONDS)

/** The first exercise of a blank program (a day needs at least one item): a 30 s plank. */
export const BLANK_ITEM: ProgramItem = timedItem(
  CatalogId.make("plank"),
  DEFAULT_SECONDS,
  DEFAULT_REST_SECONDS,
)

/** Switches an item between timed and reps, keeping the exercise and the rest. */
export const withKind = (item: ProgramItem, kind: ProgramItem["kind"]): ProgramItem =>
  item.kind === kind
    ? item
    : kind === "timed"
      ? timedItem(item.catalogId, DEFAULT_SECONDS, item.restSeconds)
      : repsItem(item.catalogId, DEFAULT_REPS, item.restSeconds)

/** The item's work value: seconds of a timed item, count of a reps item. */
export const workValue = (item: ProgramItem): number =>
  Match.value(item).pipe(
    Match.discriminatorsExhaustive("kind")({
      timed: ({ seconds }) => seconds,
      reps: ({ reps }) => reps,
    }),
  )

const withWorkValue = (item: ProgramItem, value: number): ProgramItem =>
  Match.value(item).pipe(
    Match.discriminatorsExhaustive("kind")({
      timed: (timed) => ({ ...timed, seconds: value }),
      reps: (reps) => ({ ...reps, reps: Reps.make(value) }),
    }),
  )

const withRest = (item: ProgramItem, restSeconds: number): ProgramItem => ({
  ...item,
  restSeconds,
})

/** The work stepper's range for the item's kind. */
export const workRange = (item: ProgramItem): StepRange =>
  item.kind === "timed" ? RANGES.seconds : RANGES.reps

/** "30 s" / "10 reps" */
export const workText = (item: ProgramItem): string =>
  item.kind === "timed" ? `${item.seconds} s` : `${item.reps} ${item.reps === 1 ? "rep" : "reps"}`

/** Appends an item; a full day (`MAX_ITEMS`) is unchanged. */
export const appendItem = (day: ProgramDay, item: ProgramItem): ProgramDay =>
  day.items.length >= MAX_ITEMS ? day : { ...day, items: [...day.items, item] }

/** Removes an item; the only item stays (a day has at least one). */
export const removeItem = (day: ProgramDay, index: number): ProgramDay =>
  day.items.length <= 1 ? day : { ...day, items: Arr.filter(day.items, (_, i) => i !== index) }

export const mapItem = (
  day: ProgramDay,
  index: number,
  change: (item: ProgramItem) => ProgramItem,
): ProgramDay => ({
  ...day,
  items: Arr.map(day.items, (item, i) => (i === index ? change(item) : item)),
})

// Steps are functions of the value they are applied to, not of what a screen last rendered: two
// taps queue two changes and each lands on the row the previous one saved.

export const stepWork = (item: ProgramItem, direction: -1 | 1): ProgramItem =>
  withWorkValue(item, stepValue(workValue(item), direction, workRange(item)))

export const stepRest = (item: ProgramItem, direction: -1 | 1): ProgramItem =>
  withRest(item, stepValue(item.restSeconds, direction, RANGES.rest))

/** Straight sets of a reps item, clamped to `RANGES.sets`; a timed item is unchanged. */
export const stepSets = (item: ProgramItem, direction: -1 | 1): ProgramItem =>
  item.kind === "reps" ? { ...item, sets: stepValue(item.sets, direction, RANGES.sets) } : item

/** "4 sets" / "1 set" */
export const setsText = (sets: number): string => `${sets} ${sets === 1 ? "set" : "sets"}`

export const stepRounds = (day: ProgramDay, direction: -1 | 1): ProgramDay => ({
  ...day,
  rounds: stepValue(day.rounds, direction, RANGES.rounds),
})

export const stepRestBetweenRounds = (day: ProgramDay, direction: -1 | 1): ProgramDay => ({
  ...day,
  restBetweenRoundsSeconds: stepValue(
    day.restBetweenRoundsSeconds,
    direction,
    RANGES.restBetweenRounds,
  ),
})

// Schedule ---------------------------------------------------------------------------------------

export const WEEKDAYS: ReadonlyArray<Weekday> = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

/** The schedule of a program that has none (a built-in being duplicated): its day count, at most 6 a week (the picker offers 3 to 6). */
export const defaultSchedule = (dayCount: number): ProgramSchedule => ({
  kind: "daysPerWeek",
  days: Math.min(MAX_PER_WEEK, Math.max(1, dayCount)),
})

/** Toggles a weekday in a weekdays schedule (a daysPerWeek schedule starts from just that day); the last day cannot be removed. */
export const toggleWeekday = (schedule: ProgramSchedule, weekday: Weekday): ProgramSchedule => {
  const current = schedule.kind === "weekdays" ? schedule.weekdays : []
  const next = current.includes(weekday)
    ? Arr.filter(current, (day) => day !== weekday)
    : Arr.filter(WEEKDAYS, (day) => day === weekday || current.includes(day))
  return next.length === 0 ? schedule : { kind: "weekdays", weekdays: next }
}

// Picker route param ---------------------------------------------------------------------------------

export interface PickTarget {
  readonly programId: ProgramId
  readonly dayNumber: number
}

/** The `pickFor` route param: `<programId>/<dayNumber>`. */
export const pickForParam = (target: PickTarget): string =>
  `${target.programId}/${target.dayNumber}`

/** Reads `pickFor`; anything else (missing, no slash, a bad id, a day below 1) is `None`. */
export const parsePickFor = (text: string | undefined): Option.Option<PickTarget> =>
  Option.gen(function* () {
    const parts = (text ?? "").split("/")
    const [rawId, rawDay] = parts
    if (parts.length !== 2 || rawId === undefined || rawDay === undefined) {
      return yield* Option.none()
    }
    const programId = yield* Schema.decodeUnknownOption(ProgramId)(rawId)
    const dayNumber = yield* Schema.decodeUnknownOption(DayNumber)(Number(rawDay))
    return { programId, dayNumber }
  })

/**
 * What a schedule says when the picker shows nothing selected for it: a days-per-week count outside
 * the 3 to 6 segments (a program Claude wrote, or a daily one): "Every day", "2 days a week".
 * `None` when a segment or a weekday chip is selected.
 */
export const scheduleCaption = (schedule: ProgramSchedule): Option.Option<string> =>
  schedule.kind === "weekdays" || PER_WEEK.some((days) => days === schedule.days)
    ? Option.none()
    : Option.some(
        schedule.days === 7
          ? "Every day"
          : `${schedule.days} ${schedule.days === 1 ? "day" : "days"} a week`,
      )
