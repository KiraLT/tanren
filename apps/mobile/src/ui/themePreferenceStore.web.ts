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

/**
 * Web: persist the preference and mark it on `<html data-theme>`, the attribute `public/index.html`
 * sets before mount, so the document background (overscroll, the next route's first paint) follows
 * an in-app switch without a reload. Same rule as that script: "light" | "dark" set it, "system"
 * removes it (the `prefers-color-scheme` media query decides). A blocked storage keeps the choice
 * for this page only (state still holds it); the attribute is set either way.
 */
export const saveThemePreference = (next: ThemePreference): void => {
  try {
    const root = globalThis.document?.documentElement
    if (next === "system") {
      root?.removeAttribute("data-theme")
    } else {
      root?.setAttribute("data-theme", next)
    }
  } catch {
    // No DOM (SSR, tests without a document): nothing to mark.
  }
  try {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    // Storage unavailable (private mode, quota): the in-memory provider state still applies.
  }
}
