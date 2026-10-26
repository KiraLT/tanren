import { describe, expect, it } from "vitest"
import { playerInnerWidth, ringSpec } from "./playerRing"

describe("playerInnerWidth", () => {
  it("is the 600 column less two desktop gutters at 1280", () => {
    expect(playerInnerWidth("desktop", 1280)).toBe(536)
  })

  it("follows a narrow window below the cap", () => {
    expect(playerInnerWidth("phone", 390)).toBe(358)
  })
})

describe("ringSpec", () => {
  it("phone keeps the default ring and the 64 clock", () => {
    expect(ringSpec("phone", 390)).toEqual({ size: undefined, clock: "clock" })
  })

  it("tablet keeps the default ring and the 72 numeral", () => {
    expect(ringSpec("tablet", 768)).toEqual({ size: undefined, clock: "numeral" })
  })

  it("desktop grows to 280 with the large numeral", () => {
    expect(ringSpec("desktop", 1280)).toEqual({ size: 280, clock: "numeralLg" })
  })

  it("desktop at the 900 minimum still fits (536 >= 280)", () => {
    expect(ringSpec("desktop", 900)).toEqual({ size: 280, clock: "numeralLg" })
  })

  it("falls back when the body cannot hold the ring", () => {
    // 300 - 64 = 236 < 280: only reachable with a desktop breakpoint on a tiny window.
    expect(ringSpec("desktop", 300)).toEqual({ size: undefined, clock: "numeral" })
  })
})
