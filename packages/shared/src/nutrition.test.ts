import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Option, Schema } from "effect"
import { LocalDate } from "./common"
import { DailyHealth } from "./garmin"
import { DailyHealthId, FoodEntryId, UserId } from "./ids"
import {
  buildDayTotals,
  closedWeekInsights,
  DayTotals,
  dayTotals,
  FoodEntry,
  FoodEntryPatch,
  type FoodItem,
  FoodItems,
  formatInt,
  insights,
  nutritionTargets,
  onKcalTarget,
  totalsOf,
  weekSummary,
} from "./nutrition"
import { failingPaths } from "./testing"
import { NutritionProfile } from "./user"

const today = LocalDate.make("2026-10-27")
const at = DateTime.makeUnsafe("2026-10-27T12:00:00.000Z")
const userId = UserId.make("00000000-0000-4000-8000-0000000000aa")

const food = (kcal: number, proteinG: number, carbsG = 0, fatG = 0): FoodItem => ({
  name: "Food",
  portion: "1 plate",
  grams: Option.none(),
  kcal,
  proteinG,
  carbsG,
  fatG,
  fibreG: Option.none(),
  confidence: Option.none(),
})

const entry = (n: number, items: ReadonlyArray<FoodItem>, deleted = false): FoodEntry =>
  new FoodEntry({
    id: FoodEntryId.make(`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`),
    userId,
    createdAt: at,
    updatedAt: at,
    deletedAt: deleted ? Option.some(at) : Option.none(),
    loggedAt: at,
    meal: "lunch",
    source: "mcp",
    items,
    ...totalsOf(items),
    note: Option.none(),
  })

const profile = (fields: Partial<NutritionProfile>): NutritionProfile =>
  NutritionProfile.make({
    goal: "maintain",
    bodyWeightKg: 70,
    heightCm: Option.none(),
    birthYear: Option.none(),
    sex: Option.none(),
    activityLevel: "sedentary",
    eatBackActive: false,
    kcalTarget: Option.none(),
    proteinTargetG: Option.none(),
    ...fields,
  })

describe("totalsOf", () => {
  it("sums the items, kcal to an integer and grams to 0.1", () => {
    expect(totalsOf([food(100, 10.04, 1.06, 0.33), food(50.4, 0.12, 0.1, 0.1)])).toEqual({
      kcal: 150,
      proteinG: 10.2,
      carbsG: 1.2,
      fatG: 0.4,
    })
  })
})

describe("dayTotals", () => {
  it("sums live entries only", () => {
    const totals = dayTotals([
      entry(1, [food(650, 45, 70, 15)]),
      entry(2, [food(120, 24)]),
      entry(3, [food(900, 10)], true),
    ])
    expect(totals).toEqual({ kcal: 770, proteinG: 69, carbsG: 70, fatG: 15 })
  })
})

describe("FoodItems", () => {
  it.effect("rejects an empty list and more than 20 items", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(FoodItems, [])).toEqual([[]])
      const many = Array.from({ length: 21 }, () => Schema.encodeSync(FoodItems)([food(1, 1)])[0])
      expect(yield* failingPaths(FoodItems, many)).toEqual([[]])
    }),
  )
})

describe("FoodEntryPatch", () => {
  it.effect("decodes {} to no keys and one key to exactly that key", () =>
    Effect.gen(function* () {
      expect(Object.keys(yield* Schema.decodeUnknownEffect(FoodEntryPatch)({}))).toEqual([])
      expect(
        Object.keys(yield* Schema.decodeUnknownEffect(FoodEntryPatch)({ meal: "dinner" })),
      ).toEqual(["meal"])
    }),
  )
})

describe("nutritionTargets (nutrition.md §4 pins, today 2026-10-27)", () => {
  const mifflin = profile({
    goal: "gain_muscle",
    bodyWeightKg: 85,
    heightCm: Option.some(180),
    birthYear: Option.some(1990),
    sex: Option.some("male"),
    activityLevel: "moderate",
  })

  // §4 printed BMR 1 807.5 → 3 080; Mifflin-St Jeor gives 850 + 1125 − 180 + 5 = 1 800 →
  // × 1.55 × 1.10 = 3 069 → 3 070 (the design's intermediate is off by 7.5; reported).
  it("male 85 kg 180 cm born 1990 moderate gain: 3070 kcal, 155 g protein", () => {
    expect(nutritionTargets(mifflin, today)).toEqual({ kcal: 3070, proteinG: 155 })
  })

  it("fallback 85 kg light lose: 2060 kcal, 185 g protein", () => {
    expect(
      nutritionTargets(
        profile({ goal: "lose_weight", bodyWeightKg: 85, activityLevel: "light" }),
        today,
      ),
    ).toEqual({ kcal: 2060, proteinG: 185 })
  })

  it("maintain 70 kg sedentary: 1850 kcal, 110 g protein", () => {
    expect(nutritionTargets(profile({}), today)).toEqual({ kcal: 1850, proteinG: 110 })
  })

  it("floors 40 kg sedentary lose at 1200 kcal", () => {
    expect(nutritionTargets(profile({ goal: "lose_weight", bodyWeightKg: 40 }), today).kcal).toBe(
      1200,
    )
  })

  it("female Mifflin subtracts 161", () => {
    const female = profile({
      bodyWeightKg: 60,
      heightCm: Option.some(165),
      birthYear: Option.some(1996),
      sex: Option.some("female"),
    })
    // 600 + 1031.25 − 150 − 161 = 1320.25 × 1.2 = 1584.3 → 1580
    expect(nutritionTargets(female, today).kcal).toBe(1580)
  })

  it("overrides win over the derived values", () => {
    const fixed = profile({ kcalTarget: Option.some(2500), proteinTargetG: Option.some(180) })
    expect(nutritionTargets(fixed, today)).toEqual({ kcal: 2500, proteinG: 180 })
  })
})

describe("NutritionProfile", () => {
  it.effect("defaults eatBackActive to false when the key is missing", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(NutritionProfile)({
        goal: "maintain",
        bodyWeightKg: 70,
        heightCm: null,
        birthYear: null,
        sex: null,
        activityLevel: "light",
        kcalTarget: null,
        proteinTargetG: null,
      })
      expect(decoded.eatBackActive).toBe(false)
    }),
  )

  it.effect("rejects a body weight below 30 kg at bodyWeightKg", () =>
    Effect.gen(function* () {
      const paths = yield* failingPaths(NutritionProfile, {
        goal: "maintain",
        bodyWeightKg: 20,
        heightCm: null,
        birthYear: null,
        sex: null,
        activityLevel: "light",
        kcalTarget: null,
        proteinTargetG: null,
      })
      expect(paths).toEqual([["bodyWeightKg"]])
    }),
  )
})

const day = (fields: Partial<DayTotals>): DayTotals => ({
  date: today,
  eaten: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  burned: Option.none(),
  activeBurned: Option.none(),
  steps: Option.none(),
  burnedAsOf: Option.none(),
  targets: Option.some({ kcal: 2000, proteinG: 150, goal: "maintain" }),
  budgetKcal: Option.some(2000),
  kcalLeft: Option.some(2000),
  proteinLeftG: Option.some(150),
  entries: [],
  ...fields,
})

const logged = (kcal: number, proteinG: number, goal: "maintain" | "lose_weight" | "gain_muscle") =>
  day({
    eaten: { kcal, proteinG, carbsG: 0, fatG: 0 },
    targets: Option.some({ kcal: 2000, proteinG: 150, goal }),
    kcalLeft: Option.some(2000 - kcal),
    proteinLeftG: Option.some(150 - proteinG),
    entries: [entry(9, [food(kcal, proteinG)])],
  })

const rules = (input: Parameters<typeof insights>[0]) => insights(input).map((i) => i.rule)

describe("onKcalTarget", () => {
  it("uses the goal's band: lose −15 %…+5 %, gain −5 %…+15 %, maintain ±10 %", () => {
    expect(onKcalTarget(logged(1700, 0, "lose_weight"))).toBe(true)
    expect(onKcalTarget(logged(2150, 0, "lose_weight"))).toBe(false)
    expect(onKcalTarget(logged(2300, 0, "gain_muscle"))).toBe(true)
    expect(onKcalTarget(logged(1850, 0, "gain_muscle"))).toBe(false)
    expect(onKcalTarget(logged(2200, 0, "maintain"))).toBe(true)
    expect(onKcalTarget(logged(1790, 0, "maintain"))).toBe(false)
  })

  it("is false for a day with no entries", () => {
    expect(onKcalTarget(day({ eaten: { kcal: 2000, proteinG: 0, carbsG: 0, fatG: 0 } }))).toBe(
      false,
    )
  })
})

describe("weekSummary", () => {
  it("nets eaten − burned over the days Garmin covered and averages protein over logged days", () => {
    const summary = weekSummary([
      { ...logged(2000, 100, "maintain"), burned: Option.some(2400) },
      { ...logged(1800, 140, "maintain"), burned: Option.none() },
      day({ burned: Option.some(2200) }),
    ])
    expect(summary).toEqual({
      eatenKcal: 3800,
      burnedKcal: Option.some(4600),
      daysWithBurn: 2,
      netKcal: Option.some(-2600),
      proteinAvgG: 120,
      daysOnKcalTarget: 2,
      daysOnProteinTarget: 0,
      daysLogged: 2,
    })
  })
})

describe("insights (nutrition.md §5)", () => {
  const quiet = logged(1950, 150, "maintain")

  it("protein_short: ≥ 30 g left after 15:00, rounded to the gram", () => {
    const today = logged(1950, 76, "maintain")
    expect(insights({ today, week: [today], hour: 15 })).toContainEqual({
      rule: "protein_short",
      text: "Protein 74 g short — spread protein over every meal",
    })
    expect(rules({ today, week: [today], hour: 14 })).not.toContain("protein_short")
  })

  it.each([
    [115, "Protein 35 g short — a shake covers it"],
    [114, "Protein 36 g short — two protein meals cover it"],
    [80, "Protein 70 g short — two protein meals cover it"],
    [79, "Protein 71 g short — spread protein over every meal"],
    [0, "Protein 150 g short — spread protein over every meal"],
  ])("protein_short: %i g eaten of 150 g → %s", (eaten, text) => {
    const today = logged(1950, eaten, "maintain")
    expect(insights({ today, week: [today], hour: 15 })).toContainEqual({
      rule: "protein_short",
      text,
    })
  })

  it("protein_hit: nothing left", () => {
    expect(rules({ today: quiet, week: [quiet], hour: 10 })).toEqual(["protein_hit"])
  })

  it("kcal_over: more than 100 over, comma grouped", () => {
    const today = logged(3420, 150, "maintain")
    expect(insights({ today, week: [today], hour: 10 })[0]).toEqual({
      rule: "kcal_over",
      text: "1,420 kcal over target today",
    })
  })

  it("kcal_under_lose: lose goal, after 20:00, more than 300 left", () => {
    const today = logged(1400, 150, "lose_weight")
    expect(insights({ today, week: [today], hour: 20 })[0]).toEqual({
      rule: "kcal_under_lose",
      text: "600 kcal under — on track for the deficit",
    })
  })

  it("kcal_under_gain: gain goal, after 20:00, more than 300 left", () => {
    const today = logged(1400, 150, "gain_muscle")
    expect(insights({ today, week: [today], hour: 21 })[0]).toEqual({
      rule: "kcal_under_gain",
      text: "600 kcal to go — add a meal to hit the surplus",
    })
  })

  it("nothing_logged: after noon with no entries", () => {
    const empty = day({})
    expect(rules({ today: empty, week: [empty], hour: 12 })).toContain("nothing_logged")
    expect(rules({ today: empty, week: [empty], hour: 11 })).not.toContain("nothing_logged")
  })

  it("week_streak: 5 of 7 days on target", () => {
    const week = [quiet, quiet, quiet, quiet, quiet, day({}), day({})]
    expect(insights({ today: quiet, week, hour: 10 })).toContainEqual({
      rule: "week_streak",
      text: "5 of 7 days on target this week",
    })
  })

  it("week_protein_low: 7-day average under 80 % of target with ≥ 3 logged days", () => {
    const low = logged(1950, 90, "maintain")
    expect(insights({ today: low, week: [low, low, low], hour: 10 })).toContainEqual({
      rule: "week_protein_low",
      text: "Protein averaged 90 g of 150 g: plan a protein source per meal",
    })
    expect(rules({ today: low, week: [low, low], hour: 10 })).not.toContain("week_protein_low")
  })

  it("returns at most 3, one per group, in the order kcal, protein, logging, week", () => {
    const over = day({
      eaten: { kcal: 2500, proteinG: 40, carbsG: 0, fatG: 0 },
      kcalLeft: Option.some(-500),
      proteinLeftG: Option.some(110),
    })
    const low = logged(1950, 40, "maintain")
    expect(rules({ today: over, week: [low, low, low, over], hour: 16 })).toEqual([
      "kcal_over",
      "protein_short",
      "nothing_logged",
    ])
  })

  it("without targets only nothing_logged can show", () => {
    const off = day({
      targets: Option.none(),
      kcalLeft: Option.none(),
      proteinLeftG: Option.none(),
      budgetKcal: Option.none(),
    })
    expect(rules({ today: off, week: [off], hour: 22 })).toEqual(["nothing_logged"])
  })
})

describe("closedWeekInsights (NAV-F1)", () => {
  it("keeps only week_* rules, even when per-day rules would fire on the last day", () => {
    const low = logged(1400, 40, "gain_muscle")
    const week = [low, low, low, low, low, low, day({})] as const
    expect(rules({ today: week[6], week, hour: 23 })).toContain("nothing_logged")
    expect(closedWeekInsights(week).map((i) => i.rule)).toEqual(["week_protein_low"])
  })

  it("is empty when the week's last day has no targets", () => {
    const off = day({ targets: Option.none() })
    expect(closedWeekInsights([off])).toEqual([])
  })
})

describe("buildDayTotals", () => {
  const health = (activeCalories: Option.Option<number>) =>
    new DailyHealth({
      id: DailyHealthId.make("00000000-0000-4000-8000-0000000000bb"),
      userId,
      createdAt: at,
      updatedAt: DateTime.makeUnsafe("2026-10-27T13:05:00.000Z"),
      deletedAt: Option.none(),
      provider: "garmin",
      date: today,
      totalCalories: Option.some(1840),
      activeCalories,
      steps: Option.some(8420),
      restingHeartRate: Option.none(),
    })
  const entries = [entry(11, [food(650, 45, 70, 15)]), entry(12, [food(300, 10)], true)]
  const maintain = profile({})

  it("without a profile has no targets, budget or left values, but still sums eaten", () => {
    const totals = buildDayTotals({
      date: today,
      entries,
      health: Option.none(),
      nutrition: Option.none(),
    })
    expect(totals.eaten.kcal).toBe(650)
    expect(totals.entries).toHaveLength(1)
    expect([totals.targets, totals.budgetKcal, totals.kcalLeft, totals.proteinLeftG]).toEqual([
      Option.none(),
      Option.none(),
      Option.none(),
      Option.none(),
    ])
  })

  it("without a Garmin row has burned None and kcalLeft = target − eaten", () => {
    const totals = buildDayTotals({
      date: today,
      entries,
      health: Option.none(),
      nutrition: Option.some(maintain),
    })
    expect(totals.burned).toEqual(Option.none())
    expect(totals.burnedAsOf).toEqual(Option.none())
    expect(totals.targets).toEqual(Option.some({ kcal: 1850, proteinG: 110, goal: "maintain" }))
    expect(totals.kcalLeft).toEqual(Option.some(1200))
    expect(totals.proteinLeftG).toEqual(Option.some(65))
  })

  it("carries the Garmin burn, steps and its updatedAt; eat-back off keeps the budget", () => {
    const totals = buildDayTotals({
      date: today,
      entries,
      health: Option.some(health(Option.some(400))),
      nutrition: Option.some(maintain),
    })
    expect([totals.burned, totals.activeBurned, totals.steps]).toEqual([
      Option.some(1840),
      Option.some(400),
      Option.some(8420),
    ])
    expect(Option.map(totals.burnedAsOf, DateTime.formatIso)).toEqual(
      Option.some("2026-10-27T13:05:00.000Z"),
    )
    expect(totals.budgetKcal).toEqual(Option.some(1850))
  })

  it("eat-back on adds active calories to the budget; missing active adds 0", () => {
    const eatBack = profile({ eatBackActive: true })
    const withActive = buildDayTotals({
      date: today,
      entries,
      health: Option.some(health(Option.some(400))),
      nutrition: Option.some(eatBack),
    })
    expect([withActive.budgetKcal, withActive.kcalLeft]).toEqual([
      Option.some(2250),
      Option.some(1600),
    ])
    const noActive = buildDayTotals({
      date: today,
      entries,
      health: Option.some(health(Option.none())),
      nutrition: Option.some(eatBack),
    })
    expect(noActive.budgetKcal).toEqual(Option.some(1850))
  })

  it.effect("encodes through the DayTotals schema", () =>
    Effect.gen(function* () {
      const totals = buildDayTotals({
        date: today,
        entries,
        health: Option.some(health(Option.some(400))),
        nutrition: Option.some(maintain),
      })
      const wire = yield* Schema.encodeEffect(DayTotals)(totals)
      expect(wire.burnedAsOf).toBe("2026-10-27T13:05:00.000Z")
    }),
  )
})

describe("formatInt", () => {
  it("rounds and groups thousands with commas", () => {
    expect([formatInt(0), formatInt(999.6), formatInt(1420), formatInt(12345.4)]).toEqual([
      "0",
      "1,000",
      "1,420",
      "12,345",
    ])
  })
})
