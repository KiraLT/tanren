import { describe, expect, it } from "vitest"
import { rhythm, sizes, space, type TypeVariant, type } from "./tokens"

describe("type ramp", () => {
  it("numeralLg is the 96/100 display numeral, tabular", () => {
    expect(type.numeralLg).toMatchObject({
      fontFamily: type.numeral.fontFamily,
      fontSize: 96,
      lineHeight: 100,
      fontWeight: "800",
      fontVariant: ["tabular-nums"],
    })
  })

  it("clock is the 64/68 display numeral, tabular", () => {
    expect(type.clock).toMatchObject({
      fontFamily: type.numeral.fontFamily,
      fontSize: 64,
      lineHeight: 68,
      fontWeight: "800",
      fontVariant: ["tabular-nums"],
    })
  })

  it("keeps the 72/76 numeral unchanged", () => {
    expect(type.numeral).toMatchObject({ fontSize: 72, lineHeight: 76 })
  })

  it("is indexable by every TypeVariant", () => {
    const variants: ReadonlyArray<TypeVariant> = ["numeralLg", "clock", "numeral", "caption"]
    variants.forEach((variant) => {
      expect(type[variant].fontSize).toBeGreaterThan(0)
    })
  })
})

describe("sizes and rhythm", () => {
  it("adds illustrationXl 240 and the 1360 page cap", () => {
    expect(sizes.illustrationXl).toBe(240)
    expect(sizes.illustrationLg).toBe(176)
    expect(sizes.pageMaxWidth).toBe(1360)
    expect(sizes.controlMaxWidth).toBe(560)
  })

  it("adds the 280 desktop player ring", () => {
    expect(sizes.ringXl).toBe(280)
  })

  it("rhythm: label -> group 8, group -> label 24, hero -> section 24, chips 8, card 16", () => {
    expect(rhythm).toEqual({
      labelToGroup: 8,
      groupToLabel: 24,
      heroToSection: 24,
      chipGap: 8,
      cardPadding: 16,
    })
  })

  it("leaves the space scale alone", () => {
    expect(space).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 })
  })
})
