import { Option } from "effect"
import { type StyleProp, View, type ViewStyle } from "react-native"
import { useDailyHealth } from "../../hooks/useDailyHealth"
import { Icon, radius, space, Text, useTheme } from "../../ui"
import { healthLine } from "../feed/importedText"
import { localDateOf } from "../planFormat"

/** 18 caption line + 2 × 8 padding + 2 × 1 border (garmin.md §7). */
const STRIP_HEIGHT = 36
const GLYPH = 16

export interface HealthStripProps {
  readonly style?: StyleProp<ViewStyle>
}

/**
 * Today's imported health line (garmin.md §7): flame, "Today", "1,840 kcal · 8,420 steps · 52 bpm
 * resting". Renders nothing while loading, on a failed read, with no row for the local date, or
 * when the row reports none of the three values. `surfaceRaised` with a hairline border, because
 * `surfaceRaised` equals the page background in light.
 */
export function HealthStrip({ style }: HealthStripProps) {
  const { colors } = useTheme()
  // The device's calendar day at render (same read as the Plan screen's `today`).
  const health = useDailyHealth(localDateOf(new Date()))
  return Option.match(Option.flatMap(health, healthLine), {
    onNone: () => null,
    onSome: (line) => (
      <View
        accessible
        accessibilityLabel={`Today: ${line}`}
        style={[
          {
            height: STRIP_HEIGHT,
            flexDirection: "row",
            alignItems: "center",
            gap: space.sm,
            paddingHorizontal: space.md,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceRaised,
          },
          style,
        ]}
      >
        <Icon name="flame" size={GLYPH} color={colors.accent} />
        <Text variant="label">Today</Text>
        <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {line}
        </Text>
      </View>
    ),
  })
}
