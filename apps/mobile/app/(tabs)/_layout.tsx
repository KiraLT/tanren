import { Tabs } from "expo-router"
import { Icon, type IconName, sizes, stroke, type, useBreakpoint, useTheme } from "../../src/ui"

interface TabSpec {
  readonly name: string
  readonly title: string
  readonly icon: IconName
}

// Final five routes (ADR-0014); other teams replace the route files, never this list.
const TABS: ReadonlyArray<TabSpec> = [
  { name: "today", title: "Today", icon: "timer" },
  { name: "plan", title: "Plan", icon: "calendar" },
  { name: "programs", title: "Programs", icon: "play" },
  { name: "library", title: "Library", icon: "grid" },
  { name: "progress", title: "Progress", icon: "chart" },
]

export default function TabsLayout() {
  const { colors } = useTheme()
  // At desktop the `AppBar` renders the nav links, so the bottom bar is hidden.
  const desktop = useBreakpoint() === "desktop"
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: type.caption,
        tabBarStyle: desktop
          ? { display: "none" }
          : {
              backgroundColor: colors.surfaceRaised,
              borderTopColor: colors.border,
              borderTopWidth: stroke.hairline,
            },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            // The navigator's `color` is a ColorValue; `Icon` takes a string, so derive it from the roles.
            tabBarIcon: ({ focused }) => (
              <Icon
                name={tab.icon}
                color={focused ? colors.accent : colors.textMuted}
                size={sizes.iconMd}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  )
}
