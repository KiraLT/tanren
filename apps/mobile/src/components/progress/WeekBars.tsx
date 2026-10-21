import { Array as Arr, Option } from "effect"
import { useState } from "react"
import { View } from "react-native"
import Svg, { Line, Path } from "react-native-svg"
import type { WeekBucket } from "../../services/HistoryRepo"
import { space, stroke, Text, useTheme } from "../../ui"
import { ChartFrame } from "./ChartFrame"
import { ChartHover, type HoverMark, TOOLTIP_STRIP } from "./ChartHover"
import { barRects, hoverBand, roundedTopBarPath } from "./chartGeometry"
import { formatVolume, formatWeekStart, volumeLabel, weekSeries } from "./progressFormat"

const PLOT = 96
/** Surface gap between adjacent bars (dataviz): the slot gap, never less. */
const GAP = 2
/** Thin marks: a bar never fills its slot. */
const MAX_BAR = 24
const END_RADIUS = 4
const OLDER_BAR_OPACITY = 0.4
const HOVER_BAR_OPACITY = 0.75

interface WeekBarsProps {
  /** Exactly the 8 weeks of `ExerciseHistory.weeks`, oldest first. */
  readonly weeks: ReadonlyArray<WeekBucket>
}

/**
 * Eight weekly bars (volume in kg, or reps when all work is bodyweight): one hue, this week in the
 * accent, 4 px rounded data ends on a hairline baseline, a tooltip on hover or tap.
 */
export function WeekBars({ weeks }: WeekBarsProps) {
  const { colors } = useTheme()
  const [active, setActive] = useState<Option.Option<number>>(Option.none())
  const series = weekSeries(weeks)
  const lastIndex = series.values.length - 1
  const text = (value: number): string =>
    series.unit === "kg" ? formatVolume(value) : `${value} reps`
  const latestText = Option.match(Arr.last(series.values), { onNone: () => "", onSome: text })
  const firstWeek = Option.match(Arr.head(weeks), {
    onNone: () => "",
    onSome: (week) => `Week of ${formatWeekStart(week.weekStart)}`,
  })
  return (
    <View style={{ gap: space.sm }}>
      <ChartFrame height={TOOLTIP_STRIP + PLOT} accessibilityLabel={volumeLabel(series)}>
        {(width) => {
          const rects = barRects(
            series.values,
            { width, height: PLOT - stroke.hairline },
            GAP,
            MAX_BAR,
          )
          const centers = Arr.map(rects, (rect) => rect.x + rect.width / 2)
          const marks: ReadonlyArray<HoverMark> = Arr.map(series.values, (value, index) => ({
            ...hoverBand(centers, index, width),
            center: centers[index] ?? 0,
            value: text(value),
            label:
              index === lastIndex
                ? "This week"
                : `Week of ${formatWeekStart(weeks[index]?.weekStart ?? "")}`,
          }))
          return (
            <>
              <View style={{ marginTop: TOOLTIP_STRIP }}>
                <Svg width={width} height={PLOT}>
                  {Arr.map(rects, (rect, index) => {
                    const current = index === lastIndex
                    const hovered = Option.exists(active, (at) => at === index)
                    return (
                      <Path
                        key={rect.x}
                        d={roundedTopBarPath(rect, END_RADIUS)}
                        fill={current ? colors.accent : colors.textMuted}
                        fillOpacity={current ? 1 : hovered ? HOVER_BAR_OPACITY : OLDER_BAR_OPACITY}
                      />
                    )
                  })}
                  <Line
                    x1={0}
                    x2={width}
                    y1={PLOT - stroke.hairline / 2}
                    y2={PLOT - stroke.hairline / 2}
                    stroke={colors.border}
                    strokeWidth={stroke.hairline}
                  />
                </Svg>
              </View>
              <ChartHover
                marks={marks}
                chartWidth={width}
                plotHeight={PLOT}
                active={active}
                onActive={setActive}
              />
            </>
          )
        }}
      </ChartFrame>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text variant="caption" tone="muted">
          {firstWeek}
        </Text>
        <Text variant="caption">{`This week ${latestText}`}</Text>
      </View>
    </View>
  )
}
