import { Array as Arr } from "effect"
import { type Href, Link, usePathname } from "expo-router"
import { createContext, type ReactNode, useContext } from "react"
import { Pressable, type StyleProp, View, type ViewStyle } from "react-native"
import { useBreakpoint } from "../hooks/useLayoutMode"
import { APP_NAV, isActivePath } from "./appNav"
import { APP_BAR_TITLE_SLOT, eyebrowRingState } from "./controls"
import { usePressableInteraction } from "./interaction"
import { Text } from "./Text"
import { TimerRing } from "./TimerRing"
import { useTheme } from "./theme"
import { gutter, radius, sizes, space, stroke } from "./tokens"

export interface AppBarNavItem {
  readonly href: Href
  readonly label: string
  readonly active: boolean
}

/** Small line above the title: an optional 20 px progress ring and a muted caption. */
export interface AppBarEyebrow {
  readonly label: string
  /** Fraction 0..1 for the ring; omit for text only. */
  readonly progress?: number
}

export interface AppBarProps {
  readonly title: string
  readonly subtitle?: string
  readonly eyebrow?: AppBarEyebrow
  readonly leading?: ReactNode
  /** Right slot: a counter + segment bar, or a 24 px `more` glyph. */
  readonly trailing?: ReactNode
  /**
   * Show the top-level links at `desktop` (where the tab bar is hidden): the tab routes in
   * `APP_NAV`, with the active one taken from the current path. Default true;
   * the player passes false.
   */
  readonly nav?: boolean
  /** Web heading level of the title (default 1); a page whose body carries the h1 passes 2. */
  readonly titleLevel?: 1 | 2
  readonly style?: StyleProp<ViewStyle>
}

/**
 * The desktop bar's trailing Start (navigation-v2.md §3), provided by `(tabs)/_layout.tsx` so this
 * primitive needs no store hook. Shown with the nav links, never on `/train` or `/home`.
 */
export const AppBarStartContext = createContext<ReactNode>(null)

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

/** Screen title row (56 min) with a hairline below; at desktop it also carries the nav links. */
export function AppBar({
  title,
  subtitle,
  eyebrow,
  leading,
  trailing,
  nav = true,
  titleLevel = 1,
  style,
}: AppBarProps) {
  const { colors } = useTheme()
  const breakpoint = useBreakpoint()
  const pathname = usePathname()
  const showNav = nav && breakpoint === "desktop"
  const start = useContext(AppBarStartContext)
  // One Start per screen (§4 rule 3): Train's bar and Home's Up-next card carry their own.
  const showStart = showNav && !isActivePath(pathname, "/train") && !isActivePath(pathname, "/home")
  const items: ReadonlyArray<AppBarNavItem> = Arr.map(APP_NAV, (link) => ({
    href: link.href,
    label: link.label,
    active: typeof link.href === "string" && isActivePath(pathname, link.href),
  }))
  // One line with the nav (the slot is fixed, the bar height must not vary by title); else 2.
  const eyebrowRing = eyebrowRingState(eyebrow?.progress)
  const titleBlock = (
    <View style={{ flex: 1 }}>
      {eyebrow === undefined ? null : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          {eyebrowRing === "none" ? null : eyebrowRing === "ring" ? (
            <TimerRing progress={eyebrow?.progress ?? 0} size={sizes.ringSm} />
          ) : (
            <View style={{ width: sizes.ringSm, height: sizes.ringSm }} />
          )}
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {eyebrow.label}
          </Text>
        </View>
      )}
      <Text variant="title" headingLevel={titleLevel} numberOfLines={showNav ? 1 : 2}>
        {title}
      </Text>
      {subtitle === undefined ? null : (
        <Text variant="subhead" tone="muted" numberOfLines={1}>
          {subtitle}
        </Text>
      )}
    </View>
  )
  return (
    <View
      testID="app-bar"
      style={[
        {
          minHeight: sizes.appBar,
          flexDirection: "row",
          alignItems: "center",
          gap: space.md,
          paddingHorizontal: gutter[breakpoint],
          paddingVertical: space.sm,
          borderBottomWidth: stroke.hairline,
          borderBottomColor: colors.border,
        },
        style,
      ]}
    >
      {showNav ? (
        <View
          style={{
            width: APP_BAR_TITLE_SLOT,
            flexShrink: 0,
            flexDirection: "row",
            alignItems: "center",
            gap: space.md,
          }}
        >
          {leading}
          {titleBlock}
        </View>
      ) : (
        <>
          {leading}
          {titleBlock}
        </>
      )}
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
      {showStart ? start : null}
      {trailing}
    </View>
  )
}
