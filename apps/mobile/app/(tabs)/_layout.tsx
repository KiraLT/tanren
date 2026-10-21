import { Tabs } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { APP_NAV, Icon, sizes, space, stroke, type, useBreakpoint, useTheme } from "../../src/ui"

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
        tabBarLabelStyle: type.label,
        tabBarStyle: desktop
          ? { display: "none" }
          : {
              // 56 px of bar (24 px glyph + 12/16 label + air) plus the home-indicator inset
              // (0 on web); the default 49 px bar squeezed the label and clipped descenders.
              height: sizes.tabBar + insets.bottom,
              paddingTop: space.xs,
              paddingBottom: insets.bottom,
              backgroundColor: colors.surfaceRaised,
              borderTopColor: colors.border,
              borderTopWidth: stroke.hairline,
            },
      }}
    >
      {/* The five routes and their glyphs come from `APP_NAV` (ADR-0014, ui-direction-final §6). */}
      {APP_NAV.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.label,
            // The navigator's `color` is a ColorValue; `Icon` takes a string, so derive it from the roles.
            tabBarIcon: ({ focused }) => (
              <Icon
                name={tab.icon}
                color={focused ? colors.accent : colors.textMuted}
                size={sizes.iconMd}
                strokeWidth={focused ? stroke.icon : stroke.iconThin}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  )
}
