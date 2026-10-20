import type { ReactNode } from "react"
import { ScrollView, type StyleProp, View, type ViewStyle } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useBreakpoint } from "../hooks/useLayoutMode"
import { useTheme } from "./theme"
import { gutter, sizes, space, stroke } from "./tokens"

export interface PageProps {
  readonly children: ReactNode
  /** Second column, rendered only at `desktop` (>= 900 px); phones show the same content inline. */
  readonly aside?: ReactNode
  readonly scroll?: boolean
  readonly padded?: boolean
  /** Rendered above the content, spanning the page column (usually an `AppBar`). */
  readonly header?: ReactNode
  readonly style?: StyleProp<ViewStyle>
}

/** Gap between the main column and the aside at desktop. */
const ASIDE_GAP = space.xl

/**
 * Full-bleed `bg` screen (it also covers the web `<body>`), a centred column capped at
 * `contentMaxWidth`, and at desktop a fixed 560 main column plus an aside (replaces `Screen`).
 */
export function Page({ children, aside, scroll = false, padded = true, header, style }: PageProps) {
  const { colors } = useTheme()
  const breakpoint = useBreakpoint()
  const twoColumn = breakpoint === "desktop" && aside !== undefined
  const padding: ViewStyle = padded ? { paddingHorizontal: gutter[breakpoint] } : {}
  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[padding, { paddingVertical: space.lg, gap: space.lg }]}
      contentInsetAdjustmentBehavior="automatic"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padding]}>{children}</View>
  )
  return (
    <SafeAreaView
      edges={["top"]}
      style={[{ flex: 1, backgroundColor: colors.bg, alignItems: "center" }, style]}
    >
      <View
        style={{
          flex: 1,
          width: "100%",
          maxWidth: twoColumn
            ? sizes.contentMaxWidth + ASIDE_GAP + sizes.asideMaxWidth
            : sizes.contentMaxWidth,
        }}
      >
        {header}
        {twoColumn ? (
          <View style={{ flex: 1, flexDirection: "row", gap: ASIDE_GAP }}>
            {/* Fixed width: the exercise pager pages are exactly `contentMaxWidth` wide. */}
            <View style={{ width: sizes.contentMaxWidth, flexShrink: 0 }}>{body}</View>
            <View
              role="complementary"
              style={{
                flex: 1,
                maxWidth: sizes.asideMaxWidth,
                borderLeftWidth: stroke.hairline,
                borderLeftColor: colors.border,
              }}
            >
              {aside}
            </View>
          </View>
        ) : (
          body
        )}
      </View>
    </SafeAreaView>
  )
}
