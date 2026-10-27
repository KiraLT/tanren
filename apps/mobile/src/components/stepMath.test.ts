import { LOADED_EQUIPMENT } from "@tanren/shared"
import { Option } from "effect"
import { describe, expect, it } from "vitest"
import {
  effectiveStep,
  formatKg,
  isExactWeight,
  parseReps,
  parseWeight,
  STEP_RULES,
  stepKgFor,
  stepReps,
  stepWeight,
} from "./stepMath"

describe("stepWeight", () => {
  it("steps by 2.5 kg", () => {
    expect(stepWeight(80, 1)).toBe(82.5)
    expect(stepWeight(80, -1)).toBe(77.5)
  })

  it("never goes below 0", () => {
    expect(stepWeight(0, -1)).toBe(0)
    expect(stepWeight(1, -1)).toBe(0)
  })

  it("does not accumulate float error over many steps", () => {
    const up = Array.from({ length: 40 }).reduce<number>((kg) => stepWeight(kg, 1), 0.1)
    expect(up).toBe(100.1)
  })
})

describe("stepReps", () => {
  it("steps by 1", () => {
    expect(stepReps(8, 1)).toBe(9)
    expect(stepReps(8, -1)).toBe(7)
  })

  it("never goes below 0", () => {
    expect(stepReps(0, -1)).toBe(0)
  })

  it("keeps whole numbers", () => {
    expect(Number.isInteger(stepReps(7.4, 1))).toBe(true)
  })
})

describe("formatKg", () => {
  it("drops trailing zeros", () => {
    expect(formatKg(80)).toBe("80")
    expect(formatKg(82.5)).toBe("82.5")
    expect(formatKg(0)).toBe("0")
  })
})

describe("stepWeight with a step", () => {
  it("moves by the given step", () => {
    expect(stepWeight(20, 1, 1.25)).toBe(21.25)
    expect(stepWeight(20, 1, 5)).toBe(25)
  })
})

describe("stepKgFor", () => {
  it("lists every loaded equipment literal in exactly one rule", () => {
    const listed = STEP_RULES.flatMap((rule) => rule.equipment)
    const counts = Array.from(LOADED_EQUIPMENT, (item) => [
      item,
      listed.filter((entry) => entry === item).length,
    ])
    expect(counts).toEqual(Array.from(LOADED_EQUIPMENT, (item) => [item, 1]))
    expect(listed).toHaveLength(LOADED_EQUIPMENT.size)
  })

  it("derives the step from the equipment, 2.5 without loaded equipment", () => {
    expect(stepKgFor(["barbell", "bench"])).toBe(2.5)
    expect(stepKgFor(["dumbbell"])).toBe(2)
    expect(stepKgFor(["cable"])).toBe(5)
    expect(stepKgFor(["kettlebell"])).toBe(4)
    expect(stepKgFor(["legPress"])).toBe(5)
    expect(stepKgFor([])).toBe(2.5)
  })
})

describe("effectiveStep", () => {
  it("lets the override win over the equipment default", () => {
    expect(effectiveStep(Option.some(1.25), ["cable"])).toBe(1.25)
    expect(effectiveStep(Option.none(), ["cable"])).toBe(5)
  })
})

describe("direct entry parsers", () => {
  it("parses weight: comma, snap to 0.25, clamp, fallback", () => {
    expect(parseWeight("22,5", 20)).toBe(22.5)
    expect(parseWeight("22.6", 20)).toBe(22.5)
    expect(parseWeight("900", 20)).toBe(500)
    expect(parseWeight("-3", 20)).toBe(0)
    expect(parseWeight("", 20)).toBe(20)
    expect(parseWeight("  ", 20)).toBe(20)
    expect(parseWeight("abc", 20)).toBe(20)
    expect(parseWeight("Infinity", 20)).toBe(20)
  })

  it("parses reps (rounding, not fallback) and clamps exponent and negative weights", () => {
    expect(parseReps("0", 8)).toBe(1)
    expect(parseReps("7.6", 5)).toBe(8)
    expect(parseReps("abc", 5)).toBe(5)
    expect(parseWeight("1e3", 20)).toBe(500)
    expect(parseWeight("-5", 20)).toBe(0)
  })

  it("never returns NaN", () => {
    const parsed = ["", "abc", "NaN", "1e999", ",", "."].map((raw) => parseWeight(raw, 20))
    expect(parsed).toEqual([20, 20, 20, 20, 20, 20])
  })

  it("flags a draft that would clamp, snap or fall back", () => {
    expect(isExactWeight("22,5")).toBe(true)
    expect(isExactWeight("22.6")).toBe(false)
    expect(isExactWeight("abc")).toBe(false)
    expect(isExactWeight("900")).toBe(false)
  })
})
