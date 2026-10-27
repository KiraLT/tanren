import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { fitRowDetail, rowDetailMaxChars } from "./rowDetail"

describe("rowDetailMaxChars", () => {
  it("grows with the row and never drops below 16", () => {
    expect(rowDetailMaxChars(340)).toBe(24)
    expect(rowDetailMaxChars(496)).toBe(45)
    expect(rowDetailMaxChars(200)).toBe(16)
    expect(rowDetailMaxChars(0)).toBe(16)
  })
})

describe("fitRowDetail", () => {
  const best = "105 kg × 5"
  const e1Rm = Option.some("e1RM 122.5 kg")

  it("keeps the whole line when it fits", () => {
    expect(fitRowDetail(best, e1Rm, 40)).toBe("105 kg × 5 · e1RM 122.5 kg")
    expect(fitRowDetail(best, e1Rm, 26)).toBe("105 kg × 5 · e1RM 122.5 kg")
  })

  it("cuts at the separator, dropping the e1RM, one character short of the line", () => {
    expect(fitRowDetail(best, e1Rm, 25)).toBe("105 kg × 5")
    expect(fitRowDetail(best, e1Rm, 24)).toBe("105 kg × 5")
  })

  it("shows a bodyweight best set alone", () => {
    expect(fitRowDetail("12 reps", Option.none(), 24)).toBe("12 reps")
  })

  it("ends a best set longer than the cap in an ellipsis", () => {
    expect(fitRowDetail("1000 kg × 1000", Option.none(), 8)).toBe("1000 kg…")
    expect(fitRowDetail("1000 kg × 1000", e1Rm, 8)).toBe("1000 kg…")
  })
})
