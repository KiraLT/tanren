import { Option } from "effect"
import { View } from "react-native"
import { formatClock } from "../hooks/restClock"
import {
  Button,
  gutter,
  Icon,
  sizes,
  space,
  stroke,
  Text,
  TimerRing,
  useBreakpoint,
  useTheme,
} from "../ui"

interface RestTimerBarProps {
  readonly remaining: Option.Option<number>
  /** The rest that was started, in seconds: the ring's full circle. */
  readonly total: number
  /** `bar` on phone/tablet (below the pager), `ring` in the desktop aside. */
  readonly layout: "bar" | "ring"
  readonly onSkip: () => void
}

/** Rest countdown with a skip button; renders nothing while no rest is running. */
export function RestTimerBar({ remaining, total, layout, onSkip }: RestTimerBarProps) {
  const { colors } = useTheme()
  const breakpoint = useBreakpoint()
  return Option.match(remaining, {
    onNone: () => null,
    onSome: (seconds) => {
      const label = `Rest, ${seconds} seconds left`
      return layout === "ring" ? (
        <View style={{ alignItems: "center", gap: space.lg, padding: space.xl }}>
          <TimerRing
            progress={total > 0 ? seconds / total : 0}
            tone="neutral"
            accessibilityLabel={label}
          >
            <Text variant="label" tone="muted">
              Rest
            </Text>
            <Text variant="numeral" style={{ fontVariant: ["tabular-nums"] }}>
              {formatClock(seconds)}
            </Text>
          </TimerRing>
          <Button label="Skip" accessibilityLabel="Skip rest" onPress={onSkip} />
        </View>
      ) : (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: gutter[breakpoint],
            paddingVertical: space.md,
            backgroundColor: colors.surface,
            borderTopWidth: stroke.hairline,
            borderTopColor: colors.border,
          }}
        >
          <View
            accessible
            accessibilityRole="timer"
            accessibilityLabel={label}
            style={{ flexDirection: "row", alignItems: "center", gap: space.md }}
          >
            <Icon name="timer" size={sizes.iconMd} color={colors.accent} />
            <View>
              <Text variant="label" tone="muted">
                Rest
              </Text>
              <Text variant="numeral" style={{ fontVariant: ["tabular-nums"] }}>
                {formatClock(seconds)}
              </Text>
            </View>
          </View>
          <Button label="Skip" accessibilityLabel="Skip rest" onPress={onSkip} />
        </View>
      )
    },
  })
}
