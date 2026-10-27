import { Array as Arr } from "effect"
import { type StyleProp, View, type ViewStyle } from "react-native"
import { STAT_GAP, STAT_GAP_DENSE, STAT_TILE_STACK_GAP, statTileStyle } from "./controls"
import { Text } from "./Text"
import { useTheme } from "./theme"
import { space } from "./tokens"

/** Gap of the `plain` variant: 12, so three slots in a 326 card are 100.67 each. */
const PLAIN_GAP = space.md

/** Line height of a `plain` value (the title2 line), kept for the smaller step too. */
const PLAIN_VALUE_LINE = 28

export interface StatItem {
  readonly label: string
  /** Already formatted, e.g. "0/5", "3:00", "4,110 kg". */
  readonly value: string
  /**
   * `plain` only: type step of the value, `title2` (default) or `headline` for a long value that
   * would truncate in a ~100 px slot. The value keeps the title2 28 px line, so captions align.
   */
  readonly valueVariant?: "title2" | "headline"
}

export interface StatRowProps {
  readonly items: ReadonlyArray<StatItem>
  /**
   * "bare" (default): caption over value, no box. "tile": each stat in a 72-high `surface` tile.
   * "plain": value over caption (a `title2` value, a muted `label` caption), no box, gap 12: the
   * activity card's three tiles (feed.md §3).
   */
  readonly variant?: "bare" | "tile" | "plain"
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
  if (variant === "plain") {
    return (
      <View style={[{ flexDirection: "row", gap: PLAIN_GAP }, style]}>
        {Arr.map(items, (item) => (
          <View key={item.label} style={{ flex: 1, flexBasis: 0, minWidth: 0 }}>
            <Text
              variant={item.valueVariant ?? "title2"}
              tabular
              numberOfLines={1}
              style={{ lineHeight: PLAIN_VALUE_LINE }}
            >
              {item.value}
            </Text>
            <Text variant="label" tone="muted" numberOfLines={1}>
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    )
  }
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
