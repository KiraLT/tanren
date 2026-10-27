import type { DayTotals, LocalDate } from "@tanren/shared"
import { Array as Arr } from "effect"
import { View } from "react-native"
import { radius, space, Text, useTheme } from "../../ui"
import { dayBarColumns } from "./dayBarMath"

/** Legend 16 + 8 gap + bars 120 + 4 gap + 16 letter = 164 (nutrition.md §6 "7 days", N-M3 r2). */
const BAR_AREA = 120
const LINE = 16
const DOT = 8
/** The whole section's height (164), for the `/health` loading skeleton. */
export const DAY_BARS_HEIGHT = LINE + space.sm + BAR_AREA + space.xs + LINE

export interface DayBarsProps {
  /** Mon–Sun of the shown week (`WeekReview.days`). */
  readonly days: ReadonlyArray<DayTotals>
  readonly today: LocalDate
}

/**
 * 18 everywhere: two bars + 4 gap = 40 fits a 44 column at 390 and a 54 column in the 1280 side
 * card (431 inner); 28 would need 60 (designer UI-HM-r1 F1).
 */
const BAR_WIDTH = 18

function LegendItem({ color, label }: { readonly color: string; readonly label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
      <View style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: color }} />
      <Text variant="label" tone="muted" style={{ lineHeight: LINE }}>
        {label}
      </Text>
    </View>
  )
}

/**
 * The week's eaten (accent; `danger` on an over-budget day, health-module.md §4) and Garmin burned
 * (`textMuted`) bars per day on a `surface` track, so
 * upcoming and no-data days still read as empty columns; day letter below (today's in accent), a
 * right-aligned legend above (hidden from assistive tech: each column speaks its own label).
 */
export function DayBars({ days, today }: DayBarsProps) {
  const { colors } = useTheme()
  const columns = dayBarColumns(days, today, BAR_AREA)
  const trackWidth = 2 * BAR_WIDTH + space.xs
  return (
    <View style={{ gap: space.sm }}>
      <View
        // `aria-hidden` for react-native-web, which drops `accessibilityElementsHidden` (N-M3 r2 probe).
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: "row", justifyContent: "flex-end", gap: space.md, height: LINE }}
      >
        <LegendItem color={colors.accent} label="Eaten" />
        <LegendItem color={colors.textMuted} label="Burned" />
      </View>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        {Arr.map(columns, (column) => (
          <View
            key={column.date}
            accessible
            accessibilityLabel={column.accessibilityLabel}
            style={{ flex: 1, flexBasis: 0, alignItems: "center", gap: space.xs }}
          >
            <View
              style={{
                width: trackWidth,
                height: BAR_AREA,
                flexDirection: "row",
                alignItems: "flex-end",
                gap: space.xs,
              }}
            >
              <View
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  width: trackWidth,
                  height: BAR_AREA,
                  borderRadius: radius.sm,
                  backgroundColor: colors.surface,
                }}
              />
              <View
                style={{
                  width: BAR_WIDTH,
                  height: column.eatenHeight,
                  borderRadius: radius.sm,
                  backgroundColor: column.isOver ? colors.danger : colors.accent,
                }}
              />
              <View
                style={{
                  width: BAR_WIDTH,
                  height: column.burnedHeight,
                  borderRadius: radius.sm,
                  backgroundColor: colors.textMuted,
                }}
              />
            </View>
            <Text
              variant="label"
              tone={column.isToday ? "accent" : "muted"}
              style={{ lineHeight: LINE }}
            >
              {column.letter}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}
