import { View } from "react-native"
import Svg, { Path } from "react-native-svg"
import { useTheme } from "./theme"
import { sizes } from "./tokens"

/** 24×24 grid, 2 px round strokes; one path per glyph (subpaths separated by `M`). */
const paths = {
  chevronLeft: "M15 18l-6-6 6-6",
  chevronRight: "M9 18l6-6-6-6",
  chevronDown: "M6 9l6 6 6-6",
  check: "M20 6L9 17l-5-5",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  close: "M18 6L6 18M6 6l12 12",
  play: "M7 4.5v15l12-7.5z",
  pause: "M8 5v14M16 5v14",
  skip: "M5 5l10 7-10 7zM19 5v14",
  timer: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2.5M10 2h4",
  calendar:
    "M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM16 3v4M8 3v4M4 10h16",
  dumbbell: "M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12",
  list: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  swap: "M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16v-5M12 8h.01",
  warning:
    "M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
  flame: "M12 22c3.9 0 7-2.9 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-4 5-4 8 0 4.1 3.1 7 6 7z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  chart: "M3 3v18h18M7 15l4-4 3 3 6-6",
  settings:
    "M12 18.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1",
} as const

export type IconName = keyof typeof paths

export interface IconProps {
  readonly name: IconName
  readonly size?: number
  /** Defaults to the theme's `text` colour. */
  readonly color?: string
}

/** A decorative stroke glyph; the surrounding control carries the accessibility label. */
export function Icon({ name, size = sizes.iconMd, color }: IconProps) {
  const { colors } = useTheme()
  // The View carries the hiding props: react-native-svg forwards them to the DOM `<svg>` on web,
  // where React warns about unknown props; View maps them to `aria-hidden`.
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d={paths[name]}
          stroke={color ?? colors.text}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  )
}
