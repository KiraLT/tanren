import { Pressable, type StyleProp, type ViewStyle } from "react-native"
import { Text } from "./Text"
import { useTheme } from "./theme"
import { radius, sizes, space, stroke } from "./tokens"

export interface ToggleChipProps {
  /** Visible text and accessibility label. */
  readonly label: string
  readonly selected: boolean
  readonly onPress: () => void
  /** Outer layout only (e.g. `alignSelf`); colours come from the theme. */
  readonly style?: StyleProp<ViewStyle>
}

/** A pill checkbox: accent outline, tint and text while selected; hairline and raised surface off. */
export function ToggleChip({ label, selected, onPress, style }: ToggleChipProps) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      // react-native-web drops `accessibilityState.checked`; `aria-checked` reaches the DOM too.
      aria-checked={selected}
      onPress={onPress}
      style={[
        {
          minHeight: sizes.tap,
          justifyContent: "center",
          paddingHorizontal: space.md,
          borderRadius: radius.full,
          borderWidth: stroke.hairline,
          borderColor: selected ? colors.accent : colors.border,
          backgroundColor: selected ? colors.accentSoft : colors.surfaceRaised,
        },
        style,
      ]}
    >
      <Text variant="subhead" tone={selected ? "accent" : "default"}>
        {label}
      </Text>
    </Pressable>
  )
}
