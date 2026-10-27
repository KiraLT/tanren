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
  /**
   * Cross-axis placement in a flex row: "start" (default: the top edge, which is the title baseline
   * of a two-line `ListRow`) or "center" (a one-line row, where the title is centred too).
   */
  readonly align?: "start" | "center"
  readonly style?: StyleProp<ViewStyle>
}

/** A capsule status label: tone-coloured text (and glyph) on `surface` (§2; `statusTone[status]`). */
export function StatusPill({ label, tone, icon, align = "start", style }: StatusPillProps) {
  const { colors } = useTheme()
  const color = colors[pillForeground[tone]]
  // "center": the caption baseline sits 1 px above a 17/22 title baseline at equal centres; the
  // 2 px margin moves the capsule 1 px down (measured with the row probe, R5c).
  const placement: ViewStyle =
    align === "center" ? { alignSelf: "center", marginTop: 2 } : { alignSelf: "flex-start" }
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
          ...placement,
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
