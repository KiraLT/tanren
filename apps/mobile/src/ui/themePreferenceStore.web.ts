import { parseThemePreference, type ThemePreference } from "./theme"

/** `localStorage` key holding "system" | "light" | "dark". */
export const THEME_STORAGE_KEY = "tanren.theme"

/** Web: read the stored preference; storage blocked or absent (private mode, SSR) → "system". */
export const loadThemePreference = (): ThemePreference => {
  try {
    return parseThemePreference(globalThis.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return "system"
  }
}

/** Web: persist the preference; a blocked storage keeps it for this page only (state still holds it). */
export const saveThemePreference = (next: ThemePreference): void => {
  try {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    // Storage unavailable (private mode, quota): the in-memory provider state still applies.
  }
}
