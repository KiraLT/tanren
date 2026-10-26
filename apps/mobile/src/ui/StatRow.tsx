import { Array as Arr } from "effect"
import { type StyleProp, View, type ViewStyle } from "react-native"
import { STAT_GAP } from "./controls"
import { Text } from "./Text"

export interface StatItem {
  readonly label: string
  /** Already formatted, e.g. "0/5", "3:00", "4,110 kg". */
  readonly value: string
}

export interface StatRowProps {
  readonly items: ReadonlyArray<StatItem>
  readonly style?: StyleProp<ViewStyle>
}

/**
 * Equal-width stats in one row (ui-polish §3): a muted `caption` label over a tabular `headline`
 * value, gap 16. Three slots fit 358 (108 each) and 632 (200 each).
 */
export function StatRow({ items, style }: StatRowProps) {
  return (
    <View style={[{ flexDirection: "row", gap: STAT_GAP }, style]}>
      {Arr.map(items, (item) => (
        <View key={item.label} style={{ flex: 1, flexBasis: 0, gap: 2 }}>
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
