import { type ReactNode, useState } from "react"
import { View } from "react-native"

interface ChartFrameProps {
  readonly height: number
  /** Announced as one image; the chart's own drawing is hidden from assistive tech. */
  readonly accessibilityLabel: string
  /** Draws the chart once the available width is known. */
  readonly children: (width: number) => ReactNode
}

/** Measures its own width (`onLayout`) and hands it to the drawing function. */
export function ChartFrame({ height, accessibilityLabel, children }: ChartFrameProps) {
  const [width, setWidth] = useState(0)
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onLayout={(event) => setWidth(Math.floor(event.nativeEvent.layout.width))}
      style={{ height, width: "100%" }}
    >
      {width > 0 ? children(width) : null}
    </View>
  )
}
