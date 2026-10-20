import { describe, expect, it } from "vitest"
import { formatKg, stepReps, stepWeight } from "./stepMath"

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
