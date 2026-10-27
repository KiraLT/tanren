import {
  type FoodItem,
  formatInt,
  type Meal,
  type QuickAddItem,
  quickAddToFoodItem,
  totalsOf,
} from "@tanren/shared"
import { type DateTime, Option } from "effect"
import type { FoodEntryDraft } from "../../services/FoodEntryRepo"

/** Portion multiplier bounds and step for the quick-add editor (nutrition.md §6). */
export const MULTIPLIER_MIN = 0.5
export const MULTIPLIER_MAX = 5
export const MULTIPLIER_STEP = 0.5

/** The five meals in day order, full words (a wrapping chip row, designer N-QD). */
export const MEAL_OPTIONS: ReadonlyArray<{ readonly value: Meal; readonly label: string }> = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
  { value: "supplement", label: "Supplement" },
]

/** Snaps to the nearest 0.5 step inside 0.5–5. */
export const clampMultiplier = (n: number): number =>
  Math.min(
    MULTIPLIER_MAX,
    Math.max(MULTIPLIER_MIN, Math.round(n / MULTIPLIER_STEP) * MULTIPLIER_STEP),
  )

/** One step up (`+1`) or down (`-1`), held at the bounds. */
export const stepMultiplier = (n: number, direction: 1 | -1): number =>
  clampMultiplier(n + direction * MULTIPLIER_STEP)

/** "×1.5" for the Stepper value. */
export const multiplierText = (n: number): string => `×${n}`

/** "Add 360 kcal" / "Add 1,230 kcal". */
export const addLabel = (kcal: number): string => `Add ${formatInt(kcal)} kcal`

/** The catalog row scaled by the multiplier (shared scaling, never re-implemented here). */
export const scaledItem = (item: QuickAddItem, multiplier: number): FoodItem =>
  quickAddToFoodItem(item, clampMultiplier(multiplier))

/** The primary button label for the current editor state. */
export const editorAddLabel = (item: QuickAddItem, multiplier: number): string =>
  addLabel(totalsOf([scaledItem(item, multiplier)]).kcal)

/** "1.5 × 1 scoop in water, 30 g": the scaled portion line under the Stepper. */
export const portionText = (item: QuickAddItem, multiplier: number): string =>
  scaledItem(item, multiplier).portion

/** "45 g" (the Stepper's unit slot); "portions" when the row has no grams. */
export const gramsText = (item: QuickAddItem, multiplier: number): string =>
  Option.match(scaledItem(item, multiplier).grams, {
    onNone: () => "portions",
    onSome: (grams) => `${grams} g`,
  })

/** "106 kcal · 23 g · 1 scoop in water, 30 g" for a catalog row: fits one line at 390. */
export const itemSubtitle = (item: QuickAddItem): string =>
  `${formatInt(item.kcal)} kcal · ${Math.round(item.proteinG)} g · ${item.portion}`

export interface QuickAddDraftInput {
  readonly item: QuickAddItem
  readonly multiplier: number
  readonly meal: Meal
  readonly now: DateTime.Utc
}

/** The repo draft for one quick-add: one scaled item; the repo derives the totals from it. */
export const buildQuickAddDraft = ({
  item,
  multiplier,
  meal,
  now,
}: QuickAddDraftInput): FoodEntryDraft => ({
  loggedAt: now,
  meal,
  source: "quick_add",
  items: [scaledItem(item, multiplier)],
  note: Option.none(),
})
