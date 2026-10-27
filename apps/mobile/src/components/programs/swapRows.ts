import type { CatalogExercise, CatalogId, Swaps } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import { equipmentLabel, humanize } from "../../library/catalogFormat"

/** "Quads, Glutes · Barbell": the primary muscles `entry` shares with `original`, then its equipment. */
export const swapSubtitle = (original: CatalogExercise, entry: CatalogExercise): string => {
  const shared = Arr.filter(entry.primaryMuscles, (muscle) =>
    original.primaryMuscles.includes(muscle),
  )
  return `${Arr.map(shared, humanize).join(", ")} · ${equipmentLabel(entry.equipment)}`
}

/** What `from` is swapped to on the enrollment; `None` when it runs as written. */
export const swappedTo = (swaps: Swaps, from: CatalogId): Option.Option<CatalogId> =>
  Option.map(
    Arr.findFirst(swaps, (swap) => swap.from === from),
    (swap) => swap.to,
  )
