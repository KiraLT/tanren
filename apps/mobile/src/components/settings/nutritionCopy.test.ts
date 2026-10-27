import { describe, expect, it } from "@effect/vitest"
import { LocalDate, type NutritionProfile } from "@tanren/shared"
import { Option } from "effect"
import {
  ACTIVITY_LABELS,
  ACTIVITY_ORDER,
  ageLabel,
  GOAL_LABELS,
  nutritionSubtitle,
  showTargetsHint,
} from "./nutritionCopy"

const today = LocalDate.make("2026-10-27")

/** nutrition.md §4 pin: male 85 kg 180 cm born 1990, moderate, gain (N-F0 computed 3,070 / 155). */
const pinned: NutritionProfile = {
  goal: "gain_muscle",
  bodyWeightKg: 85,
  heightCm: Option.some(180),
  birthYear: Option.some(1990),
  sex: Option.some("male"),
  activityLevel: "moderate",
  eatBackActive: false,
  kcalTarget: Option.none(),
  proteinTargetG: Option.none(),
}

describe("labels", () => {
  it("pins the goal labels", () => {
    expect(GOAL_LABELS).toEqual({
      gain_muscle: "Gain muscle",
      lose_weight: "Lose weight",
      maintain: "Maintain",
    })
  })

  it("has a title for each of the five activity levels, in order", () => {
    expect(ACTIVITY_ORDER.map((level) => ACTIVITY_LABELS[level].title)).toEqual([
      "Sedentary",
      "Light",
      "Moderate",
      "Active",
      "Very active",
    ])
  })
})

describe("nutritionSubtitle", () => {
  it("reads the §4 pin with comma grouping", () => {
    expect(nutritionSubtitle(Option.some(pinned), today)).toBe("Gain muscle · 3,070 kcal · 155 g")
  })

  it("uses the 22 · weight fallback without height", () => {
    const fallback: NutritionProfile = {
      ...pinned,
      goal: "lose_weight",
      activityLevel: "light",
      heightCm: Option.none(),
    }
    expect(nutritionSubtitle(Option.some(fallback), today)).toBe("Lose weight · 2,060 kcal · 185 g")
  })

  it("shows the manual overrides when set", () => {
    const custom: NutritionProfile = {
      ...pinned,
      kcalTarget: Option.some(2800),
      proteinTargetG: Option.some(170),
    }
    expect(nutritionSubtitle(Option.some(custom), today)).toBe("Gain muscle · 2,800 kcal · 170 g")
  })

  it("reads Off when tracking is off", () => {
    expect(nutritionSubtitle(Option.none(), today)).toBe("Off")
  })
})

describe("showTargetsHint", () => {
  it("is false when height, birth year and sex are all set", () => {
    expect(showTargetsHint(pinned)).toBe(false)
  })

  it("is true when any one of them is unset", () => {
    expect(showTargetsHint({ ...pinned, heightCm: Option.none() })).toBe(true)
    expect(showTargetsHint({ ...pinned, birthYear: Option.none() })).toBe(true)
    expect(showTargetsHint({ ...pinned, sex: Option.none() })).toBe(true)
  })
})

describe("ageLabel", () => {
  it("reads the age in the year of today", () => {
    expect(ageLabel(1990, today)).toBe("age 36")
  })
})
