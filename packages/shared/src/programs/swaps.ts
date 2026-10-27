import { Array as Arr, Number as Num, Option, Order, String as Str } from "effect"
import { isAvailableWith } from "../catalog/availability"
import type { CatalogExercise } from "../catalog/CatalogExercise"
import type { CatalogEquipment } from "../catalog/taxonomy"
import type { Swaps } from "../program"
import type { ProgramDay } from "./Program"

/** How many alternatives `swapCandidates` offers. */
export const SWAP_CANDIDATE_LIMIT = 8

interface Ranked {
  readonly entry: CatalogExercise
  readonly primary: number
  readonly secondary: number
  readonly extraEquipment: number
}

const overlap = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): number =>
  Arr.filter(a, (x) => b.includes(x)).length

const byRank: Order.Order<Ranked> = Order.combineAll([
  Order.mapInput(Order.flip(Num.Order), (r: Ranked) => r.primary),
  Order.mapInput(Order.flip(Num.Order), (r: Ranked) => r.secondary),
  Order.mapInput(Num.Order, (r: Ranked) => r.extraEquipment),
  Order.mapInput(Str.Order, (r: Ranked) => r.entry.name),
])

/**
 * Alternatives for `original` (programs-mcp.md §1): same `kind`, at least one shared primary
 * muscle, doable with `available` (the active location's equipment; bodyweight always passes;
 * `None` = no active location or no location at all, nothing is filtered), the original excluded.
 * Ranked by shared primary muscles desc, shared secondary muscles desc, equipment tags the original
 * does not use asc, then `name`; the first `SWAP_CANDIDATE_LIMIT`.
 */
export const swapCandidates = (
  original: CatalogExercise,
  catalog: ReadonlyArray<CatalogExercise>,
  available: Option.Option<ReadonlyArray<CatalogEquipment>>,
): ReadonlyArray<CatalogExercise> => {
  const doable = Option.match(available, {
    onNone: () => () => true,
    onSome: (equipment) => isAvailableWith(equipment),
  })
  const ranked = Arr.filter(
    Arr.map(
      catalog,
      (entry): Ranked => ({
        entry,
        primary: overlap(entry.primaryMuscles, original.primaryMuscles),
        secondary: overlap(entry.secondaryMuscles, original.secondaryMuscles),
        extraEquipment: Arr.filter(entry.equipment, (tag) => !original.equipment.includes(tag))
          .length,
      }),
    ),
    (r) =>
      r.entry.catalogId !== original.catalogId &&
      r.entry.kind === original.kind &&
      r.primary > 0 &&
      doable(r.entry),
  )
  return Arr.map(Arr.take(Arr.sort(ranked, byRank), SWAP_CANDIDATE_LIMIT), (r) => r.entry)
}

/** The day with every item's `catalogId` mapped through `swaps` (`kind` and counts unchanged). */
export const applySwaps = (day: ProgramDay, swaps: Swaps): ProgramDay =>
  Arr.isReadonlyArrayEmpty(swaps)
    ? day
    : {
        ...day,
        items: Arr.map(day.items, (item) => ({
          ...item,
          catalogId: Option.getOrElse(
            Option.map(
              Arr.findFirst(swaps, (swap) => swap.from === item.catalogId),
              (swap) => swap.to,
            ),
            () => item.catalogId,
          ),
        })),
      }
