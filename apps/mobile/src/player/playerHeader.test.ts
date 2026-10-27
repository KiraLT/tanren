import { describe, expect, it } from "vitest"
import { dayFraction, eyebrowLabel, segmentsFilled } from "./playerHeader"
import type { PlayerProgress } from "./playerMachine"

/** A circuit day: 3 rounds of 7 single-set items (Core 30). */
const at = (round: number, item: number): PlayerProgress => ({
  round,
  rounds: 3,
  item,
  items: 7,
  set: 1,
  sets: 1,
  step: item,
  steps: 7,
})

/** A gym day: 1 round, 7 items, 4 sets on the first (step = set while on exercise 1). */
const gym = (set: number): PlayerProgress => ({
  round: 1,
  rounds: 1,
  item: 1,
  items: 7,
  set,
  sets: 4,
  step: set,
  steps: 24,
})

describe("player header", () => {
  it("labels a circuit position as round and exercise", () => {
    expect(eyebrowLabel(at(2, 5))).toBe("Round 2/3 · Exercise 5/7")
  })

  it("labels a gym position as exercise and set, with no round", () => {
    expect(eyebrowLabel(gym(1))).toBe("Exercise 1/7 · Set 1/4")
    expect(eyebrowLabel(gym(2))).toBe("Exercise 1/7 · Set 2/4")
  })

  it("starts the day ring empty and fills it by finished steps", () => {
    expect(dayFraction(at(1, 1))).toBe(0)
    expect(dayFraction(at(1, 8))).toBeCloseTo(7 / 21)
    expect(dayFraction(at(3, 7))).toBeCloseTo(20 / 21)
    expect(dayFraction(gym(3))).toBeCloseTo(2 / 24)
  })

  it("lights the segment bar up to the current exercise: 1 of N on the first", () => {
    expect(segmentsFilled(1, 7)).toBe(1)
    expect(segmentsFilled(5, 7)).toBe(5)
    expect(segmentsFilled(7, 7)).toBe(7)
  })

  it("keeps the segment count inside 0..total", () => {
    expect(segmentsFilled(9, 7)).toBe(7)
    expect(segmentsFilled(0, 7)).toBe(0)
    expect(segmentsFilled(1, 0)).toBe(0)
  })

  it("never leaves 0..1, even for an empty day", () => {
    expect(dayFraction({ ...at(1, 1), rounds: 0, items: 0, steps: 0 })).toBe(0)
    expect(dayFraction(at(9, 9))).toBe(1)
  })
})
