import { describe, expect, it } from "vitest"
import { breakpointFor, layoutModeFor, WIDE_BREAKPOINT } from "./layoutMode"

describe("breakpointFor", () => {
  it("is phone up to 599 px and tablet from exactly 600 px", () => {
    expect(breakpointFor(390)).toBe("phone")
    expect(breakpointFor(599)).toBe("phone")
    expect(breakpointFor(600)).toBe("tablet")
  })

  it("is tablet up to 899 px and desktop from exactly 900 px", () => {
    expect(breakpointFor(899)).toBe("tablet")
    expect(breakpointFor(900)).toBe("desktop")
    expect(breakpointFor(1280)).toBe("desktop")
  })

  it("treats 0, negative and NaN widths as phone", () => {
    expect(breakpointFor(0)).toBe("phone")
    expect(breakpointFor(-1)).toBe("phone")
    expect(breakpointFor(Number.NaN)).toBe("phone")
  })
})

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
