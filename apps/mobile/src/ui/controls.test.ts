import { describe, expect, it } from "vitest"
import { darkColors, lightColors } from "./colors"
import {
  buttonHeights,
  buttonStyle,
  buttonVariants,
  cardStyle,
  chipColors,
  chipStyle,
  DISABLED_OPACITY,
  discStyle,
  listSeparatorStyle,
  numeralScale,
  pillForeground,
  ROW_TITLE_VARIANT,
  ringGeometry,
  ringSizes,
  ringSpec,
  rowBackground,
  rowChevron,
  rowPressedBackground,
  rowStyle,
  rowTones,
  STAT_GAP,
  segmentedInset,
  segmentFills,
  separatorInsets,
  setDotStates,
  setDotStyle,
  setPillStyle,
  statSlotWidth,
  stepButtonStyle,
  stepGlyphColor,
  stepperCaption,
  stepperNumeral,
  stepperSizes,
  THUMB_ROW_MIN_HEIGHT,
} from "./controls"

const idle = { pressed: false, hovered: false, disabled: false }

describe("Stepper", () => {
  it("xl is a 64 px hit area with a 30 px glyph, lg 56 / 24, xxl 72 / 34", () => {
    expect(stepperSizes).toEqual({
      xxl: { hit: 72, glyph: 34 },
      xl: { hit: 64, glyph: 30 },
      lg: { hit: 56, glyph: 24 },
    })
  })

  it("only xxl renders the numeral as numeralLg", () => {
    expect(stepperNumeral("xxl")).toBe("numeralLg")
    expect(stepperNumeral("xl")).toBe("numeral")
    expect(stepperNumeral("lg")).toBe("numeral")
  })

  it("xxl buttons are 72 x 72 circles", () => {
    expect(stepButtonStyle("xxl", idle, lightColors)).toMatchObject({ width: 72, height: 72 })
  })

  it("is borderless and fill-less at rest", () => {
    expect(stepButtonStyle("xl", idle, lightColors)).toMatchObject({
      width: 64,
      height: 64,
      borderWidth: 0,
      backgroundColor: "transparent",
      opacity: 1,
    })
  })

  it("shows a surface circle only while pressed", () => {
    expect(stepButtonStyle("xl", { ...idle, pressed: true }, darkColors)).toMatchObject({
      backgroundColor: darkColors.surface,
      borderRadius: 999,
      borderWidth: 0,
    })
  })

  it("disabled: no pressed circle, 0.4 opacity, muted glyph", () => {
    expect(
      stepButtonStyle("xl", { pressed: true, hovered: true, disabled: true }, lightColors),
    ).toMatchObject({ backgroundColor: "transparent", opacity: DISABLED_OPACITY })
    expect(stepGlyphColor(true, lightColors)).toBe(lightColors.textMuted)
    expect(stepGlyphColor(false, lightColors)).toBe(lightColors.text)
  })
})

describe("Button", () => {
  it("md/lg/xl are 48/56/64", () => {
    expect(buttonHeights).toEqual({ md: 48, lg: 56, xl: 64 })
  })

  it("is a pill at every size", () => {
    expect(buttonStyle("secondary", "md", "light", lightColors).borderRadius).toBe(999)
    expect(buttonStyle("primary", "xl", "light", lightColors)).toMatchObject({
      minHeight: 64,
      borderRadius: 999,
      backgroundColor: lightColors.accent,
    })
  })

  it("variants: primary accent/onAccent, secondary surface/text, text has no fill", () => {
    expect(buttonVariants.primary).toEqual({ background: "accent", foreground: "onAccent" })
    expect(buttonVariants.secondary).toEqual({ background: "surface", foreground: "text" })
    expect(buttonVariants.destructive).toEqual({ background: "dangerSoft", foreground: "danger" })
    expect(buttonVariants.text.background).toBe("transparent")
    expect(Object.keys(buttonVariants)).toEqual(["primary", "secondary", "destructive", "text"])
  })

  it("only the dark primary pill glows", () => {
    expect(buttonStyle("primary", "xl", "dark", darkColors).boxShadow).toBe(
      `0 8px 32px ${darkColors.glow}`,
    )
    expect(buttonStyle("primary", "xl", "light", lightColors)).not.toHaveProperty("boxShadow")
    expect(buttonStyle("secondary", "lg", "dark", darkColors)).not.toHaveProperty("boxShadow")
  })
})

describe("Card", () => {
  it("radius 16, continuous; hairline in light, none in dark", () => {
    expect(cardStyle("light", lightColors, false, lightColors.surface)).toMatchObject({
      borderRadius: 16,
      borderCurve: "continuous",
      borderWidth: 1,
      backgroundColor: lightColors.surface,
    })
    expect(cardStyle("dark", darkColors, false, darkColors.surface).borderWidth).toBe(0)
  })

  it("selected: 1.5 accent outline on accentSoft", () => {
    expect(cardStyle("dark", darkColors, true, darkColors.surface)).toMatchObject({
      borderWidth: 1.5,
      borderColor: darkColors.accent,
      backgroundColor: darkColors.accentSoft,
    })
  })
})

describe("ListRow", () => {
  it("rows have minHeight 52 and no fixed height", () => {
    const style = rowStyle(true, false, lightColors)
    expect(style.minHeight).toBe(52)
    expect(style).not.toHaveProperty("height")
  })

  it("grouped rows have no border; standalone rows keep the legacy hairline", () => {
    expect(rowStyle(true, false, lightColors)).not.toHaveProperty("borderBottomWidth")
    expect(rowStyle(false, false, lightColors).borderBottomWidth).toBe(1)
    expect(listSeparatorStyle(lightColors)).toMatchObject({ height: 1, marginLeft: 16 })
  })

  it("separator insets start at the text: 16 plain, 52 after an icon, 84 after a thumb", () => {
    expect(separatorInsets).toEqual({ none: 16, icon: 52, thumb: 84 })
    expect(listSeparatorStyle(lightColors, "none").marginLeft).toBe(16)
    expect(listSeparatorStyle(lightColors, "icon").marginLeft).toBe(52)
    expect(listSeparatorStyle(lightColors, "thumb").marginLeft).toBe(84)
  })

  it("thumb rows are 64 high with 4 px vertical padding; plain rows stay 52 / 8", () => {
    const thumb = rowStyle(true, false, lightColors, true)
    expect(THUMB_ROW_MIN_HEIGHT).toBe(64)
    expect(thumb).toMatchObject({ minHeight: 64, paddingVertical: 4 })
    expect(rowStyle(true, false, lightColors, false)).toMatchObject({
      minHeight: 52,
      paddingVertical: 8,
    })
    expect(rowStyle(true, false, lightColors)).toEqual(rowStyle(true, false, lightColors, false))
  })

  it("pressed tint differs from the group surface", () => {
    expect(rowPressedBackground(true, lightColors)).toBe(lightColors.surfaceRaised)
    expect(rowPressedBackground(false, lightColors)).toBe(lightColors.surface)
  })

  it("danger rows press to surfaceRaised even outside a group", () => {
    expect(rowPressedBackground(false, lightColors, "danger")).toBe(lightColors.surfaceRaised)
    expect(rowPressedBackground(true, lightColors, "danger")).toBe(lightColors.surfaceRaised)
    expect(rowPressedBackground(false, lightColors, "default")).toBe(lightColors.surface)
  })

  it("tones: danger colours the title and glyph, default keeps the muted glyph", () => {
    expect(rowTones.danger).toEqual({ title: "danger", icon: "danger" })
    expect(rowTones.default).toEqual({ title: "default", icon: "textMuted" })
  })

  it("danger rows keep a transparent background (no filled slab), even pressed", () => {
    // The row background takes no tone: a danger row is transparent at rest …
    expect(rowBackground(false, lightColors)).toBe("transparent")
    expect(rowStyle(false, false, lightColors).backgroundColor).toBe("transparent")
    // … and its tone-dependent press tint is a neutral raise, never a danger fill.
    const pressed = rowPressedBackground(false, darkColors, "danger")
    expect(pressed).toBe(darkColors.surfaceRaised)
    expect([darkColors.danger, darkColors.dangerSoft]).not.toContain(pressed)
  })

  it("stepper caption names label and unit once: 'Weight · kg', 'Reps'", () => {
    expect(stepperCaption("Weight", "kg")).toBe("Weight · kg")
    expect(stepperCaption("Reps", "reps")).toBe("Reps")
  })

  it("web numeral keeps 72 px from 375 up and scales linearly below", () => {
    expect(numeralScale(390)).toBe(1)
    expect(numeralScale(375)).toBe(1)
    expect(numeralScale(300)).toBeCloseTo(0.8)
    expect(numeralScale(-1)).toBe(0)
  })

  it("title variant defaults to headline", () => {
    expect(ROW_TITLE_VARIANT).toBe("headline")
  })

  it("disabled rows and steppers share one opacity", () => {
    expect(DISABLED_OPACITY).toBe(0.4)
  })

  it("chevron is a 20 px muted glyph", () => {
    expect(rowChevron).toEqual({ glyph: 20, color: "textMuted" })
  })

  it("discs: done success/bg, now accent/onAccent, todo 1.5 border outline", () => {
    expect(discStyle("done", lightColors)).toMatchObject({
      container: { width: 24, height: 24, backgroundColor: lightColors.success },
      foreground: "bg",
    })
    expect(discStyle("now", darkColors)).toMatchObject({
      container: { backgroundColor: darkColors.accent },
      foreground: "onAccent",
    })
    expect(discStyle("todo", lightColors)).toMatchObject({
      container: { borderWidth: 1.5, borderColor: lightColors.border },
      foreground: "textMuted",
    })
    expect(discStyle("todo", lightColors).container).not.toHaveProperty("backgroundColor")
  })
})

describe("ToggleChip and StatusPill", () => {
  it("chip is 32 tall with a 1 px border", () => {
    expect(chipStyle(false, "light", lightColors)).toMatchObject({ height: 32, borderWidth: 1 })
  })

  it("on: text/bg in light, accent/onAccent in dark; off: outline only", () => {
    expect(chipColors(true, "light", lightColors)).toEqual({
      background: lightColors.text,
      border: lightColors.text,
      foreground: lightColors.bg,
    })
    expect(chipColors(true, "dark", darkColors)).toEqual({
      background: darkColors.accent,
      border: darkColors.accent,
      foreground: darkColors.onAccent,
    })
    expect(chipColors(false, "dark", darkColors)).toEqual({
      background: "transparent",
      border: darkColors.border,
      foreground: darkColors.text,
    })
  })

  it("pills are tone text on surface", () => {
    expect(pillForeground).toEqual({
      neutral: "textMuted",
      accent: "accent",
      success: "success",
      danger: "danger",
    })
  })
})

describe("Progress marks", () => {
  it("ring sizes 20/3 and 44/4", () => {
    expect(ringSizes).toEqual({ sm: { size: 20, stroke: 3 }, md: { size: 44, stroke: 4 } })
  })

  it("ring geometry clamps progress", () => {
    const half = ringGeometry(44, 4, 0.5)
    expect(half.r).toBe(20)
    expect(half.dashOffset).toBeCloseTo(half.circumference / 2)
    expect(ringGeometry(44, 4, 2).dashOffset).toBe(0)
    expect(ringGeometry(44, 4, Number.NaN).dashOffset).toBeCloseTo(
      ringGeometry(44, 4, 0).circumference,
    )
  })

  it("segment fills: first n on, clamped", () => {
    expect(segmentFills(6, 2)).toEqual([true, true, false, false, false, false])
    expect(segmentFills(3, 9)).toEqual([true, true, true])
    expect(segmentFills(2, -1)).toEqual([false, false])
    expect(segmentFills(-2, 1)).toEqual([])
  })

  it("set dots: done, then one now, then todo; all done when complete", () => {
    expect(setDotStates(4, 1)).toEqual(["done", "now", "todo", "todo"])
    expect(setDotStates(2, 2)).toEqual(["done", "done"])
    expect(setDotStates(3, 0)).toEqual(["now", "todo", "todo"])
  })

  it("set dots are 8 px, the current one 16 wide", () => {
    expect(setDotStyle("now", lightColors)).toMatchObject({
      width: 16,
      height: 8,
      backgroundColor: lightColors.accent,
    })
    expect(setDotStyle("done", lightColors)).toMatchObject({
      width: 8,
      backgroundColor: lightColors.success,
    })
    expect(setDotStyle("todo", darkColors).backgroundColor).toBe(darkColors.border)
  })

  it("set pills are 10 x 6 radius 3, the current one 16 wide accent", () => {
    expect(setPillStyle("now", lightColors)).toEqual({
      width: 16,
      height: 6,
      borderRadius: 3,
      backgroundColor: lightColors.accent,
    })
    expect(setPillStyle("done", lightColors)).toEqual({
      width: 10,
      height: 6,
      borderRadius: 3,
      backgroundColor: lightColors.textMuted,
    })
    expect(setPillStyle("todo", darkColors)).toEqual({
      width: 10,
      height: 6,
      borderRadius: 3,
      backgroundColor: darkColors.border,
    })
  })

  it("ring spec: preset by default, stroke and diameter override independently", () => {
    expect(ringSpec("sm")).toEqual({ size: 20, stroke: 3 })
    expect(ringSpec("md")).toEqual({ size: 44, stroke: 4 })
    expect(ringSpec("sm", { stroke: 5 })).toEqual({ size: 20, stroke: 5 })
    expect(ringSpec("md", { diameter: 220 })).toEqual({ size: 220, stroke: 4 })
    expect(ringSpec("md", { diameter: 220, stroke: 10 })).toEqual({ size: 220, stroke: 10 })
    expect(ringSpec("md", { stroke: undefined, diameter: undefined })).toEqual({
      size: 44,
      stroke: 4,
    })
  })
})

describe("SegmentedControl", () => {
  it("inset aligns with the 16 px card text edge", () => {
    expect(segmentedInset(true)).toEqual({ marginHorizontal: 16 })
    expect(segmentedInset(false)).toEqual({})
  })
})

describe("StatRow", () => {
  it("splits the inner width into equal slots with 16 gaps", () => {
    expect(STAT_GAP).toBe(16)
    expect(statSlotWidth(358, 3)).toBeCloseTo(108.67, 1) // the spec rounds to 108
    expect(statSlotWidth(632, 3)).toBe(200)
    expect(statSlotWidth(532, 3)).toBeCloseTo(166.67, 1)
  })

  it("handles the boundaries: one slot is the full width, none or a tiny width is 0", () => {
    expect(statSlotWidth(358, 1)).toBe(358)
    expect(statSlotWidth(358, 0)).toBe(0)
    expect(statSlotWidth(10, 3)).toBe(0)
  })
})
