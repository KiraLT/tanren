import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import { totalsOf } from "../nutrition"
import { QUICK_ADD, QuickAddItem, quickAddToFoodItem, searchQuickAdd } from "./quickAdd"

const byId = (id: string) => QUICK_ADD.find((entry) => entry.id === id)

describe("QUICK_ADD", () => {
  it("has 23 FDC-verified rows with unique ids", () => {
    expect(QUICK_ADD).toHaveLength(23)
    expect(new Set(QUICK_ADD.map((entry) => entry.id)).size).toBe(QUICK_ADD.length)
  })

  it.effect("every row encodes and decodes through QuickAddItem", () =>
    Effect.forEach(QUICK_ADD, (entry) =>
      Schema.decodeUnknownEffect(QuickAddItem)(Schema.encodeSync(QuickAddItem)(entry)),
    ),
  )

  it("totalsOf([row as item]) equals the row", () => {
    expect(
      QUICK_ADD.filter((entry) => {
        const totals = totalsOf([quickAddToFoodItem(entry, 1)])
        return (
          totals.kcal !== entry.kcal ||
          totals.proteinG !== entry.proteinG ||
          totals.carbsG !== entry.carbsG ||
          totals.fatG !== entry.fatG
        )
      }).map((entry) => entry.id),
    ).toEqual([])
  })
})

describe("searchQuickAdd", () => {
  it('finds the two shakes for "shake" (casein dropped: not in FDC SR Legacy)', () => {
    expect(searchQuickAdd("shake").map((entry) => entry.id)).toEqual(["whey-scoop", "whey-milk"])
  })

  it("matches aliases case-insensitively and sorts by name", () => {
    expect(searchQuickAdd("PORRIDGE").map((entry) => entry.id)).toEqual(["oats"])
    expect(searchQuickAdd("egg").map((entry) => entry.name)).toEqual(["Egg", "Egg whites"])
  })

  it("an empty query lists everything", () => {
    expect(searchQuickAdd("  ")).toHaveLength(QUICK_ADD.length)
  })
})

describe("quickAddToFoodItem", () => {
  it("scales all four totals and grams by the multiplier", () => {
    const whey = byId("whey-scoop")
    expect(whey).toBeDefined()
    const item = whey ? quickAddToFoodItem(whey, 2) : undefined
    expect(item).toMatchObject({
      kcal: 212,
      proteinG: 46.8,
      carbsG: 3.8,
      fatG: 1,
      grams: Option.some(60),
      portion: "2 × 1 scoop in water, 30 g",
    })
  })
})
