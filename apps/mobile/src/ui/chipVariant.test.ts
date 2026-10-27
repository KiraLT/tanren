import { describe, expect, it } from "vitest"
import {
  OUTLINE_SELECTED_WEIGHT,
  outlineChipStyle,
  outlineGlyphColor,
  outlineLabelStyle,
} from "./chipVariant"
import { darkColors, lightColors } from "./colors"
import { chipStyle } from "./controls"

describe("outline chip", () => {
  it("is the solid pill's 32 px shape with a transparent fill, on and off", () => {
    const shape = { height: 32, borderWidth: 1, backgroundColor: "transparent" }
    expect(outlineChipStyle(false, "light", lightColors)).toMatchObject(shape)
    expect(outlineChipStyle(true, "light", lightColors)).toMatchObject(shape)
  })

  it("off = the solid off pill; on = accent outline, never a filled pill", () => {
    expect(outlineChipStyle(false, "dark", darkColors)).toEqual(
      chipStyle(false, "dark", darkColors),
    )
    expect(outlineChipStyle(true, "light", lightColors).borderColor).toBe(lightColors.accent)
    expect(outlineChipStyle(true, "dark", darkColors).backgroundColor).toBe("transparent")
  })

  it("glyph is accent when on and muted when off", () => {
    expect(outlineGlyphColor(true, lightColors)).toBe(lightColors.accent)
    expect(outlineGlyphColor(false, lightColors)).toBe(lightColors.textMuted)
  })

  it("label is the 700 weight when on and the ramp's own weight when off", () => {
    expect(OUTLINE_SELECTED_WEIGHT).toBe("700")
    expect(outlineLabelStyle(true)).toEqual({ fontWeight: "700" })
    expect(outlineLabelStyle(false)).toBeUndefined()
  })
})
