import { Pressable, type StyleProp, type ViewStyle } from "react-native"
import { filledDiscStyle } from "./controls"
import { Icon, type IconName } from "./Icon"
import { usePressableInteraction } from "./interaction"
import { useTheme } from "./theme"
import { radius, sizes } from "./tokens"

export type IconButtonSize = "md" | "lg"
/** `plain`: glyph only (surface tint on press/hover); `filled`: a `surface` disc with a hairline border. */
export type IconButtonVariant = "plain" | "filled"

const boxes: { readonly [S in IconButtonSize]: number } = { md: sizes.tap, lg: sizes.controlLg }

export interface IconButtonProps {
  readonly icon: IconName
  readonly accessibilityLabel: string
  readonly onPress: () => void
  readonly size?: IconButtonSize
  readonly variant?: IconButtonVariant
  readonly disabled?: boolean
  readonly style?: StyleProp<ViewStyle>
}

/** An icon-only control; the hit area is never below 44 px. */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  size = "md",
  variant = "plain",
  disabled = false,
  style,
}: IconButtonProps) {
  const { colors } = useTheme()
  const { hovered, handlers, focusStyle } = usePressableInteraction()
  const filled = variant === "filled"
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      {...handlers}
      style={({ pressed }) => [
        {
          width: boxes[size],
          height: boxes[size],
          borderRadius: radius.full,
          alignItems: "center",
          justifyContent: "center",
        },
        filled
          ? filledDiscStyle(colors, pressed || (hovered && !disabled))
          : { backgroundColor: pressed || (hovered && !disabled) ? colors.surface : "transparent" },
        disabled && { opacity: 0.4 },
        focusStyle,
        style,
      ]}
    >
      <Icon name={icon} size={size === "lg" ? sizes.iconLg : sizes.iconMd} />
    </Pressable>
  )
}
