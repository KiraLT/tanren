import { Array as Arr } from "effect"
import { Pressable, ScrollView, type StyleProp, View, type ViewStyle } from "react-native"
import { segmentedInset } from "./controls"
import { Text } from "./Text"
import { useTheme } from "./theme"
import { radius, sizes, space } from "./tokens"

export interface SegmentedControlOption {
  readonly value: string
  readonly label: string
}

export interface SegmentedControlProps {
  readonly options: ReadonlyArray<SegmentedControlOption>
  readonly value: string
  readonly onChange: (value: string) => void
  readonly accessibilityLabel: string
  /** Inside a card: 16 px side margins, so the control lines up with the card's text edge (§5). */
  readonly inset?: boolean
  readonly style?: StyleProp<ViewStyle>
}

/** More than this many options scroll horizontally instead of sharing the width. */
const MAX_FIXED_OPTIONS = 4

/** A tab-like switch; JS on every platform for web parity (no `@expo/ui`). */
export function SegmentedControl({
  options,
  value,
  onChange,
  accessibilityLabel,
  inset = false,
  style,
}: SegmentedControlProps) {
  const { colors } = useTheme()
  const scrolls = options.length > MAX_FIXED_OPTIONS
  const segments = Arr.map(options, (option) => {
    const selected = option.value === value
    return (
      <Pressable
        key={option.value}
        role="tab"
        aria-selected={selected}
        accessibilityLabel={option.label}
        accessibilityState={{ selected }}
        onPress={() => onChange(option.value)}
        style={({ pressed }) => [
          {
            minHeight: sizes.tap,
            paddingHorizontal: space.md,
            borderRadius: radius.sm,
            borderCurve: "continuous",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: selected ? colors.surfaceRaised : "transparent",
          },
          !scrolls && { flex: 1 },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text variant="subhead" tone={selected ? "default" : "muted"} numberOfLines={1}>
          {option.label}
        </Text>
      </Pressable>
    )
  })
  const container: ViewStyle = {
    flexDirection: "row",
    // Horizontal inset only: the 44 px segments already fill the height (hit area >= `sizes.tap`).
    paddingHorizontal: space.xs,
    gap: space.xs,
    borderRadius: radius.md,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
  }
  if (scrolls) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        accessibilityLabel={accessibilityLabel}
        style={[segmentedInset(inset), style]}
        contentContainerStyle={container}
      >
        {segments}
      </ScrollView>
    )
  }
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[container, segmentedInset(inset), style]}
    >
      {segments}
    </View>
  )
}
