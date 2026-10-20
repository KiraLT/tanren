import { describe, expect, it } from "vitest"
import { formatClock, remainingSeconds } from "./restClock"

describe("formatClock", () => {
  it("formats m:ss", () => {
    expect(formatClock(0)).toBe("0:00")
    expect(formatClock(5)).toBe("0:05")
    expect(formatClock(90)).toBe("1:30")
    expect(formatClock(120)).toBe("2:00")
    expect(formatClock(605)).toBe("10:05")
  })

  it("clamps negatives and floors fractions", () => {
    expect(formatClock(-4)).toBe("0:00")
    expect(formatClock(59.9)).toBe("0:59")
  })
})

describe("remainingSeconds", () => {
  it("rounds up and never goes negative", () => {
    expect(remainingSeconds(10_000, 0)).toBe(10)
    expect(remainingSeconds(10_000, 9_001)).toBe(1)
    expect(remainingSeconds(10_000, 10_000)).toBe(0)
    expect(remainingSeconds(10_000, 12_000)).toBe(0)
  })
})
