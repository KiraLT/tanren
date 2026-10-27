import { describe, expect, it } from "@effect/vitest"
import { type DayTotals, type Insight, LocalDate } from "@tanren/shared"
import { DateTime, Option } from "effect"
import type { NutritionDay } from "../../services/NutritionRepo"
import { asOfText, burnedText, kcalText, stripLines } from "./nutritionText"

const VILNIUS = DateTime.zoneMakeNamedUnsafe("Europe/Vilnius")
/** 14:05 in Vilnius (EET, UTC+2 on 2026-10-27). */
const AS_OF = DateTime.makeUnsafe("2026-10-27T12:05:00.000Z")

const PROTEIN_SHORT: Insight = {
  rule: "protein_short",
  text: "Protein 75 g short — a shake covers it",
}

/** Owner day: 2,040 target, 1,420 eaten, Garmin 1,840 burned, protein 96/170 g. */
const baseDay: DayTotals = {
  date: LocalDate.make("2026-10-27"),
  eaten: { kcal: 1420, proteinG: 96, carbsG: 150, fatG: 50 },
  burned: Option.some(1840),
  activeBurned: Option.some(420),
  steps: Option.some(8420),
  burnedAsOf: Option.some(AS_OF),
  targets: Option.some({ kcal: 2040, proteinG: 170, goal: "lose_weight" }),
  budgetKcal: Option.some(2040),
  kcalLeft: Option.some(620),
  proteinLeftG: Option.some(74),
  entries: [],
}

const nd = (
  day: Partial<DayTotals> = {},
  insights: ReadonlyArray<Insight> = [PROTEIN_SHORT],
): NutritionDay => ({ day: { ...baseDay, ...day }, insights })

/** A day with no `daily_health` row. */
const noHealth: Partial<DayTotals> = {
  burned: Option.none(),
  activeBurned: Option.none(),
  steps: Option.none(),
  burnedAsOf: Option.none(),
}

/** Nutrition tracking off. */
const noTargets: Partial<DayTotals> = {
  targets: Option.none(),
  budgetKcal: Option.none(),
  kcalLeft: Option.none(),
  proteinLeftG: Option.none(),
}

describe("kcalText", () => {
  it("groups thousands with commas and rounds", () => {
    expect(kcalText(1420)).toBe("1,420")
    expect(kcalText(10_000)).toBe("10,000")
    expect(kcalText(95.6)).toBe("96")
    expect(kcalText(0)).toBe("0")
  })
})

describe("asOfText", () => {
  it("prints the 24-h clock in the given zone", () => {
    expect(asOfText(AS_OF, VILNIUS)).toBe("as of 14:05")
    expect(asOfText(DateTime.makeUnsafe("2026-10-27T22:07:00.000Z"), VILNIUS)).toBe("as of 00:07")
  })
})

describe("burnedText", () => {
  it("reads the Garmin total, or says there is no data", () => {
    expect(burnedText(baseDay)).toBe("Burned 1,840")
    expect(burnedText({ ...baseDay, ...noHealth })).toBe("Burned: no data")
  })
})

describe("stripLines", () => {
  it("(a) targets and burned: kcal left, full detail, first insight", () => {
    const lines = stripLines(nd(), VILNIUS)
    expect(lines.value).toBe("620 kcal left")
    expect(lines.detail).toBe("Eaten 1,420 · Burned 1,840 · Protein 96/170 g")
    expect(lines.insight).toEqual(Option.some("Protein 75 g short — a shake covers it"))
  })

  it("(b) no daily_health row: Burned: no data", () => {
    const lines = stripLines(nd(noHealth), VILNIUS)
    expect(lines.value).toBe("620 kcal left")
    expect(lines.detail).toBe("Eaten 1,420 · Burned: no data · Protein 96/170 g")
  })

  it("(c) targets None: kcal eaten and bare protein", () => {
    const lines = stripLines(nd(noTargets, []), VILNIUS)
    expect(lines.value).toBe("1,420 kcal eaten")
    expect(lines.detail).toBe("Eaten 1,420 · Burned 1,840 · Protein 96 g")
  })

  it("(d) over the budget: kcal over", () => {
    const lines = stripLines(
      nd({ eaten: { ...baseDay.eaten, kcal: 2160 }, kcalLeft: Option.some(-120) }),
      VILNIUS,
    )
    expect(lines.value).toBe("120 kcal over")
    expect(lines.detail).toBe("Eaten 2,160 · Burned 1,840 · Protein 96/170 g")
  })

  it("(e) no insight: insight None and the label has two lines", () => {
    const lines = stripLines(nd({}, []), VILNIUS)
    expect(Option.isNone(lines.insight)).toBe(true)
    expect(lines.accessibilityLabel).toBe(
      "Nutrition, 620 kcal left, Eaten 1,420 · Burned 1,840 as of 14:05 · Protein 96/170 g",
    )
  })

  it("speaks the three lines with as of after the burned part", () => {
    expect(stripLines(nd(), VILNIUS).accessibilityLabel).toBe(
      "Nutrition, 620 kcal left, Eaten 1,420 · Burned 1,840 as of 14:05 · Protein 96/170 g, " +
        "Protein 75 g short — a shake covers it",
    )
  })

  it("says no as of without a Garmin total", () => {
    const label = stripLines(nd(noHealth, []), VILNIUS).accessibilityLabel
    expect(label).toBe("Nutrition, 620 kcal left, Eaten 1,420 · Burned: no data · Protein 96/170 g")
    expect(label).not.toContain("as of")
  })

  it("keeps the worst-case detail within 50 characters (one caption line at 358)", () => {
    const detail = stripLines(
      nd({
        ...noHealth,
        eaten: { kcal: 10_000, proteinG: 500, carbsG: 0, fatG: 0 },
        targets: Option.some({ kcal: 10_000, proteinG: 500, goal: "gain_muscle" }),
        kcalLeft: Option.some(0),
      }),
      VILNIUS,
    ).detail
    expect(detail).toBe("Eaten 10,000 · Burned: no data · Protein 500/500 g")
    expect(detail.length).toBeLessThanOrEqual(50)
  })
})
