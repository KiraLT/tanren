import { describe, expect, it } from "@effect/vitest"
import {
  type DayTotals,
  FoodEntry,
  FoodEntryId,
  type FoodItem,
  LocalDate,
  totalsOf,
  UserId,
} from "@tanren/shared"
import { DateTime, Option } from "effect"
import { healthStats, moduleHidden, moduleLabel } from "./nutritionText"

/** 14:05 in Vilnius (EET, UTC+2 on 2026-10-27). */
const AS_OF = DateTime.makeUnsafe("2026-10-27T12:05:00.000Z")

const shake: FoodItem = {
  name: "Protein shake",
  portion: "1 scoop",
  grams: Option.none(),
  kcal: 120,
  proteinG: 24,
  carbsG: 3,
  fatG: 1,
  fibreG: Option.none(),
  confidence: Option.none(),
}

/** One logged entry, for the "logged but nothing else" case. */
const lunch = new FoodEntry({
  id: FoodEntryId.make("00000000-0000-4000-8000-000000000001"),
  userId: UserId.make("00000000-0000-4000-8000-0000000000aa"),
  createdAt: AS_OF,
  updatedAt: AS_OF,
  deletedAt: Option.none(),
  loggedAt: AS_OF,
  meal: "snack",
  source: "manual",
  items: [shake],
  ...totalsOf([shake]),
  note: Option.none(),
})

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

describe("healthStats", () => {
  it("reads Eaten, Burned and Protein against the target with the two dots (headline)", () => {
    const [eaten, burned, protein] = healthStats(baseDay, false, "headline")
    expect(eaten).toMatchObject({
      label: "Eaten",
      value: "1,420",
      dot: "accent",
      valueVariant: "headline",
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

  it("prints no kcal unit on the Today headline variant", () => {
    const [eaten, burned] = healthStats(baseDay, false, "headline")
    expect([eaten.unit, burned.unit]).toEqual([undefined, undefined])
  })

  it("prints kcal after Eaten and Burned on the hero title variant", () => {
    const stats = healthStats(baseDay, false, "title")
    expect(stats.map((stat) => [stat.valueVariant, stat.unit])).toEqual([
      ["title", "kcal"],
      ["title", "kcal"],
      ["title", "/ 170 g"],
    ])
  })

  it("drops the kcal unit after a burned dash on the title variant", () => {
    expect(healthStats(day(noHealth), false, "title")[1]).toMatchObject({
      value: "—",
      unit: undefined,
    })
  })

  it("turns Eaten danger over the budget", () => {
    const [eaten] = healthStats(day({ kcalLeft: Option.some(-120) }), false, "headline")
    expect(eaten.valueTone).toBe("danger")
  })

  it("mutes a stale burned value", () => {
    expect(healthStats(baseDay, true, "title")[1].valueTone).toBe("muted")
  })

  it("shows a dash without a Garmin total", () => {
    expect(healthStats(day(noHealth), false, "headline")[1].value).toBe("—")
  })

  it("shows bare grams of protein without targets", () => {
    expect(healthStats(day(noTargets), false, "headline")[2].unit).toBe("g")
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

  it("shows it when entries are logged with no targets and no Garmin total", () => {
    expect(moduleHidden(day({ ...noTargets, ...noHealth, entries: [lunch] }))).toBe(false)
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
        Option.some("Protein 74 g short — spread protein over every meal"),
      ),
    ).toBe(
      "Health today: Left today 620; eaten 1,420; burned 1,840; protein 96 of 170 g; " +
        "as of 14:05 · 8,420 steps; Protein 74 g short — spread protein over every meal",
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
