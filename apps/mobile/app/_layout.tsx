import { useFonts } from "expo-font"
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
  Redirect,
  SplashScreen,
  Stack,
  usePathname,
} from "expo-router"
import { StatusBar } from "expo-status-bar"
import { type ReactNode, useEffect } from "react"
import { Platform, View, type ViewStyle } from "react-native"
import { Landing } from "../src/components/landing/Landing"
import { useAuthGate } from "../src/hooks/useAuthGate"
import { useSync } from "../src/hooks/useSync"
import { ThemeProvider, useTheme } from "../src/ui"
import { navigationTheme } from "../src/ui/navigationTheme"
import { fonts } from "../src/ui/tokens"

// Hold the native splash until the display face is ready (released in `RootLayout`). Web has no
// splash: the promise resolves to a no-op there. A failure only means the splash hides on its own.
SplashScreen.preventAutoHideAsync().catch(() => undefined)

/**
 * The bundled Barlow Condensed faces, keyed by the family names `type` uses. expo-font registers
 * each key as the family on native and injects an `@font-face` with that name on web. `weight` only
 * reaches the web `@font-face`: without it the face is declared 400 and the browser fakes bold on
 * top of the 800 weight the display variants in `type` carry.
 */
const FONT_MAP = {
  [fonts.display]: { uri: require("../assets/fonts/BarlowCondensed-ExtraBold.ttf"), weight: 800 },
  [fonts.displayBold]: { uri: require("../assets/fonts/BarlowCondensed-Bold.ttf"), weight: 700 },
}

/** Light content on the dark scheme and vice versa; must render inside `ThemeProvider`. */
function ThemedStatusBar() {
  const { scheme } = useTheme()
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />
}

/**
 * Every navigator container (Stack content, Tabs scene, modal card) paints the Forge `bg`, so a
 * route change never shows React Navigation's light default between screens (HOTFIX-1); must render
 * inside `ThemeProvider`, which resolves the app scheme (the stored preference, not only the OS).
 */
function ForgeNavigationTheme({ children }: { readonly children: ReactNode }) {
  const theme = useTheme()
  const value = navigationTheme(theme, theme.scheme === "dark" ? DarkTheme : DefaultTheme)
  return <NavigationThemeProvider value={value}>{children}</NavigationThemeProvider>
}

export default function RootLayout() {
  useSync()
  const [fontsLoaded, fontError] = useFonts(FONT_MAP)
  const pathname = usePathname()
  // Same helper on web and native (ADR-0019): no account and no local sets shows only sign-in.
  const gate = useAuthGate(pathname)
  // A failed load still renders: `type` keeps the 800 weight, so the system face stands in heavy.
  const ready = (fontsLoaded || fontError !== null) && gate !== "loading"
  useEffect(() => {
    if (ready) {
      SplashScreen.hide()
    }
  }, [ready])
  if (!ready) {
    return null
  }
  return (
    <ThemeProvider>
      <ThemedStatusBar />
      {/* The navigator must stay mounted for the redirect and the landing's `router.replace`; while
          gated it is `display: none`, so it neither shows nor takes height (ADR-0021). */}
      <View style={gate === "allow" ? visible : hidden}>
        <ForgeNavigationTheme>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="health/add" options={{ presentation: "modal" }} />
          </Stack>
        </ForgeNavigationTheme>
      </View>
      {gate === "sign-in" ? (
        // Web shows strangers the landing on every gated route; native keeps the sign-in screen.
        Platform.OS === "web" ? (
          <Landing />
        ) : (
          <Redirect href="/sign-in" />
        )
      ) : null}
    </ThemeProvider>
  )
}

const visible: ViewStyle = { flex: 1 }
const hidden: ViewStyle = { flex: 1, display: "none" }
