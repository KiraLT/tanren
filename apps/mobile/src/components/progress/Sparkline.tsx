import { Array as Arr, Option } from "effect"
import { useState } from "react"
import { View } from "react-native"
import Svg, { Circle, G, Polyline } from "react-native-svg"
import type { ExerciseHistory } from "../../services/HistoryRepo"
import { space, Text, useTheme } from "../../ui"
import { ChartFrame } from "./ChartFrame"
import { ChartHover, type HoverMark, TOOLTIP_STRIP } from "./ChartHover"
import { columnCenters, hoverBand, sparklineShape } from "./chartGeometry"
import { formatKg1, formatWeekStart, trendLabel } from "./progressFormat"

const PLOT = 72
const LINE_WIDTH = 2
/** Marker radius (dataviz: diameter >= 8 px) and the surface ring around it. */
const DOT_RADIUS = 5
const RING_WIDTH = 2
/** Room for a marker and its ring at the plot edges. */
const PAD = DOT_RADIUS + RING_WIDTH + 1

interface SparklineProps {
  /** `ExerciseHistory.e1RmTrend`: eight weeks, oldest first, `None` where nothing was logged. */
  readonly trend: ExerciseHistory["e1RmTrend"]
}

/**
 * The weekly best e1RM as a 2 px line in one muted hue with 10 px markers on a surface ring; the
 * latest week is the accent. Weeks without sets leave a gap, a lone week is a dot. Tooltip on hover.
 */
export function Sparkline({ trend }: SparklineProps) {
  const { colors } = useTheme()
  const [active, setActive] = useState<Option.Option<number>>(Option.none())
  const values = Arr.map(trend, (week) => week.e1Rm)
  const latest = Arr.last(Arr.getSomes(values))
  return (
    <View style={{ gap: space.sm }}>
      <ChartFrame height={TOOLTIP_STRIP + PLOT} accessibilityLabel={trendLabel(trend)}>
        {(width) => {
          const shape = sparklineShape(values, { width, height: PLOT }, PAD)
          const centers = columnCenters(trend.length, width, PAD)
          const lastDot = Arr.last(shape.dots)
          const marks: ReadonlyArray<HoverMark> = Arr.map(trend, (week, index) => ({
            ...hoverBand(centers, index, width),
            center: centers[index] ?? 0,
            value: Option.match(week.e1Rm, {
              onNone: () => "No sets",
              onSome: (e1Rm) => `e1RM ${formatKg1(e1Rm)}`,
            }),
            label: `Week of ${formatWeekStart(week.weekStart)}`,
          }))
          return (
            <>
              <View style={{ marginTop: TOOLTIP_STRIP }}>
                <Svg width={width} height={PLOT}>
                  {Arr.map(shape.segments, (points) => (
                    <Polyline
                      key={points}
                      points={points}
                      fill="none"
                      stroke={colors.textMuted}
                      strokeWidth={LINE_WIDTH}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ))}
                  {Arr.map(shape.dots, (dot) => {
                    const current = Option.exists(lastDot, (last) => last.x === dot.x)
                    return (
                      <G key={`${dot.x},${dot.y}`}>
                        <Circle
                          cx={dot.x}
                          cy={dot.y}
                          r={DOT_RADIUS + RING_WIDTH}
                          fill={colors.surface}
                        />
                        <Circle
                          cx={dot.x}
                          cy={dot.y}
                          r={DOT_RADIUS}
                          fill={current ? colors.accent : colors.textMuted}
                        />
                      </G>
                    )
                  })}
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
      <Text variant="caption" tone="muted">
        {Option.match(latest, {
          onNone: () => "No sets in the last 8 weeks",
          onSome: (e1Rm) => `Latest weekly best ${formatKg1(e1Rm)}`,
        })}
      </Text>
    </View>
  )
}
