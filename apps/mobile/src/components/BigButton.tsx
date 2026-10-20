import { Pressable, StyleSheet, Text } from "react-native"
import { colors, radius, sizes } from "./theme"

interface BigButtonProps {
  readonly label: string
  readonly accessibilityLabel: string
  readonly onPress: () => void
  readonly variant?: "primary" | "secondary"
  readonly disabled?: boolean
  readonly height?: number
}

/** A huge, high-contrast pressable. Every pressable in the app goes through this or Stepper. */
export function BigButton({
  label,
  accessibilityLabel,
  onPress,
  variant = "secondary",
  disabled = false,
  height = sizes.tap,
}: BigButtonProps) {
  const primary = variant === "primary"
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { height },
        primary ? styles.primary : styles.secondary,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, primary ? styles.primaryLabel : styles.secondaryLabel]}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    paddingHorizontal: 20,
    minWidth: sizes.tap,
  },
  primary: { backgroundColor: colors.accent },
  secondary: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 2,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  label: { fontSize: 22, fontWeight: "800", letterSpacing: 0.5 },
  primaryLabel: { color: colors.onAccent },
  secondaryLabel: { color: colors.text },
})
