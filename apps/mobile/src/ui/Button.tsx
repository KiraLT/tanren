import { ActivityIndicator, Pressable, type StyleProp, View, type ViewStyle } from "react-native"
import {
  type ButtonSize,
  type ButtonVariant,
  buttonHoverStyle,
  buttonLabel,
  buttonStyle,
  buttonTouchHeight,
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
  /**
   * secondary (default, on the page `bg`) · raised (inside a `Card`: `secondary` has the card's own
   * fill and vanishes there) · primary · destructive · text (no fill).
   * Rule: a button inside a `Card` uses `raised`.
   */
  readonly variant?: ButtonVariant
  /** sm 36 (44 touch area) · md 48 · lg 56 (primary elsewhere) · xl 64 (Log set). */
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
  const labelSpec = buttonLabel(size)
  const pill = [
    buttonStyle(variant, size, scheme, colors),
    hovered && !disabled && buttonHoverStyle(variant, colors),
    focusStyle,
  ]
  // `sm` is a 36 px pill inside a 44 px Pressable (react-native-web ignores `hitSlop`): the pill
  // styles go on an inner View, the caller's `style` and the press/disabled dimming on the outer.
  const wrapped = size === "sm"
  const content = loading ? (
    <ActivityIndicator color={foreground} />
  ) : (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      {icon === undefined ? null : <Icon name={icon} size={sizes.iconMd} color={foreground} />}
      <Text
        variant={labelSpec.variant}
        style={{
          color: foreground,
          ...(labelSpec.fontWeight === undefined ? {} : { fontWeight: labelSpec.fontWeight }),
        }}
      >
        {label}
      </Text>
    </View>
  )
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      onPress={loading ? undefined : onPress}
      {...handlers}
      style={({ pressed }) => [
        wrapped ? { minHeight: buttonTouchHeight(size), justifyContent: "center" } : pill,
        pressed && { opacity: 0.85 },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      {wrapped ? <View style={pill}>{content}</View> : content}
    </Pressable>
  )
}
