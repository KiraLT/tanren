import { Pressable, type StyleProp, View, type ViewStyle } from "react-native"
import { chipColors, chipPressableStyle, chipStyle } from "./controls"
import { Icon, type IconName } from "./Icon"
import { Text } from "./Text"
import { useTheme } from "./theme"
import { sizes } from "./tokens"

export interface ToggleChipProps {
  /** Visible text and accessibility label. */
  readonly label: string
  readonly selected: boolean
  readonly onPress: () => void
  /** Leading 16 px glyph (`home`, `dumbbell`, …). */
  readonly icon?: IconName
  /** Extra invisible tap area on every side, in px (default none: the Pressable is already 44 tall). */
  readonly hitSlop?: number
  /**
   * Dense chip rows: the row layout is the pill's 32, while the Pressable stays 44 tall with a
   * -6 px vertical margin (a real target on web too, where `hitSlop` is ignored). Default off.
   */
  readonly compact?: boolean
  /** Outer layout only (e.g. `alignSelf`); colours come from the theme. */
  readonly style?: StyleProp<ViewStyle>
}

/**
 * A 32 px pill checkbox (§5): on = `text` fill in light, `accent` in dark; off = 1 px outline. The
 * Pressable around the pill is 44 tall, so the tap target stays >= `sizes.tap`.
 */
export function ToggleChip({
  label,
  selected,
  onPress,
  icon,
  hitSlop,
  compact = false,
  style,
}: ToggleChipProps) {
  const { colors, scheme } = useTheme()
  const foreground = chipColors(selected, scheme, colors).foreground
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      // react-native-web drops `accessibilityState.checked`; `aria-checked` reaches the DOM too.
      aria-checked={selected}
      {...(hitSlop === undefined ? {} : { hitSlop })}
      onPress={onPress}
      style={({ pressed }) => [chipPressableStyle(compact), pressed && { opacity: 0.7 }, style]}
    >
      <View style={chipStyle(selected, scheme, colors)}>
        {icon === undefined ? null : <Icon name={icon} size={sizes.iconXs} color={foreground} />}
        <Text variant="caption" style={{ color: foreground }}>
          {label}
        </Text>
      </View>
    </Pressable>
  )
}
