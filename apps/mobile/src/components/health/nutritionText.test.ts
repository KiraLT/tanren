import { describe, expect, it } from "@effect/vitest"
import { type DayTotals, LocalDate } from "@tanren/shared"
import { DateTime, Option } from "effect"
import { kcalText, moduleHidden, moduleLabel, moduleStats } from "./nutritionText"

/** 14:05 in Vilnius (EET, UTC+2 on 2026-10-27). */
const AS_OF = DateTime.makeUnsafe("2026-10-27T12:05:00.000Z")

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

const day = (patch: Partial<DayTotals> = {}): DayTotals => ({ ...baseDay, ...patch })

describe("kcalText", () => {
  it("groups thousands with commas and rounds", () => {
    expect(kcalText(1420)).toBe("1,420")
    expect(kcalText(10_000)).toBe("10,000")
    expect(kcalText(95.6)).toBe("96")
    expect(kcalText(0)).toBe("0")
  })
})

describe("moduleStats", () => {
  it("reads Eaten, Burned and Protein against the target with the two dots", () => {
    const [eaten, burned, protein] = moduleStats(baseDay, false)
    expect(eaten).toMatchObject({
      label: "Eaten",
      value: "1,420",
      dot: "accent",
      valueTone: "neutral",
    })
    expect(burned).toMatchObject({ label: "Burned", value: "1,840", valueTone: "neutral" })
    expect(burned.dot).toBeUndefined()
    expect(protein).toMatchObject({
      label: "Protein",
      value: "96",
      unit: "/ 170 g",
      dot: "success",
    })
  })

  it("turns Eaten danger over the budget", () => {
    const [eaten] = moduleStats(day({ kcalLeft: Option.some(-120) }), false)
    expect(eaten.valueTone).toBe("danger")
  })

  it("mutes a stale burned value", () => {
    expect(moduleStats(baseDay, true)[1].valueTone).toBe("muted")
  })

  it("shows a dash without a Garmin total", () => {
    expect(moduleStats(day(noHealth), false)[1].value).toBe("—")
  })

  it("shows bare grams of protein without targets", () => {
    expect(moduleStats(day(noTargets), false)[2].unit).toBe("g")
  })
})

describe("moduleHidden", () => {
  it("hides the module with no targets, no burned total and nothing logged", () => {
    expect(moduleHidden(day({ ...noTargets, ...noHealth }))).toBe(true)
  })

  it("shows it when only Garmin has a total", () => {
    expect(moduleHidden(day(noTargets))).toBe(false)
  })

  it("shows it when only targets are set", () => {
    expect(moduleHidden(day(noHealth))).toBe(false)
  })
})

describe("moduleLabel", () => {
  const hero = { label: "Left today", value: "620" }

  it("speaks the numeral, the three stats, the meta line and the insight", () => {
    expect(
      moduleLabel(
        baseDay,
        hero,
        "as of 14:05 · 8,420 steps",
        Option.some("Protein 75 g short — a shake covers it"),
      ),
    ).toBe(
      "Health today: Left today 620; eaten 1,420; burned 1,840; protein 96 of 170 g; " +
        "as of 14:05 · 8,420 steps; Protein 75 g short — a shake covers it",
    )
  })

  it("says no data without a Garmin total and bare grams without targets", () => {
    expect(
      moduleLabel(day({ ...noHealth, ...noTargets }), hero, "No tracker connected", Option.none()),
    ).toBe(
      "Health today: Left today 620; eaten 1,420; burned no data; protein 96 g; No tracker connected",
    )
  })
})
