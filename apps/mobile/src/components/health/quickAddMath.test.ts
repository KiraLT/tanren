import { describe, expect, it } from "@effect/vitest"
import {
  FoodEntryInsert,
  QUICK_ADD,
  type QuickAddItem,
  searchQuickAdd,
  totalsOf,
} from "@tanren/shared"
import { Array as Arr, DateTime, Option, Order, Schema } from "effect"
import {
  addLabel,
  buildQuickAddDraft,
  clampMultiplier,
  editorAddLabel,
  gramsText,
  itemSubtitle,
  MEAL_OPTIONS,
  multiplierText,
  portionText,
  stepMultiplier,
} from "./quickAddMath"

const byId = (id: string): QuickAddItem =>
  Option.getOrThrow(Arr.findFirst(QUICK_ADD, (entry) => entry.id === id))

const whey = byId("whey-scoop")

describe("searchQuickAdd (the sheet's list)", () => {
  it("finds the two shakes, case-insensitively", () => {
    expect(searchQuickAdd("shake").map((entry) => entry.id)).toEqual(["whey-scoop", "whey-milk"])
    expect(searchQuickAdd("SHAKE").map((entry) => entry.id)).toEqual(["whey-scoop", "whey-milk"])
  })

  it("lists all 23 rows sorted by name for an empty query", () => {
    const all = searchQuickAdd("")
    expect(all).toHaveLength(23)
    const names = all.map((entry) => entry.name.toLowerCase())
    expect(names).toEqual(Arr.sort(names, Order.String))
  })

  it("returns nothing for an unknown query", () => {
    expect(searchQuickAdd("zzz-not-food")).toEqual([])
  })
})

describe("multiplier", () => {
  it("clamps into 0.5–5", () => {
    expect(clampMultiplier(0.25)).toBe(0.5)
    expect(clampMultiplier(6)).toBe(5)
    expect(clampMultiplier(1.5)).toBe(1.5)
  })

  it("steps by 0.5 and holds at the bounds", () => {
    expect(stepMultiplier(1, 1)).toBe(1.5)
    expect(stepMultiplier(1, -1)).toBe(0.5)
    expect(stepMultiplier(0.5, -1)).toBe(0.5)
    expect(stepMultiplier(5, 1)).toBe(5)
    expect(multiplierText(1.5)).toBe("×1.5")
  })
})

describe("labels", () => {
  it("groups thousands", () => {
    expect(addLabel(360)).toBe("Add 360 kcal")
    expect(addLabel(1230)).toBe("Add 1,230 kcal")
  })

  it("scales whey ×1.5 through the shared helper (106 kcal → 159)", () => {
    expect(editorAddLabel(whey, 1.5)).toBe("Add 159 kcal")
    expect(portionText(whey, 1.5)).toBe("1.5 × 1 scoop in water, 30 g")
    expect(gramsText(whey, 1.5)).toBe("45 g")
  })

  it("labels the five meals in day order with full words", () => {
    expect(MEAL_OPTIONS.map((option) => option.label)).toEqual([
      "Breakfast",
      "Lunch",
      "Dinner",
      "Snack",
      "Supplement",
    ])
  })

  it("subtitles a row with kcal, whole protein grams and the portion", () => {
    expect(itemSubtitle(whey)).toBe("106 kcal · 23 g · 1 scoop in water, 30 g")
  })
})

describe("buildQuickAddDraft", () => {
  const now = DateTime.makeUnsafe("2026-10-27T12:40:00.000Z")
  const draft = buildQuickAddDraft({ item: whey, multiplier: 1.5, meal: "supplement", now })

  it("is one scaled quick_add item with no note at now", () => {
    expect(draft.source).toBe("quick_add")
    expect(draft.items).toHaveLength(1)
    expect(draft.items[0]?.kcal).toBe(159)
    expect(draft.meal).toBe("supplement")
    expect(Option.isNone(draft.note)).toBe(true)
    expect(DateTime.formatIso(draft.loggedAt)).toBe("2026-10-27T12:40:00.000Z")
  })

  it("decodes as the shared FoodEntryInsert once the totals are added", () => {
    const insert = { ...draft, ...totalsOf(draft.items) }
    const encoded = Schema.encodeUnknownSync(FoodEntryInsert)(insert)
    const decoded = Schema.decodeUnknownSync(FoodEntryInsert)(encoded)
    expect(decoded.kcal).toBe(159)
    expect(decoded.source).toBe("quick_add")
  })
})
