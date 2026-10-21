import { type StyleProp, View, type ViewStyle } from "react-native"
import { pillForeground } from "./controls"
import { Icon, type IconName } from "./Icon"
import { Text } from "./Text"
import { useTheme } from "./theme"
import { radius, sizes, space, type Tone } from "./tokens"

export interface StatusPillProps {
  readonly label: string
  readonly tone: Tone
  /** Leading 16 px glyph, e.g. `check` on "Available at Home". */
  readonly icon?: IconName
  readonly style?: StyleProp<ViewStyle>
}

/** A capsule status label: tone-coloured text (and glyph) on `surface` (§2; `statusTone[status]`). */
export function StatusPill({ label, tone, icon, style }: StatusPillProps) {
  const { colors } = useTheme()
  const color = colors[pillForeground[tone]]
  return (
    <View
      style={[
        {
          minHeight: 24,
          flexDirection: "row",
          alignItems: "center",
          gap: space.xs,
          paddingHorizontal: space.sm,
          borderRadius: radius.full,
          backgroundColor: colors.surface,
          alignSelf: "flex-start",
        },
        style,
      ]}
    >
      {icon === undefined ? null : <Icon name={icon} size={sizes.iconXs} color={color} />}
      <Text variant="caption" style={{ color }}>
        {label}
      </Text>
    </View>
  )
}
