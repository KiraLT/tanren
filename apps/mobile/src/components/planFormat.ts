import { LocalDate, type PlannedSet, type Weekday } from "@tanren/shared"
import { Array as Arr, Equivalence, Match, Option } from "effect"
import type { PlannedSessionStatus } from "../hooks/usePlanWeek"
import { formatKg } from "./stepMath"

/** The fields of a planned set the Plan screen prints. */
export type SetTarget = Pick<PlannedSet, "targetWeightKg" | "targetReps" | "restSeconds">

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

const WEEKDAYS: Readonly<Record<Weekday, string>> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
}

const twoDigits = (n: number): string => String(n).padStart(2, "0")

/** The local calendar date of `now` as `YYYY-MM-DD` (same value `TodayRepo.localToday` yields). */
export const localDateOf = (now: Date): LocalDate =>
  LocalDate.make(
    `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`,
  )

/** "Mon". */
export const weekdayLabel = (weekday: Weekday): string => WEEKDAYS[weekday]

/** Splits a validated `YYYY-MM-DD` into day-of-month and short month name. */
const dateParts = (date: LocalDate): { readonly day: number; readonly month: string } => ({
  day: Number(date.slice(8, 10)),
  month: MONTHS[Number(date.slice(5, 7)) - 1] ?? "",
})

/** "21 Oct". */
export const formatDayDate = (date: LocalDate): string => {
  const { day, month } = dateParts(date)
  return `${day} ${month}`
}

/** "19–25 Oct", or "28 Oct – 3 Nov" when the week crosses a month. */
export const formatWeekRange = (first: LocalDate, last: LocalDate): string => {
  const a = dateParts(first)
  const b = dateParts(last)
  return a.month === b.month
    ? `${a.day}–${b.day} ${b.month}`
    : `${a.day} ${a.month} – ${b.day} ${b.month}`
}

/** "done", "today", "upcoming", "missed": the badge text and the spoken status. */
export const statusLabel = (status: PlannedSessionStatus): string =>
  Match.value(status).pipe(
    Match.when("done", () => "done"),
    Match.when("today", () => "today"),
    Match.when("upcoming", () => "upcoming"),
    Match.when("missed", () => "missed"),
    Match.exhaustive,
  )

/** "Lower A, today". */
export const sessionLabel = (name: string, status: PlannedSessionStatus): string =>
  `${name}, ${statusLabel(status)}`

/** "8" or "8–12" (en dash; Today's `formatRepTarget` uses a hyphen). */
const formatReps = (target: PlannedSet["targetReps"]): string =>
  Match.value(target).pipe(
    Match.tagsExhaustive({
      Exact: ({ reps }) => String(reps),
      Range: ({ min, max }) => `${min}–${max}`,
    }),
  )

interface TargetGroup {
  readonly weight: Option.Option<number>
  readonly reps: string
  readonly rest: Option.Option<number>
  readonly count: number
}

const sameNumber = Option.makeEquivalence(Equivalence.strictEqual<number>())

const sameGroup = (group: TargetGroup, next: Omit<TargetGroup, "count">): boolean =>
  group.reps === next.reps &&
  sameNumber(group.weight, next.weight) &&
  sameNumber(group.rest, next.rest)

/** Consecutive sets with the same weight, reps and rest become one group with a count. */
const groupSets = (sets: ReadonlyArray<SetTarget>): ReadonlyArray<TargetGroup> =>
  Arr.reduce(sets, Arr.empty<TargetGroup>(), (groups: ReadonlyArray<TargetGroup>, set) => {
    const next = {
      weight: Option.map(set.targetWeightKg, (kg) => Number(kg)),
      reps: formatReps(set.targetReps),
      rest: Option.map(set.restSeconds, (seconds) => Number(seconds)),
    }
    const last = Arr.last(groups)
    return Option.isSome(last) && sameGroup(last.value, next)
      ? [...Arr.dropRight(groups, 1), { ...last.value, count: last.value.count + 1 }]
      : [...groups, { ...next, count: 1 }]
  })

const groupText = (group: TargetGroup): string =>
  `${group.count} × ${group.reps}${Option.match(group.weight, {
    onNone: () => "",
    onSome: (kg) => ` @ ${formatKg(kg)} kg`,
  })}`

const restText = (rest: Option.Option<number>): string =>
  Option.match(rest, { onNone: () => "", onSome: (seconds) => `rest ${seconds} s` })

/**
 * "3 × 5 @ 100 kg · rest 180 s". Identical consecutive sets are grouped, ranges read "8–12".
 * Mixed sets list each group ("1 × 5 @ 60 kg, 2 × 5 @ 100 kg"); one shared rest is printed once,
 * differing rests go in brackets per group. A missing weight or rest is left out.
 */
export const formatTarget = (sets: ReadonlyArray<SetTarget>): string => {
  const groups = groupSets(sets)
  const first = Arr.head(groups)
  if (Option.isNone(first)) return ""
  const sharedRest = Arr.every(groups, (group) => sameNumber(group.rest, first.value.rest))
  const body = Arr.map(groups, (group) =>
    sharedRest || Option.isNone(group.rest)
      ? groupText(group)
      : `${groupText(group)} (${restText(group.rest)})`,
  ).join(", ")
  return sharedRest && Option.isSome(first.value.rest)
    ? `${body} · ${restText(first.value.rest)}`
    : body
}

/** "Back Squat · 3 × 5 @ 100 kg · rest 180 s"; just the name when the block has no sets. */
export const formatBlockLine = (name: string, sets: ReadonlyArray<SetTarget>): string => {
  const target = formatTarget(sets)
  return target === "" ? name : `${name} · ${target}`
}
