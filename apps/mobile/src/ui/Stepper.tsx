import * as Haptics from "expo-haptics"
import { Platform, Pressable, type StyleProp, View, type ViewStyle } from "react-native"
import {
  STEPPER_GLYPH_STROKE,
  type StepperSize,
  stepButtonStyle,
  stepGlyphColor,
  stepperSizes,
} from "./controls"
import { Icon, type IconName } from "./Icon"
import { usePressableInteraction } from "./interaction"
import { Text } from "./Text"
import { useTheme } from "./theme"
import { space } from "./tokens"

export type { StepperSize } from "./controls"

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
  readonly size: StepperSize
}

/** A light selection tick on native; web has no haptics. */
const tick = (): void => {
  if (Platform.OS !== "web") {
    Haptics.selectionAsync().catch(() => undefined)
  }
}

/** Borderless icon-only ± (§5, owner 11:55): 64 px invisible hit area, `surface` circle when pressed. */
function StepButton({ icon, accessibilityLabel, onPress, disabled, size }: StepButtonProps) {
  const { colors } = useTheme()
  const { hovered, handlers, focusStyle } = usePressableInteraction()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={tick}
      onPress={onPress}
      {...handlers}
      style={({ pressed }) => [
        stepButtonStyle(size, { pressed, hovered, disabled }, colors),
        focusStyle,
      ]}
    >
      <Icon
        name={icon}
        size={stepperSizes[size].glyph}
        strokeWidth={STEPPER_GLYPH_STROKE}
        color={stepGlyphColor(disabled, colors)}
      />
    </Pressable>
  )
}

/** A value between a borderless minus and plus, readable at arm's length (API of the v1 Stepper). */
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
  return (
    <View style={[{ gap: space.xs }, style]}>
      <Text variant="subhead" tone="muted">
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <StepButton
          icon="minus"
          accessibilityLabel={`Decrease ${label}`}
          onPress={onDecrement}
          disabled={disabled}
          size={size}
        />
        <View
          style={{ flex: 1, alignItems: "center" }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${label}: ${valueText} ${unit}`}
        >
          <Text
            variant="numeral"
            adjustsFontSizeToFit
            numberOfLines={1}
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {valueText}
          </Text>
          <Text variant="label" tone="muted">
            {unit}
          </Text>
        </View>
        <StepButton
          icon="plus"
          accessibilityLabel={`Increase ${label}`}
          onPress={onIncrement}
          disabled={disabled}
          size={size}
        />
      </View>
    </View>
  )
}
