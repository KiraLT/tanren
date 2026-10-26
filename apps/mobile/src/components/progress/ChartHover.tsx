import { Array as Arr, Option } from "effect"
import { useState } from "react"
import { Pressable, View } from "react-native"
import { radius, space, stroke, Text, useTheme } from "../../ui"
import { TOOLTIP_MAX_WIDTH, tooltipCaption, tooltipLeft, tooltipWidth } from "./chartGeometry"

/** Height (px) of the strip above the plot where the tooltip floats, so it never covers a mark. */
export const TOOLTIP_STRIP = 32

export interface HoverMark {
  /** Hover band over the plot (x, width), from `hoverBand`. */
  readonly x: number
  readonly width: number
  /** x of the mark the tooltip points at. */
  readonly center: number
  /** "1,175 kg": leads the tooltip. */
  readonly value: string
  /** "Week of 7 Sep": follows the value, muted. */
  readonly label: string
}

interface ChartHoverProps {
  readonly marks: ReadonlyArray<HoverMark>
  readonly chartWidth: number
  readonly plotHeight: number
  readonly active: Option.Option<number>
  readonly onActive: (next: Option.Option<number>) => void
}

interface TooltipProps {
  readonly mark: HoverMark
  readonly chartWidth: number
}

/** `surfaceRaised` bubble, value first (text tokens only); hidden until its width is measured. */
function Tooltip({ mark, chartWidth }: TooltipProps) {
  const { colors } = useTheme()
  const [width, setWidth] = useState(0)
  return (
    <View
      pointerEvents="none"
      onLayout={(event) => setWidth(tooltipWidth(event.nativeEvent.layout.width, chartWidth))}
      style={{
        position: "absolute",
        top: 0,
        // measured at left 0 (the full natural width), then pinned there and moved under the mark
        left: width > 0 ? tooltipLeft(mark.center, width, chartWidth) : 0,
        ...(width > 0 ? { width } : {}),
        maxWidth: Math.min(TOOLTIP_MAX_WIDTH, chartWidth),
        opacity: width > 0 ? 1 : 0,
        justifyContent: "center",
        paddingHorizontal: space.sm,
        height: TOOLTIP_STRIP - space.xs,
        borderRadius: radius.full,
        borderCurve: "continuous",
        backgroundColor: colors.surfaceRaised,
        borderWidth: stroke.hairline,
        borderColor: colors.border,
      }}
    >
      <Text variant="caption" tabular numberOfLines={1}>
        {tooltipCaption(mark.value, mark.label)}
      </Text>
    </View>
  )
}

/**
 * Hover layer of a chart (dataviz interaction): one band per mark, wider than the mark, that sets
 * `active` on pointer hover (web) or tap (touch; a second tap clears), and the tooltip above.
 * Tooltips enhance only: the values are in the chart's label and the text beside it.
 */
export function ChartHover({ marks, chartWidth, plotHeight, active, onActive }: ChartHoverProps) {
  const current = Option.flatMap(active, (index) => Arr.get(marks, index))
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
      {Option.match(current, {
        onNone: () => null,
        onSome: (mark) => <Tooltip key={mark.x} mark={mark} chartWidth={chartWidth} />,
      })}
      {Arr.map(marks, (mark, index) => (
        <Pressable
          key={mark.x}
          focusable={false}
          accessibilityLabel={`${mark.label}, ${mark.value}`}
          onHoverIn={() => onActive(Option.some(index))}
          onHoverOut={() => onActive(Option.none())}
          onPress={() =>
            onActive(
              Option.exists(active, (at) => at === index) ? Option.none() : Option.some(index),
            )
          }
          style={{
            position: "absolute",
            top: TOOLTIP_STRIP,
            left: mark.x,
            width: mark.width,
            height: plotHeight,
          }}
        />
      ))}
    </View>
  )
}
