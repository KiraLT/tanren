import type { ReactNode } from "react"
import { StyleSheet, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useLayoutMode } from "../hooks/useLayoutMode"
import { colors, sizes, space } from "./theme"

/** The aside column never grows past this; the gap to the main column is `space.lg` (24). */
const ASIDE_MAX_WIDTH = 480

interface ScreenProps {
  readonly children: ReactNode
  /**
   * Second column, shown only in the two-column layout (window >= `WIDE_BREAKPOINT`). At phone
   * width it is not rendered: each screen already shows the same content in its main column.
   */
  readonly aside?: ReactNode
}

/** Dark full-bleed screen with a centred, width-capped column, plus an aside column when wide. */
export function Screen({ children, aside }: ScreenProps) {
  const mode = useLayoutMode()
  if (mode === "two-column" && aside !== undefined) {
    return (
      <SafeAreaView edges={["top"]} style={styles.root}>
        <View style={styles.row}>
          <View style={styles.primary}>{children}</View>
          <View style={styles.aside} role="complementary">
            {aside}
          </View>
        </View>
      </SafeAreaView>
    )
  }
  return (
    <SafeAreaView edges={["top"]} style={styles.root}>
      <View style={styles.column}>{children}</View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, alignItems: "center" },
  column: { flex: 1, width: "100%", maxWidth: sizes.contentMaxWidth },
  row: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: space.lg,
    width: "100%",
    maxWidth: sizes.contentMaxWidth + space.lg + ASIDE_MAX_WIDTH,
  },
  // Fixed width: the exercise pager pages are exactly `contentMaxWidth` wide.
  primary: { width: sizes.contentMaxWidth, flexShrink: 0 },
  aside: {
    flex: 1,
    maxWidth: ASIDE_MAX_WIDTH,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
})
