import { Option } from "effect"
import { StyleSheet, Text, View } from "react-native"
import { formatClock } from "../hooks/restClock"
import { BigButton } from "./BigButton"
import { colors, space } from "./theme"

interface RestTimerBarProps {
  readonly remaining: Option.Option<number>
  readonly onSkip: () => void
}

/** Big countdown with a skip button; renders nothing while no rest is running. */
export function RestTimerBar({ remaining, onSkip }: RestTimerBarProps) {
  return Option.match(remaining, {
    onNone: () => null,
    onSome: (seconds) => (
      <View style={styles.bar}>
        <View
          accessible
          accessibilityRole="timer"
          accessibilityLabel={`Rest, ${seconds} seconds left`}
        >
          <Text style={styles.caption}>REST</Text>
          <Text style={styles.clock}>{formatClock(seconds)}</Text>
        </View>
        <BigButton label="SKIP" accessibilityLabel="Skip rest" onPress={onSkip} />
      </View>
    ),
  })
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: space.md,
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: 3,
    borderTopColor: colors.accent,
  },
  caption: { color: colors.accent, fontSize: 14, fontWeight: "800", letterSpacing: 3 },
  clock: {
    color: colors.text,
    fontSize: 56,
    fontWeight: "900",
    lineHeight: 62,
    fontVariant: ["tabular-nums"],
  },
})
