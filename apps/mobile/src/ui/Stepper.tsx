import { Pressable, type StyleProp, View, type ViewStyle } from "react-native"
import { Icon, type IconName } from "./Icon"
import { Text } from "./Text"
import { useTheme } from "./theme"
import { radius, sizes, space, stroke } from "./tokens"

export type StepperSize = "lg" | "xl"

const buttonSizes: { readonly [S in StepperSize]: number } = {
  lg: sizes.controlLg,
  xl: sizes.stepperButton,
}

export interface StepperProps {
  readonly label: string
  /** Already formatted, e.g. "82.5". */
  readonly valueText: string
  readonly unit: string
  readonly onDecrement: () => void
  readonly onIncrement: () => void
  readonly disabled?: boolean
  readonly size?: StepperSize
  readonly style?: StyleProp<ViewStyle>
}

interface StepButtonProps {
  readonly icon: IconName
  readonly accessibilityLabel: string
  readonly onPress: () => void
  readonly disabled: boolean
  readonly size: number
}

function StepButton({ icon, accessibilityLabel, onPress, disabled, size }: StepButtonProps) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: radius.lg,
          borderCurve: "continuous",
          backgroundColor: pressed ? colors.accent : colors.surfaceRaised,
          borderWidth: stroke.outline,
          borderColor: pressed ? colors.accent : colors.border,
          alignItems: "center",
          justifyContent: "center",
        },
        disabled && { opacity: 0.4 },
      ]}
    >
      {({ pressed }) => (
        <Icon
          name={icon}
          size={size >= sizes.stepperButton ? sizes.iconLg : sizes.iconMd}
          color={pressed ? colors.onAccent : colors.text}
        />
      )}
    </Pressable>
  )
}

/** A value with a big minus left and plus right, readable at arm's length (API of the v1 Stepper). */
export function Stepper({
  label,
  valueText,
  unit,
  onDecrement,
  onIncrement,
  disabled = false,
  size = "xl",
  style,
}: StepperProps) {
  const buttonSize = buttonSizes[size]
  return (
    <View style={[{ gap: space.sm }, style]}>
      <Text variant="subhead" tone="muted">
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <StepButton
          icon="minus"
          accessibilityLabel={`Decrease ${label}`}
          onPress={onDecrement}
          disabled={disabled}
          size={buttonSize}
        />
        <View
          style={{ flex: 1, alignItems: "center" }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${label}: ${valueText} ${unit}`}
        >
          <Text variant="numeral" adjustsFontSizeToFit numberOfLines={1}>
            {valueText}
          </Text>
          <Text variant="caption" tone="muted">
            {unit}
          </Text>
        </View>
        <StepButton
          icon="plus"
          accessibilityLabel={`Increase ${label}`}
          onPress={onIncrement}
          disabled={disabled}
          size={buttonSize}
        />
      </View>
    </View>
  )
}
