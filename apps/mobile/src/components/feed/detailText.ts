import { type Activity, type ActivityExercise, type MuscleGroup, unitOf } from "@tanren/shared"
import { Array as Arr, DateTime, Option } from "effect"
import { MUSCLE_LABEL } from "../../illustrations/muscleMap/regions"
import { formatSetText } from "../progress/progressFormat"
import { formatClock, formatStamp, inLocalZone, type StatTile, statTiles } from "./feedGroups"

/** "Sat 26 Oct · 18:40 – 19:28"; the end time only when the duration is known (design §4). */
export const dateLine = (activity: Activity): string => {
  const start = formatStamp(inLocalZone(activity.startedAt))
  return Option.match(activity.durationSeconds, {
    onNone: () => start,
    onSome: (seconds) => {
      const end = DateTime.add(activity.startedAt, { seconds })
      return `${start} – ${formatClock(inLocalZone(end))}`
    },
  })
}

/** The four detail tiles: Duration, Volume (or Reps), Sets, PRs (the first two are the card's). */
export const detailTiles = (activity: Activity): ReadonlyArray<StatTile> => [
  ...Arr.take(statTiles(activity), 2),
  { value: String(activity.sets), caption: "Sets" },
  { value: String(activity.prs), caption: "PRs" },
]

const listOf = (muscles: ReadonlyArray<MuscleGroup>): string =>
  muscles.map((muscle) => MUSCLE_LABEL[muscle]).join(", ")

/** "Muscles worked: chest, triceps; secondary: shoulders" (the secondary part only when present). */
export const musclesLabel = (
  primary: ReadonlyArray<MuscleGroup>,
  secondary: ReadonlyArray<MuscleGroup>,
): string =>
  `Muscles worked: ${primary.length > 0 ? listOf(primary) : "none recorded"}${
    secondary.length > 0 ? `; secondary: ${listOf(secondary)}` : ""
  }`

/** "3 sets · best 87.5 kg × 8" ("1 set"; a bodyweight best is "best 12 reps", a plank "best 45 s"). */
export const exerciseSubtitle = (exercise: ActivityExercise): string => {
  const count = exercise.sets.length
  const best = formatSetText(exercise.best.weightKg, exercise.best.reps, unitOf(exercise))
  return `${count} ${count === 1 ? "set" : "sets"} · best ${best}`
}

const rpeText = (value: number): string => String(value)

/**
 * "80 kg × 8 · 85 kg × 8 · 87.5 kg × 8 PR · RPE 8": the sets in order (a PR set is marked), then
 * the RPE the sets logged ("RPE 8", or "RPE 7–8.5" when they differ); no RPE segment without one.
 */
export const setLine = (exercise: ActivityExercise): string => {
  const unit = unitOf(exercise)
  const sets = Arr.map(
    exercise.sets,
    (set) => `${formatSetText(set.weightKg, set.reps, unit)}${set.isPr ? " PR" : ""}`,
  )
  const rpes = Arr.getSomes(Arr.map(exercise.sets, (set) => set.rpe))
  const low = Math.min(...rpes)
  const high = Math.max(...rpes)
  const rpe =
    rpes.length === 0
      ? []
      : [low === high ? `RPE ${rpeText(low)}` : `RPE ${rpeText(low)}–${rpeText(high)}`]
  return [...sets, ...rpe].join(" · ")
}

/** Four tiles of `title2` ("4,230 kg") plus card padding need about 104 px each: 4 x 104 + 3 x 12 gaps. */
const FOUR_TILES_MIN_WIDTH = 480

/** Tiles per row for a column of this inner width: 4 when they fit, else a 2 x 2 grid. */
export const tilesPerRow = (innerWidth: number): 2 | 4 =>
  innerWidth >= FOUR_TILES_MIN_WIDTH ? 4 : 2
