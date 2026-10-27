import { describe, expect, it } from "@effect/vitest"
import { DateTime, Option } from "effect"
import { LocalDate } from "./common"
import { FoodEntryId, UserId } from "./ids"
import {
  buildDayTotals,
  FoodEntry,
  type FoodItem,
  formatInt,
  insights,
  totalsOf,
} from "./nutrition"
import { NutritionProfile } from "./user"

const date = LocalDate.make("2026-10-27")
const at = DateTime.makeUnsafe("2026-10-27T12:00:00.000Z")

const item = (proteinG: number): FoodItem => ({
  name: "Food",
  portion: "1",
  grams: Option.none(),
  kcal: 100,
  proteinG,
  carbsG: 0,
  fatG: 0,
  fibreG: Option.none(),
  confidence: Option.none(),
})

const entry = (n: number, proteinG: number): FoodEntry => {
  const items = [item(proteinG)]
  return new FoodEntry({
    id: FoodEntryId.make(`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`),
    userId: UserId.make("00000000-0000-4000-8000-0000000000aa"),
    createdAt: at,
    updatedAt: at,
    deletedAt: Option.none(),
    loggedAt: at,
    meal: "lunch",
    source: "mcp",
    items,
    ...totalsOf(items),
    note: Option.none(),
  })
}

const profile = NutritionProfile.make({
  goal: "maintain",
  bodyWeightKg: 70,
  heightCm: Option.none(),
  birthYear: Option.none(),
  sex: Option.none(),
  activityLevel: "sedentary",
  eatBackActive: false,
  kcalTarget: Option.none(),
  proteinTargetG: Option.some(155),
})

const dayWith = (proteinEaten: number) =>
  buildDayTotals({
    date,
    entries: [entry(1, proteinEaten)],
    health: Option.none(),
    nutrition: Option.some(profile),
  })

const insightGrams = (proteinEaten: number): number | undefined => {
  const today = dayWith(proteinEaten)
  const found = insights({ today, week: [today], hour: 16 }).find((i) => i.rule === "protein_short")
  const match = found?.text.match(/^Protein ([\d,]+) g short/)
  return match?.[1] === undefined ? undefined : Number(match[1].replace(",", ""))
}

describe("protein_short vs the card (HM-4)", () => {
  it("the insight grams are proteinLeftG to the gram; the card shows eaten rounded to 1", () => {
    // HM-4 case: card "78 / 155 g" (eaten 77.6), insight "77 g short" (left 77.4, Lead 17:00).
    const day = dayWith(77.6)
    expect(Math.round(day.eaten.proteinG)).toBe(78)
    expect(Option.getOrThrow(day.proteinLeftG)).toBe(77.4)
    expect(insightGrams(77.6)).toBe(77)
    // The card's visible gap (155 − 78 = 77) equals the insight.
    expect(155 - Math.round(day.eaten.proteinG)).toBe(insightGrams(77.6))
  })

  it("for every eaten value the insight is proteinLeftG rounded to the gram", () => {
    Array.from({ length: 179 }, (_, i) => Math.round(i * 7) / 10).forEach((e) => {
      const left = Option.getOrThrow(dayWith(e).proteinLeftG)
      const grams = insightGrams(e)
      expect(grams).toBeDefined()
      expect(grams).toBe(Math.round(left))
      expect(Math.abs((grams ?? 0) - left)).toBeLessThanOrEqual(0.5)
    })
  })

  it("boundaries: exactly 30 g left shows, 29.9 does not; formatInt groups thousands", () => {
    expect(insightGrams(125)).toBe(30)
    expect(insightGrams(125.1)).toBeUndefined()
    expect(formatInt(1420)).toBe("1,420")
  })
})
