import { Array as Arr } from "effect"
import { type StyleProp, View, type ViewStyle } from "react-native"
import { segmentBar, segmentFills } from "./controls"
import { useTheme } from "./theme"

export interface SegmentBarProps {
  /** One segment per item (exercise). */
  readonly total: number
  /** The first `filled` segments are `accent`, the rest `border`. */
  readonly filled: number
  readonly accessibilityLabel: string
  /** Width defaults to 10 px per segment; segments share it. */
  readonly style?: StyleProp<ViewStyle>
}

/** The app-bar segment bar (§5): 4 px tall, 3 px gaps, rounded ends. */
export function SegmentBar({ total, filled, accessibilityLabel, style }: SegmentBarProps) {
  const { colors } = useTheme()
  const fills = segmentFills(total, filled)
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: fills.length, now: Arr.filter(fills, Boolean).length }}
      style={[{ flexDirection: "row", gap: segmentBar.gap, width: fills.length * 10 }, style]}
    >
      {Arr.map(fills, (on, index) => (
        <View
          key={`segment-${index}`}
          style={{
            flex: 1,
            height: segmentBar.height,
            borderRadius: segmentBar.radius,
            backgroundColor: on ? colors.accent : colors.border,
          }}
        />
      ))}
    </View>
  )
}
