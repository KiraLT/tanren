import { Array as Arr } from "effect"
import { type StyleProp, View, type ViewStyle } from "react-native"
import { STAT_GAP, STAT_GAP_DENSE, STAT_TILE_STACK_GAP, statTileStyle } from "./controls"
import { Text } from "./Text"
import { useTheme } from "./theme"

export interface StatItem {
  readonly label: string
  /** Already formatted, e.g. "0/5", "3:00", "4,110 kg". */
  readonly value: string
}

export interface StatRowProps {
  readonly items: ReadonlyArray<StatItem>
  /** "bare" (default): caption over value, no box. "tile": each stat in a 72-high `surface` tile. */
  readonly variant?: "bare" | "tile"
  /** `tile` only: "row" (default, equal widths, gap 16) or "column" (stacked full-width, gap 8). */
  readonly direction?: "row" | "column"
  /** `tile` row in a narrow block (~340): gap 8 and tile padding 12, so "10,000 kg" still fits. */
  readonly dense?: boolean
  readonly style?: StyleProp<ViewStyle>
}

/**
 * Equal-width stats in one row (ui-polish §3): a muted `caption` label over a tabular `headline`
 * value, gap 16. Three slots fit 358 (108 each) and 632 (200 each). `variant="tile"` boxes each
 * stat in a 72-high `surface` tile (desktop r3: Programs 3 x 166, Plan aside stacked).
 */
export function StatRow({
  items,
  variant = "bare",
  direction = "row",
  dense = false,
  style,
}: StatRowProps) {
  const { colors } = useTheme()
  const tile = variant === "tile"
  const stacked = tile && direction === "column"
  return (
    <View
      style={[
        stacked
          ? { gap: STAT_TILE_STACK_GAP }
          : { flexDirection: "row", gap: tile && dense ? STAT_GAP_DENSE : STAT_GAP },
        style,
      ]}
    >
      {Arr.map(items, (item) => (
        <View
          key={item.label}
          style={
            tile
              ? [statTileStyle(colors, dense), stacked ? {} : { flex: 1, flexBasis: 0 }]
              : { flex: 1, flexBasis: 0, gap: 2 }
          }
        >
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {item.label}
          </Text>
          <Text variant="headline" tabular numberOfLines={1}>
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  )
}
