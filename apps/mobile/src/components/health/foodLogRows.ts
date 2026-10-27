import { type FoodEntry, type FoodEntryId, formatInt } from "@tanren/shared"
import { Array as Arr, DateTime, Match, Option, Order } from "effect"
import { formatClock } from "../feed/feedGroups"

/** How long the "Entry deleted" Undo stays (nutrition.md §6). */
export const UNDO_MS = 15_000

/** "Oats" / "Oats +2": the first item's name plus how many more the entry holds. */
export const rowTitle = (entry: FoodEntry): string => {
  const first = Option.match(Arr.head(entry.items), {
    onNone: () => "Food",
    onSome: (item) => item.name,
  })
  const more = entry.items.length - 1
  return more > 0 ? `${first} +${more}` : first
}

/** "12:40 · 540 kcal · 38 g protein" with the clock in `zone`. */
export const rowSubtitle = (
  entry: FoodEntry,
  zone: DateTime.TimeZone = DateTime.zoneMakeLocal(),
): string =>
  `${formatClock(DateTime.setZone(entry.loggedAt, zone))} · ${formatInt(entry.kcal)} kcal · ${formatInt(entry.proteinG)} g protein`

const byLoggedAt = Order.mapInput(DateTime.Order, (entry: FoodEntry) => entry.loggedAt)

/** Newest first. */
export const sortNewestFirst = (entries: ReadonlyArray<FoodEntry>): ReadonlyArray<FoodEntry> =>
  Arr.sort(entries, Order.flip(byLoggedAt))

/** The one deletion that can still be undone, and until when (epoch ms). */
export interface PendingUndo {
  readonly id: FoodEntryId
  readonly until: number
}

export type UndoAction =
  | { readonly _tag: "Delete"; readonly id: FoodEntryId; readonly now: number }
  | { readonly _tag: "Undo" }
  | { readonly _tag: "Tick"; readonly now: number }

export interface UndoStep {
  readonly pending: Option.Option<PendingUndo>
  /** The entry to restore, when the step was an Undo of a live pending deletion. */
  readonly restore: Option.Option<FoodEntryId>
}

/**
 * Delete opens (or replaces) the pending Undo for 15 s; Undo restores it; a Tick at or after
 * `until` clears it.
 */
export const stepUndo = (pending: Option.Option<PendingUndo>, action: UndoAction): UndoStep =>
  Match.valueTags(action, {
    Delete: ({ id, now }): UndoStep => ({
      pending: Option.some({ id, until: now + UNDO_MS }),
      restore: Option.none(),
    }),
    Undo: (): UndoStep => ({ pending: Option.none(), restore: Option.map(pending, (p) => p.id) }),
    Tick: ({ now }): UndoStep => ({
      pending: Option.filter(pending, (p) => now < p.until),
      restore: Option.none(),
    }),
  })
