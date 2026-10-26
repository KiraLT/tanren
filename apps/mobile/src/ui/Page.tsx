import type { ReactNode } from "react"
import { ScrollView, type StyleProp, View, type ViewStyle } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useColumns } from "./ColumnsView"
import type { ColumnSplit } from "./columns"
import { useTheme } from "./theme"
import { gutter, sizes, space, stroke } from "./tokens"

export interface PageProps {
  readonly children: ReactNode
  /** Second column, rendered only at `desktop` (>= 900 px); phones show the same content inline. */
  readonly aside?: ReactNode
  /** Which share `aside` gets at desktop: "7/5" (default, main left), "5/7" (list left, detail right), "6/6". */
  readonly split?: ColumnSplit
  /** Desktop: the page column is `pageMaxWidth` even without `aside` (children use `<Columns>`). */
  readonly wide?: boolean
  readonly scroll?: boolean
  readonly padded?: boolean
  /** Rendered above the content, spanning the page column (usually an `AppBar`). */
  readonly header?: ReactNode
  readonly style?: StyleProp<ViewStyle>
}

/**
 * Full-bleed `bg` screen (it also covers the web `<body>`), a centred column capped at
 * `contentMaxWidth`, and at desktop (`columnsFor`) a `pageMaxWidth` page: main column plus `aside`
 * split by `split`, or one wide main body (`wide`, children lay out their own `<Columns>`).
 */
export function Page({
  children,
  aside,
  split = "7/5",
  wide = false,
  scroll = false,
  padded = true,
  header,
  style,
}: PageProps) {
  const { colors } = useTheme()
  const columns = useColumns(split)
  const breakpoint = columns.breakpoint
  const twoColumn = breakpoint === "desktop" && aside !== undefined
  const wideBody = breakpoint === "desktop" && wide && aside === undefined
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
          maxWidth: twoColumn || wideBody ? columns.page : sizes.contentMaxWidth,
        }}
      >
        {header}
        {twoColumn ? (
          <View style={{ flex: 1, flexDirection: "row", gap: columns.gap }}>
            {/* Fixed width: the exercise pager pages are exactly `columns.main` wide. */}
            <View role="main" style={{ width: columns.main, flexShrink: 0 }}>
              {body}
            </View>
            <View
              role="complementary"
              style={{
                flex: 1,
                borderLeftWidth: stroke.hairline,
                borderLeftColor: colors.border,
              }}
            >
              {/* Pinned by construction (ui-polish D2, verified at 1280x800 and 900x800): the page
                  is viewport-high and only the main body scrolls, so this column's top stays at
                  the same y while main scrolls and no `position: sticky` is needed. An aside taller
                  than the viewport scrolls in its own ScrollView, which the screen supplies
                  (Today, Plan, Programs, Library detail already do). */}
              {aside}
            </View>
          </View>
        ) : wideBody ? (
          <View role="main" style={{ flex: 1 }}>
            {body}
          </View>
        ) : (
          <View role="main" style={{ flex: 1 }}>
            {body}
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}
