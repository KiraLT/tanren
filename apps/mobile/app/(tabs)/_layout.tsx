import { Tabs } from "expo-router"

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="today" options={{ title: "Today" }} />
      <Tabs.Screen name="plan" options={{ title: "Plan" }} />
    </Tabs>
  )
}
