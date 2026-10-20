import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { useSync } from "../src/hooks/useSync"
import { ThemeProvider, useTheme } from "../src/ui"

/** Light content on the dark scheme and vice versa; must render inside `ThemeProvider`. */
function ThemedStatusBar() {
  const { scheme } = useTheme()
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />
}

export default function RootLayout() {
  useSync()
  return (
    <ThemeProvider>
      <ThemedStatusBar />
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  )
}
