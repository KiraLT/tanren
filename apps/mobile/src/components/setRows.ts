import type { PlannedSet, RepTarget } from "@tanren/shared"
import { Array as Arr, Match, Option } from "effect"
import { formatKg } from "./stepMath"

export interface SetRow<P, L> {
  readonly position: number
  readonly planned: Option.Option<P>
  readonly logged: Option.Option<L>
}

/**
 * One row per planned set, then one per extra logged set beyond the plan. The n-th logged set
 * fills the n-th planned set, matching how the screen hands out `plannedSetId`.
 */
export const buildSetRows = <P, L>(
  planned: ReadonlyArray<P>,
  logged: ReadonlyArray<L>,
): ReadonlyArray<SetRow<P, L>> => [
  ...Arr.map(planned, (set, index) => ({
    position: index + 1,
    planned: Option.some(set),
    logged: Arr.get(logged, index),
  })),
  ...Arr.map(Arr.drop(logged, planned.length), (set, index) => ({
    position: planned.length + index + 1,
    planned: Option.none<P>(),
    logged: Option.some(set),
  })),
]

/** "8" or "8-10". */
export const formatRepTarget = (target: RepTarget): string =>
  Match.value(target).pipe(
    Match.tagsExhaustive({
      Exact: ({ reps }) => String(reps),
      Range: ({ min, max }) => `${min}-${max}`,
    }),
  )

/** "80 kg x 8-10 · RPE 8"; a missing weight or RPE target is left out. */
export const formatPlannedSet = (
  set: Pick<PlannedSet, "targetWeightKg" | "targetReps" | "targetRpe">,
): string => {
  const weight = Option.match(set.targetWeightKg, {
    onNone: () => "",
    onSome: (kg) => `${formatKg(kg)} kg × `,
  })
  const rpe = Option.match(set.targetRpe, {
    onNone: () => "",
    onSome: (value) => ` · RPE ${value}`,
  })
  return `${weight}${formatRepTarget(set.targetReps)}${rpe}`
}
