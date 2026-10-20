import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { useSync } from "../src/hooks/useSync"

export default function RootLayout() {
  useSync()
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  )
}
