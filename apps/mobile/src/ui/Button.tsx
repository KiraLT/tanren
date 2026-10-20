import { ActivityIndicator, Pressable, type StyleProp, View, type ViewStyle } from "react-native"
import type { ColorRoles } from "./colors"
import { Icon, type IconName } from "./Icon"
import { usePressableInteraction } from "./interaction"
import { Text } from "./Text"
import { useTheme } from "./theme"
import { radius, sizes, space, stroke } from "./tokens"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive"
export type ButtonSize = "md" | "lg" | "xl"

const heights: { readonly [S in ButtonSize]: number } = {
  md: sizes.control,
  lg: sizes.controlLg,
  xl: sizes.logButton,
}

interface VariantColors {
  readonly background: keyof ColorRoles | "transparent"
  readonly foreground: keyof ColorRoles
  readonly outline: boolean
}

const variants: { readonly [V in ButtonVariant]: VariantColors } = {
  primary: { background: "accent", foreground: "onAccent", outline: false },
  secondary: { background: "surfaceRaised", foreground: "text", outline: true },
  ghost: { background: "transparent", foreground: "accent", outline: false },
  destructive: { background: "dangerSoft", foreground: "danger", outline: false },
}

/** Web hover: filled variants dim a touch, quiet ones (outline / ghost) take the `surface` tint. */
const hoverStyle = (spec: VariantColors, colors: ColorRoles): ViewStyle =>
  spec.background === "accent" || spec.background === "dangerSoft"
    ? { opacity: 0.92 }
    : { backgroundColor: colors.surface }

export interface ButtonProps {
  readonly label: string
  /** Defaults to `label`. */
  readonly accessibilityLabel?: string
  readonly onPress: () => void
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  readonly icon?: IconName
  /** Shows a spinner instead of the label (the label stays the accessible name) and ignores presses. */
  readonly loading?: boolean
  readonly disabled?: boolean
  readonly style?: StyleProp<ViewStyle>
}

/** The app's text button (replaces `BigButton`): `headline` label, `radius.md`, one accent per screen. */
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
  const { colors } = useTheme()
  const { hovered, handlers, focusStyle } = usePressableInteraction()
  const spec = variants[variant]
  const foreground = colors[spec.foreground]
  const background = spec.background === "transparent" ? "transparent" : colors[spec.background]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      onPress={loading ? undefined : onPress}
      {...handlers}
      style={({ pressed }) => [
        {
          minHeight: heights[size],
          minWidth: sizes.tap,
          paddingHorizontal: space.xl,
          borderRadius: radius.md,
          borderCurve: "continuous",
          backgroundColor: background,
          borderWidth: spec.outline ? stroke.outline : 0,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
        },
        hovered && !disabled && hoverStyle(spec, colors),
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
