import type { DailyHealth, ImportedActivity, ImportedSport, Provider } from "@tanren/shared"
import { Array as Arr, DateTime, Match, Option } from "effect"
import type { IconName } from "../../ui/iconPaths"
import { formatClock, formatDate, formatDurationCompact, formatStamp } from "./feedGroups"

/** One stat of an imported card or detail: a formatted value over its label. */
export interface ImportedStat {
  readonly value: string
  readonly label: string
}

/** Shown in place of a value the provider did not report; the label stays (garmin.md §6). */
export const MISSING = "—"

/** "8,420": whole numbers with a comma thousands separator (same grouping as `formatVolume`). */
export const grouped = (n: number): string =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")

/** "Garmin". */
export const providerName = (provider: Provider): string =>
  Match.value(provider).pipe(
    Match.when("garmin", () => "Garmin"),
    Match.when("strava", () => "Strava"),
    Match.exhaustive,
  )

/** The card's sport glyph (hiking shares the walking figure). */
export const sportIcon = (sport: ImportedSport): IconName =>
  Match.value(sport).pipe(
    Match.when("running", (): IconName => "run"),
    Match.when("walking", (): IconName => "walk"),
    Match.when("hiking", (): IconName => "walk"),
    Match.when("cycling", (): IconName => "bike"),
    Match.when("swimming", (): IconName => "swim"),
    Match.when("strength", (): IconName => "dumbbell"),
    Match.when("cardio", (): IconName => "zap"),
    Match.when("other", (): IconName => "more"),
    Match.exhaustive,
  )

/** "6.2 km": one decimal. */
export const formatDistance = (meters: number): string => `${(meters / 1000).toFixed(1)} km`

const orMissing = <A>(value: Option.Option<A>, format: (a: A) => string): string =>
  Option.match(value, { onNone: () => MISSING, onSome: format })

const kcal = (n: number): string => `${grouped(n)} kcal`
const bpm = (n: number): string => `${n} bpm`

/** The card's four stats (garmin.md §6): duration | distance | calories | average heart rate. */
export const importedStats = (activity: ImportedActivity): ReadonlyArray<ImportedStat> => [
  { value: formatDurationCompact(activity.durationSeconds), label: "Duration" },
  { value: orMissing(activity.distanceMeters, formatDistance), label: "Distance" },
  { value: orMissing(activity.calories, kcal), label: "Calories" },
  { value: orMissing(activity.avgHeartRate, bpm), label: "Avg HR" },
]

/** Below this a one-decimal distance stays "99.9 km"; from it, toFixed(1) would print "100.0 km". */
const WHOLE_KM_FROM_METERS = 99_950

/** "42.2 km" below 100 km, "123 km" from 100 km: at most 7 characters for a card slot. */
export const formatDistanceCompact = (meters: number): string =>
  meters >= WHOLE_KM_FROM_METERS ? `${Math.round(meters / 1000)} km` : formatDistance(meters)

/**
 * The card's four stats in a 72.5 px slot (390: (326 − 3 × 12) / 4): measured in GM-6S, "152 bpm"
 * at the 17 px headline step truncated, and "1,240 kcal" would too, so calories and heart rate show
 * the bare number under the same labels as the detail. Every value then stays within 7 characters
 * ("1h 12m", "42.2 km", "123 km", "1,240"), the width "30 min" was measured to fit.
 */
export const cardStats = (activity: ImportedActivity): ReadonlyArray<ImportedStat> => [
  { value: formatDurationCompact(activity.durationSeconds), label: "Duration" },
  { value: orMissing(activity.distanceMeters, formatDistanceCompact), label: "Distance" },
  { value: orMissing(activity.calories, grouped), label: "Calories" },
  { value: orMissing(activity.avgHeartRate, String), label: "Avg HR" },
]

/** The detail's stats: duration, distance, calories, average and maximum heart rate. */
export const importedDetailStats = (activity: ImportedActivity): ReadonlyArray<ImportedStat> => [
  ...importedStats(activity),
  { value: orMissing(activity.maxHeartRate, bpm), label: "Max HR" },
]

/** "Sat 25 Oct · 07:12", the start in `zone`. */
export const importedStamp = (activity: ImportedActivity, zone: DateTime.TimeZone): string =>
  formatStamp(DateTime.setZone(activity.startedAt, zone))

/** "from Garmin": the card's source line. */
export const sourceLine = (activity: ImportedActivity): string =>
  `from ${providerName(activity.provider)}`

/** "Imported from Garmin on 27 Oct": the detail's footnote, the import day in `zone`. */
export const importedOn = (activity: ImportedActivity, zone: DateTime.TimeZone): string =>
  `Imported from ${providerName(activity.provider)} on ${formatDate(DateTime.setZone(activity.createdAt, zone))}`

/**
 * The card's spoken label: title, start, then each reported stat with its label (a missing one is
 * left out, not read as a dash), then the source.
 */
export const importedLabel = (activity: ImportedActivity, zone: DateTime.TimeZone): string => {
  const at = DateTime.setZone(activity.startedAt, zone)
  const stats = Arr.filter(importedStats(activity), (stat) => stat.value !== MISSING)
  return [
    activity.title,
    `${formatDate(at)} ${formatClock(at)}`,
    ...Arr.map(stats, (stat) => `${stat.label} ${stat.value}`),
    sourceLine(activity),
  ].join(", ")
}

/**
 * The Today strip's line (garmin.md §7): "1,840 kcal · 8,420 steps · 52 bpm resting", each missing
 * value dropped; None when the day reports none of them (the strip is hidden).
 */
export const healthLine = (health: DailyHealth): Option.Option<string> => {
  const parts = Arr.getSomes([
    Option.map(health.totalCalories, kcal),
    Option.map(health.steps, (n) => `${grouped(n)} steps`),
    Option.map(health.restingHeartRate, (n) => `${n} bpm resting`),
  ])
  return parts.length === 0 ? Option.none() : Option.some(parts.join(" · "))
}
