import { Pressable, StyleSheet, Text, View } from "react-native"
import { colors, radius, sizes } from "./theme"

interface StepperProps {
  readonly label: string
  /** Already formatted, e.g. "82.5". */
  readonly valueText: string
  readonly unit: string
  readonly onDecrement: () => void
  readonly onIncrement: () => void
}

interface StepButtonProps {
  readonly symbol: string
  readonly accessibilityLabel: string
  readonly onPress: () => void
}

function StepButton({ symbol, accessibilityLabel, onPress }: StepButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.symbol}>{symbol}</Text>
    </Pressable>
  )
}

/** A value with a huge minus on the left and plus on the right, readable at arm's length. */
export function Stepper({ label, valueText, unit, onDecrement, onIncrement }: StepperProps) {
  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <StepButton symbol="−" accessibilityLabel={`Decrease ${label}`} onPress={onDecrement} />
        <View
          style={styles.value}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${label}: ${valueText} ${unit}`}
        >
          <Text style={styles.valueText} adjustsFontSizeToFit numberOfLines={1}>
            {valueText}
          </Text>
          <Text style={styles.unit}>{unit}</Text>
        </View>
        <StepButton symbol="+" accessibilityLabel={`Increase ${label}`} onPress={onIncrement} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  label: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  button: {
    width: sizes.stepperButton,
    height: sizes.stepperButton,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { backgroundColor: colors.accent },
  symbol: { color: colors.text, fontSize: 44, fontWeight: "700", lineHeight: 50 },
  value: { flex: 1, alignItems: "center" },
  valueText: {
    color: colors.text,
    fontSize: 64,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  unit: { color: colors.textMuted, fontSize: 18, fontWeight: "600" },
})
