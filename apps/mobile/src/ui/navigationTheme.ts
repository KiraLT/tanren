import type { Theme as NavigationTheme } from "expo-router"
import type { Theme } from "./theme"

/**
 * The navigators' theme from the Forge theme. React Navigation paints every container behind our
 * screens (Stack content, Tabs scene, modal card) with `background`/`card`; its default light theme
 * (`rgb(242,242,242)` / white) flashed between routes in the dark scheme (HOTFIX-1). `base` is
 * `DefaultTheme` or `DarkTheme` from expo-router, which carries the font set.
 */
export const navigationTheme = (theme: Theme, base: NavigationTheme): NavigationTheme => ({
  ...base,
  dark: theme.scheme === "dark",
  colors: {
    primary: theme.colors.accent,
    background: theme.colors.bg,
    card: theme.colors.bg,
    text: theme.colors.text,
    border: theme.colors.border,
    notification: theme.colors.danger,
  },
})
