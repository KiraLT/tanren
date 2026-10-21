import { describe, expect, it } from "vitest"
import { dayFraction, eyebrowLabel, segmentsFilled } from "./playerHeader"

const at = (round: number, item: number) => ({ round, rounds: 3, item, items: 7 })

describe("player header", () => {
  it("labels the position as round and exercise", () => {
    expect(eyebrowLabel(at(2, 5))).toBe("Round 2/3 · Exercise 5/7")
  })

  it("starts the day ring empty and fills it by finished exercises", () => {
    expect(dayFraction(at(1, 1))).toBe(0)
    expect(dayFraction(at(1, 8))).toBeCloseTo(7 / 21)
    expect(dayFraction(at(3, 7))).toBeCloseTo(20 / 21)
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
    expect(dayFraction({ round: 1, rounds: 0, item: 1, items: 0 })).toBe(0)
    expect(dayFraction(at(9, 9))).toBe(1)
  })
})
