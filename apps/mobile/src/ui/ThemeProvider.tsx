import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import { AccessibilityInfo, StyleSheet, useColorScheme } from "react-native"
import {
  resolveScheme,
  type Scheme,
  type Theme,
  ThemeContext,
  type ThemePreference,
  ThemePreferenceContext,
  themeFor,
  useTheme,
} from "./theme"
import { loadThemePreference, saveThemePreference } from "./themePreferenceStore"

export {
  type Scheme,
  type Theme,
  type ThemePreference,
  type ThemePreferenceControl,
  useTheme,
  useThemePreference,
} from "./theme"

/** True while the OS "reduce motion" setting is on; follows changes (RN and RNW 0.21). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced, () => setReduced(false))
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced)
    return () => subscription.remove()
  }, [])
  return reduced
}

interface ThemeProviderProps {
  readonly children: ReactNode
  /** Test/story override; otherwise the preference (Settings), where "system" follows the device. */
  readonly scheme?: Scheme
}

/** Provides `useTheme()` and `useThemePreference()` to the tree (mounted once in `app/_layout`). */
export function ThemeProvider({ children, scheme }: ThemeProviderProps) {
  const device = useColorScheme()
  const reducedMotion = useReducedMotion()
  const [preference, setPreferenceState] = useState<ThemePreference>(loadThemePreference)
  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    saveThemePreference(next)
  }, [])
  const resolved = resolveScheme({ override: scheme, preference, device })
  const theme = useMemo(() => themeFor(resolved, reducedMotion), [resolved, reducedMotion])
  const control = useMemo(() => ({ preference, setPreference }), [preference, setPreference])
  return (
    <ThemePreferenceContext value={control}>
      <ThemeContext value={theme}>{children}</ThemeContext>
    </ThemePreferenceContext>
  )
}

type NamedStyles = Parameters<typeof StyleSheet.create>[0]

/**
 * Themed styles: `StyleSheet.create(factory(theme))`, rebuilt only when the theme changes. Pass a
 * module-level factory so the memo holds.
 */
export function useStyles<T extends NamedStyles>(factory: (theme: Theme) => T) {
  const theme = useTheme()
  return useMemo(() => StyleSheet.create(factory(theme)), [factory, theme])
}
