import { Tabs } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  Icon,
  type IconName,
  sizes,
  space,
  stroke,
  type,
  useBreakpoint,
  useTheme,
} from "../../src/ui"

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

/** Bar height without the safe-area inset: 24 px icon, 16 px caption, item padding, `space.sm` air. */
const TAB_BAR_CONTENT = sizes.controlLg + space.sm

export default function TabsLayout() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
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
              // The default 49 px bar squeezes the caption to 13 px (overflow hidden clips the
              // descenders on web): size the content for icon + caption, then add the
              // home-indicator inset on top (0 on web).
              height: TAB_BAR_CONTENT + insets.bottom,
              paddingTop: space.xs,
              paddingBottom: insets.bottom,
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
