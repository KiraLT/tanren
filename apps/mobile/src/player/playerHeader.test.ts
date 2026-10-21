import { describe, expect, it } from "vitest"
import { dayFraction, eyebrowLabel } from "./playerHeader"

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

  it("never leaves 0..1, even for an empty day", () => {
    expect(dayFraction({ round: 1, rounds: 0, item: 1, items: 0 })).toBe(0)
    expect(dayFraction(at(9, 9))).toBe(1)
  })
})
