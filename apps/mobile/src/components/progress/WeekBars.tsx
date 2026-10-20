import { Array as Arr, Option } from "effect"
import { View } from "react-native"
import Svg, { Rect } from "react-native-svg"
import type { WeekBucket } from "../../services/HistoryRepo"
import { space, Text, useTheme } from "../../ui"
import { ChartFrame } from "./ChartFrame"
import { barRects } from "./chartGeometry"
import { formatVolume, formatWeekStart, volumeLabel, weekSeries } from "./progressFormat"

const HEIGHT = 96
const GAP = 8
const BAR_RADIUS = 2
const OLDER_BAR_OPACITY = 0.45

interface WeekBarsProps {
  /** Exactly the 8 weeks of `ExerciseHistory.weeks`, oldest first. */
  readonly weeks: ReadonlyArray<WeekBucket>
}

/** Eight weekly bars (volume in kg, or reps when all work is bodyweight); this week is accent. */
export function WeekBars({ weeks }: WeekBarsProps) {
  const { colors } = useTheme()
  const series = weekSeries(weeks)
  const lastIndex = series.values.length - 1
  const latestText = Option.match(Arr.last(series.values), {
    onNone: () => "",
    onSome: (value) => (series.unit === "kg" ? formatVolume(value) : `${value} reps`),
  })
  const firstWeek = Option.match(Arr.head(weeks), {
    onNone: () => "",
    onSome: (week) => `Week of ${formatWeekStart(week.weekStart)}`,
  })
  return (
    <View style={{ gap: space.sm }}>
      <ChartFrame height={HEIGHT} accessibilityLabel={volumeLabel(series)}>
        {(width) => (
          <Svg width={width} height={HEIGHT}>
            {Arr.map(barRects(series.values, { width, height: HEIGHT }, GAP), (rect, index) => (
              <Rect
                key={rect.x}
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                rx={BAR_RADIUS}
                fill={index === lastIndex ? colors.accent : colors.textMuted}
                fillOpacity={index === lastIndex ? 1 : OLDER_BAR_OPACITY}
              />
            ))}
          </Svg>
        )}
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
