import { Array as Arr } from "effect"
import { formatClock } from "../hooks/restClock"
import { formatVolume } from "./planFormat"

/** The part of a `TodayExercise` the desktop stat row reads. */
export interface ExerciseStatsInput {
  readonly plannedSets: ReadonlyArray<unknown>
  readonly loggedSets: ReadonlyArray<{ readonly weightKg: number; readonly reps: number }>
  readonly restSeconds: number
}

/** Kilograms lifted so far on this exercise today (weight x reps over the logged sets). */
export const loggedVolumeKg = (loggedSets: ExerciseStatsInput["loggedSets"]): number =>
  Arr.reduce(loggedSets, 0, (total, set) => total + set.weightKg * set.reps)

/**
 * Desktop Today, under "Log set" (ui-polish Today 5): "Rest 3:00 · Done 2/5 · Volume 1,000 kg".
 * With no planned sets "Done" is the plain logged count.
 */
export const exerciseStats = (
  input: ExerciseStatsInput,
): ReadonlyArray<{ readonly label: string; readonly value: string }> => {
  const logged = input.loggedSets.length
  const planned = input.plannedSets.length
  return [
    { label: "Rest", value: formatClock(input.restSeconds) },
    { label: "Done", value: planned === 0 ? String(logged) : `${logged}/${planned}` },
    { label: "Volume", value: formatVolume(loggedVolumeKg(input.loggedSets)) },
  ]
}
