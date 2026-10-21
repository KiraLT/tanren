import { View } from "react-native"
import Svg, { Path } from "react-native-svg"
import { type IconName, iconPaths } from "./iconPaths"
import { useTheme } from "./theme"
import { sizes, stroke } from "./tokens"

export type { IconName } from "./iconPaths"

export interface IconProps {
  readonly name: IconName
  readonly size?: number
  /** Defaults to the theme's `text` colour. */
  readonly color?: string
  /** Stroke width on the 24 grid; defaults to `stroke.icon` (2). Tabs use 2 active / 1.75 inactive. */
  readonly strokeWidth?: number
}

/**
 * A decorative stroke glyph (geometry and the Lucide ISC notice live in `iconPaths.ts`); the
 * surrounding control carries the accessibility label.
 */
export function Icon({ name, size = sizes.iconMd, color, strokeWidth = stroke.icon }: IconProps) {
  const { colors } = useTheme()
  // The View carries the hiding props: react-native-svg forwards them to the DOM `<svg>` on web,
  // where React warns about unknown props; View maps them to `aria-hidden`.
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d={iconPaths[name]}
          stroke={color ?? colors.text}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  )
}
