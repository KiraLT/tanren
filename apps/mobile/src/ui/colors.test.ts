import { Array as Arr } from "effect"
import { describe, expect, it } from "vitest"
import { type ColorRoles, darkColors, lightColors } from "./colors"

/** WCAG 2.x relative luminance of a `#RRGGBB` colour. */
const luminance = (hex: string): number => {
  const channel = (offset: number): number => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** WCAG contrast ratio between two `#RRGGBB` colours (1..21). */
const contrast = (a: string, b: string): number => {
  const [hi, lo] = Arr.sort([luminance(a), luminance(b)], (x: number, y: number) =>
    x > y ? -1 : x < y ? 1 : 0,
  )
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

/** Every role `Text` can render as a foreground (`tone` default|muted|accent|success|danger). */
const TEXT_ROLES = ["text", "textMuted", "accent", "success", "danger"] as const
/** Page, cards/grouped lists, sheets/popovers (ui-direction-final §2). */
const BACKGROUNDS = ["bg", "surface", "surfaceRaised"] as const
const PALETTES: ReadonlyArray<readonly [string, ColorRoles]> = [
  ["light", lightColors],
  ["dark", darkColors],
]

const rows = Arr.flatMap(PALETTES, ([scheme, colors]) => [
  ...Arr.flatMap(TEXT_ROLES, (fg) =>
    Arr.map(BACKGROUNDS, (bg) => ({
      scheme,
      pair: `${fg} on ${bg}`,
      ratio: contrast(colors[fg], colors[bg]),
    })),
  ),
  { scheme, pair: "onAccent on accent", ratio: contrast(colors.onAccent, colors.accent) },
  { scheme, pair: "bg on success (done disc)", ratio: contrast(colors.bg, colors.success) },
  { scheme, pair: "bg on text (on-chip label)", ratio: contrast(colors.bg, colors.text) },
])

describe("colour contrast (ui-direction-final §2)", () => {
  it.each(rows)("$scheme: $pair is at least 4.5:1", ({ ratio }) => {
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  it("both palettes define the same roles", () => {
    expect(Object.keys(darkColors)).toEqual(Object.keys(lightColors))
  })

  // The spec quotes 5.9:1 / 5.4:1; WCAG gives 6.33 / 5.86 for these hexes, so assert the floor.
  it("light muted text keeps at least the spec's 5.9:1 on bg and 5.4:1 on surface", () => {
    expect(contrast(lightColors.textMuted, lightColors.bg)).toBeGreaterThanOrEqual(5.9)
    expect(contrast(lightColors.textMuted, lightColors.surface)).toBeGreaterThanOrEqual(5.4)
  })

  it("the dark amber accent carries near-black text at about 10:1", () => {
    expect(contrast(darkColors.onAccent, darkColors.accent)).toBeGreaterThanOrEqual(10)
  })

  it("only dark glows: light glow is transparent, dark glow is a translucent amber", () => {
    expect(lightColors.glow).toBe("transparent")
    expect(darkColors.glow).toBe("rgba(255,176,32,0.35)")
  })
})
