import { Array as Arr } from "effect"
import { type Href, Link } from "expo-router"
import type { ReactNode } from "react"
import { type StyleProp, View, type ViewStyle } from "react-native"
import { useBreakpoint } from "../hooks/useLayoutMode"
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
  /** Top-level links, rendered only at `desktop` (where the tab bar is hidden). */
  readonly nav?: ReadonlyArray<AppBarNavItem>
  readonly style?: StyleProp<ViewStyle>
}

function NavLink({ item }: { readonly item: AppBarNavItem }) {
  const { colors } = useTheme()
  return (
    <Link
      href={item.href}
      accessibilityRole="link"
      accessibilityState={{ selected: item.active }}
      style={{
        minHeight: sizes.tap,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderRadius: radius.sm,
        backgroundColor: item.active ? colors.accentSoft : "transparent",
      }}
    >
      <Text variant="subhead" tone={item.active ? "accent" : "muted"}>
        {item.label}
      </Text>
    </Link>
  )
}

/** Screen title row (56 high); at desktop it also carries the `nav` links. */
export function AppBar({ title, subtitle, leading, trailing, nav, style }: AppBarProps) {
  const breakpoint = useBreakpoint()
  const showNav = breakpoint === "desktop" && nav !== undefined
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
      <View style={{ flex: showNav ? 0 : 1 }}>
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
        <View role="navigation" style={{ flex: 1, flexDirection: "row", gap: space.xs }}>
          {Arr.map(nav, (item) => (
            <NavLink key={item.label} item={item} />
          ))}
        </View>
      ) : null}
      {trailing}
    </View>
  )
}
