import { useFonts } from "expo-font"
import { Redirect, SplashScreen, Stack, usePathname } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { useEffect } from "react"
import { View, type ViewStyle } from "react-native"
import { useAuthGate } from "../src/hooks/useAuthGate"
import { useSync } from "../src/hooks/useSync"
import { ThemeProvider, useTheme } from "../src/ui"
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
      {/* The navigator must be mounted for a redirect; it stays invisible until the gate lifts. */}
      <View style={gate === "allow" ? visible : hidden}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
      {gate === "sign-in" ? <Redirect href="/sign-in" /> : null}
    </ThemeProvider>
  )
}

const visible: ViewStyle = { flex: 1 }
const hidden: ViewStyle = { flex: 1, opacity: 0 }
