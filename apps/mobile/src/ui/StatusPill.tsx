import { type StyleProp, View, type ViewStyle } from "react-native"
import type { ColorRoles } from "./colors"
import { Text } from "./Text"
import { useTheme } from "./theme"
import { radius, space, type Tone } from "./tokens"

const toneRoles: {
  readonly [T in Tone]: { readonly bg: keyof ColorRoles; readonly fg: keyof ColorRoles }
} = {
  neutral: { bg: "border", fg: "textMuted" },
  accent: { bg: "accentSoft", fg: "accent" },
  success: { bg: "successSoft", fg: "success" },
  danger: { bg: "dangerSoft", fg: "danger" },
}

export interface StatusPillProps {
  readonly label: string
  readonly tone: Tone
  readonly style?: StyleProp<ViewStyle>
}

/** A capsule status label (`statusTone[status]` for plan statuses). */
export function StatusPill({ label, tone, style }: StatusPillProps) {
  const { colors } = useTheme()
  const roles = toneRoles[tone]
  return (
    <View
      style={[
        {
          minHeight: 24,
          paddingHorizontal: space.sm,
          borderRadius: radius.full,
          backgroundColor: colors[roles.bg],
          alignSelf: "flex-start",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Text variant="caption" style={{ color: colors[roles.fg] }}>
        {label}
      </Text>
    </View>
  )
}
