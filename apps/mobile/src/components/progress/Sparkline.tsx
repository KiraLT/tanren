import { Array as Arr, Option } from "effect"
import { View } from "react-native"
import Svg, { Circle, Line, Polyline } from "react-native-svg"
import type { ExerciseHistory } from "../../services/HistoryRepo"
import { space, Text, useTheme } from "../../ui"
import { ChartFrame } from "./ChartFrame"
import { sparklineShape } from "./chartGeometry"
import { formatKg1, trendLabel } from "./progressFormat"

const HEIGHT = 64
const PAD = 6
const LINE_WIDTH = 2
const DOT_RADIUS = 3

interface SparklineProps {
  /** `ExerciseHistory.e1RmTrend`: eight weeks, oldest first, `None` where nothing was logged. */
  readonly trend: ExerciseHistory["e1RmTrend"]
}

/** The weekly best e1RM as a line; weeks without sets leave a gap, a lone week is a dot. */
export function Sparkline({ trend }: SparklineProps) {
  const { colors } = useTheme()
  const values = Arr.map(trend, (week) => week.e1Rm)
  const latest = Arr.last(Arr.getSomes(values))
  return (
    <View style={{ gap: space.sm }}>
      <ChartFrame height={HEIGHT} accessibilityLabel={trendLabel(trend)}>
        {(width) => {
          const shape = sparklineShape(values, { width, height: HEIGHT }, PAD)
          return (
            <Svg width={width} height={HEIGHT}>
              <Line
                x1={0}
                x2={width}
                y1={HEIGHT - 1}
                y2={HEIGHT - 1}
                stroke={colors.border}
                strokeWidth={1}
              />
              {Arr.map(shape.segments, (points) => (
                <Polyline
                  key={points}
                  points={points}
                  fill="none"
                  stroke={colors.accent}
                  strokeWidth={LINE_WIDTH}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {Arr.map(shape.dots, (dot) => (
                <Circle
                  key={`${dot.x},${dot.y}`}
                  cx={dot.x}
                  cy={dot.y}
                  r={DOT_RADIUS}
                  fill={colors.accent}
                />
              ))}
            </Svg>
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
