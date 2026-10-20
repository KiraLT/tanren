import { createContext, use } from "react"
import { type ColorRoles, darkColors, lightColors } from "./colors"

/**
 * The React-Native-free half of the theme (design §3): types, pure resolution and the contexts, so
 * node tests can exercise them. `ThemeProvider.tsx` adds the device hooks and re-exports these.
 */
export type Scheme = "light" | "dark"

export interface Theme {
  readonly scheme: Scheme
  readonly colors: ColorRoles
  readonly reducedMotion: boolean
}

/** The user's choice in Settings; "system" follows the device setting. */
export type ThemePreference = "system" | "light" | "dark"

export interface ThemePreferenceControl {
  readonly preference: ThemePreference
  readonly setPreference: (next: ThemePreference) => void
}

export const themeFor = (scheme: Scheme, reducedMotion: boolean): Theme => ({
  scheme,
  colors: scheme === "dark" ? darkColors : lightColors,
  reducedMotion,
})

/** Used without a provider (tests, isolated renders): light, motion on. */
export const defaultTheme: Theme = themeFor("light", false)

/** Anything but a known preference (absent, corrupt storage) reads as "system". */
export const parseThemePreference = (raw: unknown): ThemePreference =>
  raw === "light" || raw === "dark" ? raw : "system"

/**
 * Scheme = explicit override (tests/stories) ?? the preference, where "system" follows the device.
 * `device` is `useColorScheme()`: `null`/`undefined`/"unspecified" fall back to light.
 */
export const resolveScheme = (input: {
  readonly override: Scheme | undefined
  readonly preference: ThemePreference
  readonly device: string | null | undefined
}): Scheme => {
  if (input.override !== undefined) {
    return input.override
  }
  if (input.preference !== "system") {
    return input.preference
  }
  return input.device === "dark" ? "dark" : "light"
}

export const ThemeContext = createContext<Theme>(defaultTheme)

const noPreferenceProvider: ThemePreferenceControl = {
  preference: "system",
  setPreference: () => undefined,
}

export const ThemePreferenceContext = createContext<ThemePreferenceControl>(noPreferenceProvider)

/** The current theme; never fails: the light default when no `ThemeProvider` is mounted. */
export function useTheme(): Theme {
  return use(ThemeContext)
}

/** Read and change the theme preference (Settings). Without a provider: "system", no-op setter. */
export function useThemePreference(): ThemePreferenceControl {
  return use(ThemePreferenceContext)
}
