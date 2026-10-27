import { describe, expect, it } from "@effect/vitest"
import { FoodEntry, FoodEntryId, type FoodItem, totalsOf, UserId } from "@tanren/shared"
import { DateTime, Option } from "effect"
import { rowSubtitle, rowTitle, sortNewestFirst, stepUndo, UNDO_MS } from "./foodLogRows"

const food = (name: string, kcal: number, proteinG: number): FoodItem => ({
  name,
  portion: "1 serving",
  grams: Option.none(),
  kcal,
  proteinG,
  carbsG: 0,
  fatG: 0,
  fibreG: Option.none(),
  confidence: Option.none(),
})

const entry = (n: number, at: string, items: ReadonlyArray<FoodItem>): FoodEntry => {
  const stamp = DateTime.makeUnsafe(at)
  return new FoodEntry({
    id: FoodEntryId.make(`00000000-0000-4000-8000-00000000000${n}`),
    userId: UserId.make("00000000-0000-4000-8000-0000000000aa"),
    createdAt: stamp,
    updatedAt: stamp,
    deletedAt: Option.none(),
    loggedAt: stamp,
    meal: "lunch",
    source: "quick_add",
    items,
    ...totalsOf(items),
    note: Option.none(),
  })
}

const lunch = entry(1, "2026-10-27T10:40:00.000Z", [
  food("Chicken breast", 300, 31),
  food("Rice", 200, 4),
  food("Olive oil", 40, 3),
])
const shake = entry(2, "2026-10-27T15:05:00.000Z", [food("Whey protein shake", 106, 23.4)])
const utc = DateTime.zoneMakeNamedUnsafe("UTC")

describe("rows", () => {
  it("titles the first item plus how many more", () => {
    expect(rowTitle(lunch)).toBe("Chicken breast +2")
    expect(rowTitle(shake)).toBe("Whey protein shake")
  })

  it("subtitles clock · kcal · protein in the zone", () => {
    expect(rowSubtitle(lunch, utc)).toBe("10:40 · 540 kcal · 38 g protein")
  })

  it("sorts newest first", () => {
    expect(sortNewestFirst([lunch, shake]).map((e) => e.id)).toEqual([shake.id, lunch.id])
  })
})

describe("stepUndo", () => {
  const t0 = 1_000_000

  it("restores the pending entry before expiry", () => {
    const opened = stepUndo(Option.none(), { _tag: "Delete", id: lunch.id, now: t0 })
    const ticked = stepUndo(opened.pending, { _tag: "Tick", now: t0 + UNDO_MS - 1 })
    expect(Option.isSome(ticked.pending)).toBe(true)
    const undone = stepUndo(ticked.pending, { _tag: "Undo" })
    expect(undone.restore).toEqual(Option.some(lunch.id))
    expect(Option.isNone(undone.pending)).toBe(true)
  })

  it("clears at 15 s, after which Undo restores nothing", () => {
    const opened = stepUndo(Option.none(), { _tag: "Delete", id: lunch.id, now: t0 })
    const expired = stepUndo(opened.pending, { _tag: "Tick", now: t0 + 15_000 })
    expect(Option.isNone(expired.pending)).toBe(true)
    expect(Option.isNone(stepUndo(expired.pending, { _tag: "Undo" }).restore)).toBe(true)
  })

  it("replaces the pending entry on a second delete", () => {
    const first = stepUndo(Option.none(), { _tag: "Delete", id: lunch.id, now: t0 })
    const second = stepUndo(first.pending, { _tag: "Delete", id: shake.id, now: t0 + 5_000 })
    expect(second.pending).toEqual(Option.some({ id: shake.id, until: t0 + 5_000 + UNDO_MS }))
    expect(stepUndo(second.pending, { _tag: "Undo" }).restore).toEqual(Option.some(shake.id))
  })
})
