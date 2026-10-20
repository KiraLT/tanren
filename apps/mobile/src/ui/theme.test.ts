import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { darkColors, lightColors } from "./colors"
import {
  defaultTheme,
  parseThemePreference,
  resolveScheme,
  type Theme,
  ThemeContext,
  themeFor,
  useTheme,
  useThemePreference,
} from "./theme"
import { statusTone } from "./tokens"

/** Renders a component that calls `useTheme()` and returns what it saw. */
const themeSeen = (wrap?: Theme): string => {
  const Probe = () => {
    const theme = useTheme()
    return `${theme.scheme}|${theme.colors.bg}|${String(theme.reducedMotion)}`
  }
  const probe = createElement(Probe)
  return renderToStaticMarkup(
    wrap === undefined ? probe : createElement(ThemeContext, { value: wrap }, probe),
  )
}

describe("useTheme", () => {
  it("returns the light theme with motion on when no ThemeProvider is mounted", () => {
    expect(themeSeen()).toBe(`light|${lightColors.bg}|false`)
    expect(defaultTheme).toEqual({ scheme: "light", colors: lightColors, reducedMotion: false })
  })

  it("returns the provided theme inside the context", () => {
    expect(themeSeen(themeFor("dark", true))).toBe(`dark|${darkColors.bg}|true`)
  })
})

describe("useThemePreference", () => {
  it("is 'system' without a provider", () => {
    const Probe = () => useThemePreference().preference
    expect(renderToStaticMarkup(createElement(Probe))).toBe("system")
  })
})

describe("resolveScheme", () => {
  it("follows the device when the preference is system", () => {
    expect(resolveScheme({ override: undefined, preference: "system", device: "dark" })).toBe(
      "dark",
    )
    expect(resolveScheme({ override: undefined, preference: "system", device: "light" })).toBe(
      "light",
    )
  })

  it("falls back to light when the device reports null, undefined or unspecified", () => {
    expect(resolveScheme({ override: undefined, preference: "system", device: null })).toBe("light")
    expect(resolveScheme({ override: undefined, preference: "system", device: undefined })).toBe(
      "light",
    )
    expect(
      resolveScheme({ override: undefined, preference: "system", device: "unspecified" }),
    ).toBe("light")
  })

  it("lets an explicit light or dark preference override the device", () => {
    expect(resolveScheme({ override: undefined, preference: "light", device: "dark" })).toBe(
      "light",
    )
    expect(resolveScheme({ override: undefined, preference: "dark", device: "light" })).toBe("dark")
  })

  it("lets the scheme prop override both preference and device", () => {
    expect(resolveScheme({ override: "light", preference: "dark", device: "dark" })).toBe("light")
  })
})

describe("parseThemePreference", () => {
  it("keeps the three known values and reads anything else as system", () => {
    expect(parseThemePreference("light")).toBe("light")
    expect(parseThemePreference("dark")).toBe("dark")
    expect(parseThemePreference("system")).toBe("system")
    expect(parseThemePreference(null)).toBe("system")
    expect(parseThemePreference("purple")).toBe("system")
  })
})

describe("statusTone", () => {
  it("maps done, today, missed and upcoming to success, accent, danger and neutral", () => {
    expect(statusTone).toEqual({
      done: "success",
      today: "accent",
      missed: "danger",
      upcoming: "neutral",
    })
  })
})
