import { Array as Arr } from "effect"
import { type Href, Link, usePathname } from "expo-router"
import type { ReactNode } from "react"
import { Pressable, type StyleProp, View, type ViewStyle } from "react-native"
import { useBreakpoint } from "../hooks/useLayoutMode"
import { APP_NAV, isActivePath } from "./appNav"
import { usePressableInteraction } from "./interaction"
import { Text } from "./Text"
import { useTheme } from "./theme"
import { gutter, radius, sizes, space } from "./tokens"

export interface AppBarNavItem {
  readonly href: Href
  readonly label: string
  readonly active: boolean
}

export interface AppBarProps {
  readonly title: string
  readonly subtitle?: string
  readonly leading?: ReactNode
  readonly trailing?: ReactNode
  /**
   * Top-level links, rendered only at `desktop` (where the tab bar is hidden). Omit to get the
   * app's five destinations (`APP_NAV`) with the active one taken from the current path.
   */
  readonly nav?: ReadonlyArray<AppBarNavItem>
  readonly style?: StyleProp<ViewStyle>
}

function NavLink({ item }: { readonly item: AppBarNavItem }) {
  const { colors } = useTheme()
  const { hovered, handlers, focusStyle } = usePressableInteraction()
  return (
    <Link href={item.href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: item.active }}
        {...handlers}
        // One object, not an array: `Link asChild` rejects array styles on its child (Slot shim).
        style={{
          minHeight: sizes.tap,
          justifyContent: "center",
          paddingHorizontal: space.md,
          borderRadius: radius.sm,
          backgroundColor: item.active
            ? colors.accentSoft
            : hovered
              ? colors.surface
              : "transparent",
          ...focusStyle,
        }}
      >
        <Text variant="subhead" tone={item.active ? "accent" : "muted"}>
          {item.label}
        </Text>
      </Pressable>
    </Link>
  )
}

/** Screen title row (56 high); at desktop it also carries the nav links. */
export function AppBar({ title, subtitle, leading, trailing, nav, style }: AppBarProps) {
  const breakpoint = useBreakpoint()
  const pathname = usePathname()
  const showNav = breakpoint === "desktop"
  const items: ReadonlyArray<AppBarNavItem> =
    nav ??
    Arr.map(APP_NAV, (link) => ({
      href: link.href,
      label: link.label,
      active: typeof link.href === "string" && isActivePath(pathname, link.href),
    }))
  return (
    <View
      style={[
        {
          minHeight: sizes.controlLg,
          flexDirection: "row",
          alignItems: "center",
          gap: space.md,
          paddingHorizontal: gutter[breakpoint],
          paddingVertical: space.sm,
        },
        style,
      ]}
    >
      {leading}
      <View style={showNav ? { flexShrink: 0 } : { flex: 1 }}>
        <Text variant="title" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {subtitle === undefined ? null : (
          <Text variant="subhead" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {showNav ? (
        <View
          role="navigation"
          accessibilityLabel="Main"
          style={{ flex: 1, flexDirection: "row", gap: space.xs, marginLeft: space.lg }}
        >
          {Arr.map(items, (item) => (
            <NavLink key={item.label} item={item} />
          ))}
        </View>
      ) : null}
      {trailing}
    </View>
  )
}
