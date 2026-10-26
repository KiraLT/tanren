import {
  type Activity,
  type ActivityExercise,
  type CatalogId,
  findCatalogExercise,
  LocalDate,
  type MuscleGroup,
  type Weekday,
} from "@tanren/shared"
import { Array as Arr, DateTime, Option } from "effect"
import { shiftDate, weekStartOf } from "../../services/progressMath"
import { formatDayDate, weekdayLabel } from "../planFormat"
import { formatVolume } from "../progress/progressFormat"

/** One week of the feed: header text, the week's totals and its cards in input order. */
export interface FeedSection {
  /** The week's `YYYY-MM-DD` start (`weekStartOf`: Monday), unique per section. */
  readonly key: string
  /** "This week" | "Last week" | "Week of 13 Oct". */
  readonly label: string
  /** "3 workouts · 12,400 kg" (reps when the week has no volume). */
  readonly summary: string
  readonly items: ReadonlyArray<Activity>
}

export type FeedRow =
  | { readonly _tag: "Header"; readonly key: string; readonly section: FeedSection }
  | { readonly _tag: "Card"; readonly key: string; readonly activity: Activity }

export interface StatTile {
  readonly value: string
  readonly caption: string
}

const twoDigits = (n: number): string => String(n).padStart(2, "0")

/** A UTC instant seen in the device's zone. */
export const inLocalZone = (at: DateTime.Utc): DateTime.Zoned =>
  DateTime.setZone(at, DateTime.zoneMakeLocal())

/** "18:40" in the zone of `at`. */
export const formatClock = (at: DateTime.Zoned): string =>
  `${twoDigits(DateTime.getPart(at, "hour"))}:${twoDigits(DateTime.getPart(at, "minute"))}`

/**
 * "48 min" / "1 h 12 min" / "1 h". Whole minutes, floored (a timer shows what has fully passed).
 * Under a minute: 0 s is "0 min", 1-59 s is "< 1 min" (never rounded up to a minute that did not happen).
 */
export const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 1) {
    return seconds <= 0 ? "0 min" : "< 1 min"
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 1) {
    return `${minutes} min`
  }
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

const WEEKDAY_BY_INDEX: ReadonlyArray<Weekday> = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

/** "26 Oct" in the zone of `at` (same text as `formatLoggedDate`, zone-explicit). */
export const formatDate = (at: DateTime.Zoned): string =>
  // `formatIsoDate` output always parses as a `LocalDate`.
  formatDayDate(LocalDate.make(DateTime.formatIsoDate(at)))

/** "Sat 26 Oct · 18:40". */
export const formatStamp = (at: DateTime.Zoned): string => {
  const weekday = WEEKDAY_BY_INDEX[DateTime.getPart(at, "weekDay")] ?? "mon"
  return `${weekdayLabel(weekday)} ${formatDate(at)} · ${formatClock(at)}`
}

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`

/** The volume tile's text: volume, or reps for a bodyweight activity (no load logged). */
const volumeOrReps = (volumeKg: number, reps: number): string =>
  volumeKg === 0 ? `${reps} reps` : formatVolume(volumeKg)

/** The three card tiles (design §3): duration | volume or reps | sets and exercises. */
export const statTiles = (activity: Activity): ReadonlyArray<StatTile> => [
  {
    value: Option.match(activity.durationSeconds, { onNone: () => "—", onSome: formatDuration }),
    caption: "Duration",
  },
  {
    value: volumeOrReps(activity.volumeKg, activity.reps),
    caption: activity.volumeKg === 0 ? "Reps" : "Volume",
  },
  {
    value: plural(activity.sets, "set", "sets"),
    caption: plural(activity.exercises.length, "exercise", "exercises"),
  },
]

/** What an exercise's map shows: the catalog image, or a drawn map from the row's muscle groups. */
export type ExerciseMapSource =
  | {
      readonly _tag: "Catalog"
      readonly catalogId: CatalogId
      readonly primary: ReadonlyArray<MuscleGroup>
      readonly secondary: ReadonlyArray<MuscleGroup>
    }
  | { readonly _tag: "Custom"; readonly primary: ReadonlyArray<MuscleGroup> }

/** A catalog link: its image and the entry's muscles; none: the row's `muscleGroups` as primary. */
export const exerciseMapSource = (exercise: ActivityExercise): ExerciseMapSource =>
  Option.match(exercise.catalogId, {
    onNone: () => ({ _tag: "Custom", primary: exercise.muscleGroups }),
    onSome: (catalogId) => {
      const entry = findCatalogExercise(catalogId)
      return {
        _tag: "Catalog",
        catalogId,
        primary: Option.match(entry, { onNone: () => [], onSome: (e) => e.primaryMuscles }),
        secondary: Option.match(entry, { onNone: () => [], onSome: (e) => e.secondaryMuscles }),
      }
    },
  })

/** The spoken label of a card (design §6). */
export const activityLabel = (activity: Activity): string => {
  const at = inLocalZone(activity.startedAt)
  const parts = [
    activity.title,
    `${formatDate(at)} ${formatClock(at)}`,
    Option.match(activity.durationSeconds, {
      onNone: () => "duration unknown",
      onSome: formatDuration,
    }),
    plural(activity.sets, "set", "sets"),
    plural(activity.exercises.length, "exercise", "exercises"),
    volumeOrReps(activity.volumeKg, activity.reps),
    ...(activity.prs > 0 ? [plural(activity.prs, "personal record", "personal records")] : []),
    ...Option.match(activity.program, { onNone: () => [], onSome: () => [activity.title] }),
  ]
  return parts.join(", ")
}

const weekKeyOf = (activity: Activity, zone: DateTime.TimeZone): string =>
  weekStartOf(DateTime.setZone(activity.startedAt, zone))

const labelFor = (key: string, thisWeek: string): string =>
  key === thisWeek
    ? "This week"
    : key === shiftDate(thisWeek, -7)
      ? "Last week"
      : // `key` is `weekStartOf` output (a `formatIsoDate`), which always parses.
        `Week of ${formatDayDate(LocalDate.make(key))}`

const summaryFor = (items: ReadonlyArray<Activity>): string => {
  const volume = Arr.reduce(items, 0, (total, item) => total + item.volumeKg)
  const reps = Arr.reduce(items, 0, (total, item) => total + item.reps)
  return `${plural(items.length, "workout", "workouts")} · ${volumeOrReps(volume, reps)}`
}

/**
 * Groups activities (newest first) under the local-Monday week they started in, sections in order
 * of first appearance, cards in input order. `now` fixes both "this week" and the zone.
 */
export const groupByWeek = (
  activities: ReadonlyArray<Activity>,
  now: DateTime.Zoned,
): ReadonlyArray<FeedSection> => {
  const thisWeek = weekStartOf(now)
  const keyed = Arr.map(activities, (activity) => ({
    activity,
    key: weekKeyOf(activity, now.zone),
  }))
  return Arr.map(Arr.dedupe(Arr.map(keyed, (entry) => entry.key)), (key) => {
    const items = Arr.map(
      Arr.filter(keyed, (entry) => entry.key === key),
      (entry) => entry.activity,
    )
    return { key, label: labelFor(key, thisWeek), summary: summaryFor(items), items }
  })
}

/** The flat list the screen renders: a header row, then its cards, per section. */
export const feedRows = (sections: ReadonlyArray<FeedSection>): ReadonlyArray<FeedRow> =>
  Arr.flatMap(sections, (section) => [
    { _tag: "Header" as const, key: `week-${section.key}`, section },
    ...Arr.map(section.items, (activity) => ({
      _tag: "Card" as const,
      key: `activity-${activity.sessionId}`,
      activity,
    })),
  ])
