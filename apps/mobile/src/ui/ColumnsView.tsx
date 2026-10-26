import type { ReactNode } from "react"
import { type StyleProp, useWindowDimensions, View, type ViewStyle } from "react-native"
import { type ColumnSplit, type ColumnWidths, columnsFor } from "./columns"
import { space } from "./tokens"

/** Column widths for the current window and split (`columnsFor` over `useWindowDimensions`). */
export const useColumns = (split?: ColumnSplit): ColumnWidths =>
  columnsFor(useWindowDimensions().width, split)

export interface ColumnsProps {
  readonly main: ReactNode
  readonly side: ReactNode
  /** Default "7/5". */
  readonly split?: ColumnSplit
  /** Below desktop: render both stacked in this order (default "main-then-side"). */
  readonly stack?: "main-then-side" | "side-then-main"
  readonly style?: StyleProp<ViewStyle>
}

/** Flex grow per split; `flexBasis: 0` keeps the proportion independent of the content. */
const FLEX: { readonly [S in ColumnSplit]: readonly [number, number] } = {
  "7/5": [7, 5],
  "6/6": [6, 6],
  "5/7": [5, 7],
}

/**
 * In-content two-column row: at desktop main and side sit side by side in the split's proportion,
 * below desktop they stack with `space.xl` between them (`stack` picks the order).
 * File is `ColumnsView.tsx`, not `Columns.tsx`: on case-insensitive macOS that collides with
 * `columns.ts` (TS1261/TS1149).
 */
export function Columns({
  main,
  side,
  split = "7/5",
  stack = "main-then-side",
  style,
}: ColumnsProps) {
  const { breakpoint } = useColumns(split)
  const [mainFlex, sideFlex] = FLEX[split]
  if (breakpoint !== "desktop") {
    return (
      <View style={[{ gap: space.xl }, style]}>
        {stack === "main-then-side" ? (
          <>
            {main}
            {side}
          </>
        ) : (
          <>
            {side}
            {main}
          </>
        )}
      </View>
    )
  }
  return (
    <View style={[{ flexDirection: "row", gap: space.xl, alignItems: "flex-start" }, style]}>
      <View testID="columns-main" style={{ flexGrow: mainFlex, flexShrink: 1, flexBasis: 0 }}>
        {main}
      </View>
      <View testID="columns-side" style={{ flexGrow: sideFlex, flexShrink: 1, flexBasis: 0 }}>
        {side}
      </View>
    </View>
  )
}
