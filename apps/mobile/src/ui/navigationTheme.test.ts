import type { Theme as NavigationTheme } from "expo-router"
import { describe, expect, it } from "vitest"
import { navigationTheme } from "./navigationTheme"
import { themeFor } from "./theme"

const font = { fontFamily: "System", fontWeight: "400" } as const
/** Stands in for expo-router's `DefaultTheme`: light-grey background, white card. */
const base: NavigationTheme = {
  dark: false,
  colors: {
    primary: "rgb(0, 122, 255)",
    background: "rgb(242, 242, 242)",
    card: "rgb(255, 255, 255)",
    text: "rgb(28, 28, 30)",
    border: "rgb(216, 216, 216)",
    notification: "rgb(255, 59, 48)",
  },
  fonts: { regular: font, medium: font, bold: font, heavy: font },
}

describe("navigationTheme", () => {
  it("paints the navigator background and card with the dark Forge bg", () => {
    const result = navigationTheme(themeFor("dark", false), base)
    expect(result.dark).toBe(true)
    expect(result.colors.background).toBe("#0F1113")
    expect(result.colors.card).toBe("#0F1113")
    expect(result.colors.text).toBe("#F2F3F5")
  })

  it("paints them white in the light scheme and keeps the base fonts", () => {
    const result = navigationTheme(themeFor("light", false), base)
    expect(result.dark).toBe(false)
    expect(result.colors.background).toBe("#FFFFFF")
    expect(result.colors.card).toBe("#FFFFFF")
    expect(result.fonts).toBe(base.fonts)
  })
})
