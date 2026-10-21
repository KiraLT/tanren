import { ActivityIndicator, Pressable, type StyleProp, View, type ViewStyle } from "react-native"
import {
  type ButtonSize,
  type ButtonVariant,
  buttonHoverStyle,
  buttonStyle,
  buttonVariants,
} from "./controls"
import { Icon, type IconName } from "./Icon"
import { usePressableInteraction } from "./interaction"
import { Text } from "./Text"
import { useTheme } from "./theme"
import { sizes, space } from "./tokens"

export type { ButtonSize, ButtonVariant } from "./controls"

export interface ButtonProps {
  readonly label: string
  /** Defaults to `label`. */
  readonly accessibilityLabel?: string
  readonly onPress: () => void
  /** `ghost` is a deprecated alias of `text`. */
  readonly variant?: ButtonVariant
  /** md 48 · lg 56 (primary elsewhere) · xl 64 (Log set). */
  readonly size?: ButtonSize
  /** Leading 24 px glyph (`check` on Log set, `plus` on Add, `zap` on Start). */
  readonly icon?: IconName
  /** Shows a spinner instead of the label (the label stays the accessible name) and ignores presses. */
  readonly loading?: boolean
  readonly disabled?: boolean
  readonly style?: StyleProp<ViewStyle>
}

/** The Forge pill button (§5): `headline` label, `radius.full`, one accent pill per screen. */
export function Button({
  label,
  accessibilityLabel = label,
  onPress,
  variant = "secondary",
  size = "md",
  icon,
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const { colors, scheme } = useTheme()
  const { hovered, handlers, focusStyle } = usePressableInteraction()
  const foreground = colors[buttonVariants[variant].foreground]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      onPress={loading ? undefined : onPress}
      {...handlers}
      style={({ pressed }) => [
        buttonStyle(variant, size, scheme, colors),
        hovered && !disabled && buttonHoverStyle(variant, colors),
        pressed && { opacity: 0.85 },
        disabled && { opacity: 0.4 },
        focusStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          {icon === undefined ? null : <Icon name={icon} size={sizes.iconMd} color={foreground} />}
          <Text variant="headline" style={{ color: foreground }}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  )
}
