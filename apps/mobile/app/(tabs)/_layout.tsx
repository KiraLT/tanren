import { Tabs } from "expo-router"
import { Platform } from "react-native"
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
              paddingTop: space.xs,
              ...(Platform.OS === "web"
                ? {
                    // `react-native-safe-area-context` reports 0 on web, so a home-screen PWA
                    // takes the home-indicator inset from CSS `env()` (non-zero only with
                    // `viewport-fit=cover` in public/index.html); RNW passes the string through.
                    height: `calc(${sizes.tabBar}px + env(safe-area-inset-bottom))`,
                    paddingBottom: "env(safe-area-inset-bottom)",
                  }
                : { height: sizes.tabBar + insets.bottom, paddingBottom: insets.bottom }),
              backgroundColor: colors.surfaceRaised,
              borderTopColor: colors.border,
              borderTopWidth: stroke.hairline,
            },
      }}
    >
      {/* The tab routes in `APP_NAV` and their glyphs (ADR-0014, ADR-0029, ui-direction-final §6). */}
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
