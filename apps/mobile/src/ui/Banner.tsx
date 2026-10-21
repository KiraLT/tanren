import { type StyleProp, View, type ViewStyle } from "react-native"
import { Button } from "./Button"
import type { ColorRoles } from "./colors"
import { Icon, type IconName } from "./Icon"
import { IconButton } from "./IconButton"
import { Text } from "./Text"
import { useTheme } from "./theme"
import { radius, sizes, space, stroke } from "./tokens"

export type BannerTone = "info" | "success" | "danger"

const tones: {
  readonly [T in BannerTone]: {
    readonly bg: keyof ColorRoles
    readonly fg: keyof ColorRoles
    readonly icon: IconName
  }
} = {
  info: { bg: "surface", fg: "text", icon: "info" },
  success: { bg: "successSoft", fg: "success", icon: "check" },
  danger: { bg: "dangerSoft", fg: "danger", icon: "warning" },
}

export interface BannerAction {
  readonly label: string
  readonly onPress: () => void
}

export interface BannerProps {
  readonly tone?: BannerTone
  readonly title: string
  readonly body?: string
  readonly action?: BannerAction
  /** Shows a close button labelled "Dismiss". */
  readonly onDismiss?: () => void
  readonly style?: StyleProp<ViewStyle>
}

/**
 * Inline status message (`accessibilityRole="alert"`). A screen may position it absolutely as a
 * toast and add `boxShadow: elevation.overlay(colors.overlay)`.
 */
export function Banner({ tone = "info", title, body, action, onDismiss, style }: BannerProps) {
  const { colors } = useTheme()
  const spec = tones[tone]
  return (
    <View
      accessibilityRole="alert"
      style={[
        {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: space.md,
          padding: space.lg,
          borderRadius: radius.md,
          borderCurve: "continuous",
          backgroundColor: colors[spec.bg],
          borderWidth: tone === "info" ? stroke.hairline : 0,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <Icon name={spec.icon} size={sizes.iconMd} color={colors[spec.fg]} />
      <View style={{ flex: 1, gap: space.xs }}>
        <Text variant="headline" style={{ color: colors[spec.fg] }}>
          {title}
        </Text>
        {body === undefined ? null : <Text>{body}</Text>}
        {action === undefined ? null : (
          <Button
            label={action.label}
            onPress={action.onPress}
            variant="text"
            style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}
          />
        )}
      </View>
      {onDismiss === undefined ? null : (
        <IconButton icon="close" accessibilityLabel="Dismiss" onPress={onDismiss} />
      )}
    </View>
  )
}
