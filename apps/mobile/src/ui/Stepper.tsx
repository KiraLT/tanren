import * as Haptics from "expo-haptics"
import {
  Platform,
  Pressable,
  type StyleProp,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native"
import {
  numeralScale,
  STEPPER_GLYPH_STROKE,
  type StepperSize,
  stepButtonStyle,
  stepGlyphColor,
  stepperCaption,
  stepperSizes,
} from "./controls"
import { Icon, type IconName } from "./Icon"
import { usePressableInteraction } from "./interaction"
import { Text } from "./Text"
import { useTheme } from "./theme"
import { space, type } from "./tokens"

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

/**
 * Shrink-to-fit on native only. On web RNW ignores `adjustsFontSizeToFit` and turns `numberOfLines`
 * into `overflow: hidden`, which would clip the dark-theme glow to the glyph box; there the numeral
 * scales with the window below `NUMERAL_FULL_WIDTH` instead (`webNumeralSize`).
 */
const numeralFit =
  Platform.OS === "web" ? {} : ({ adjustsFontSizeToFit: true, numberOfLines: 1 } as const)

/** Web only: the numeral ramp entry scaled by `numeralScale`; native keeps the ramp (fit handles it). */
const webNumeralSize = (windowWidth: number): TextStyle => {
  const scale = numeralScale(windowWidth)
  const { fontSize, lineHeight } = type.numeral
  return Platform.OS !== "web" || scale === 1 || fontSize === undefined || lineHeight === undefined
    ? {}
    : { fontSize: Math.floor(fontSize * scale), lineHeight: Math.floor(lineHeight * scale) }
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
  const { width } = useWindowDimensions()
  return (
    <View style={[{ gap: space.xs }, style]}>
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
            glow
            {...numeralFit}
            style={[{ fontVariant: ["tabular-nums"], flexShrink: 0 }, webNumeralSize(width)]}
          >
            {valueText}
          </Text>
          <Text variant="label" tone="muted">
            {stepperCaption(label, unit)}
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
