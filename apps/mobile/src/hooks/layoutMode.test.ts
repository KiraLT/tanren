import { describe, expect, it } from "vitest"
import { layoutModeFor, WIDE_BREAKPOINT } from "./layoutMode"

describe("layoutModeFor", () => {
  it("keeps a phone (390 px) and anything below the breakpoint single-column", () => {
    expect(layoutModeFor(390)).toBe("single")
    expect(layoutModeFor(WIDE_BREAKPOINT - 1)).toBe("single")
  })

  it("switches to two columns at exactly 900 px and above", () => {
    expect(WIDE_BREAKPOINT).toBe(900)
    expect(layoutModeFor(900)).toBe("two-column")
    expect(layoutModeFor(1280)).toBe("two-column")
  })
})

describe("layoutModeFor boundaries", () => {
  it("is single just below 900 (fractional), at 0 and for negative or NaN widths", () => {
    expect(layoutModeFor(899.99)).toBe("single")
    expect(layoutModeFor(899)).toBe("single")
    expect(layoutModeFor(0)).toBe("single")
    expect(layoutModeFor(-1)).toBe("single")
    expect(layoutModeFor(Number.NaN)).toBe("single")
  })
})
