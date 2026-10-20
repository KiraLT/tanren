import type { ThemePreference } from "./theme"

/**
 * Native: the preference lives in `ThemeProvider` state for the app session only (no storage
 * dependency in v2). `themePreferenceStore.web.ts` persists it in `localStorage` instead.
 */
export const loadThemePreference = (): ThemePreference => "system"

export const saveThemePreference = (_next: ThemePreference): void => undefined
