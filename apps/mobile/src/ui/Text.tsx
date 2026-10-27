import { Text as RNText, type TextProps as RNTextProps } from "react-native"
import type { ColorRoles } from "./colors"
import { useTheme } from "./theme"
import { glowRadius, type TypeVariant, tabularStyle, type } from "./tokens"

export type TextTone = "default" | "muted" | "accent" | "success" | "danger" | "onAccent"

const toneRole: { readonly [T in TextTone]: keyof ColorRoles } = {
  default: "text",
  muted: "textMuted",
  accent: "accent",
  success: "success",
  danger: "danger",
  onAccent: "onAccent",
}

export interface TextProps extends RNTextProps {
  readonly variant?: TypeVariant
  readonly tone?: TextTone
  /**
   * Dark-theme glow (`colors.glow` text shadow, ui-direction-final §4); invisible in light, where
   * `glow` is `transparent`. Opt-in: the blur is clipped to the box when the text also has
   * `numberOfLines`/`adjustsFontSizeToFit` (RNW `overflow: hidden`), so give it room first.
   */
  readonly glow?: boolean
  /** Tabular figures (`fontVariant: ["tabular-nums"]`) for compared numbers (ui-polish D6). */
  readonly tabular?: boolean
  /**
   * Heading level on web (`<h1>`..`<h3>`). Without it `accessibilityRole="header"` renders every
   * heading as `<h1>` (react-native-web 0.21.4). Setting it implies the heading role: do not combine
   * it with `role` / `accessibilityRole` on the same element (the heading props follow `{...rest}`
   * and would override a caller's `role`).
   */
  readonly headingLevel?: HeadingLevel
}

export type HeadingLevel = 1 | 2 | 3

/**
 * `role="heading"` is typed in react-native; `aria-level` is not on its Text props but
 * react-native-web reads it (createDOMProps) to pick the element, and native ignores it. Spread
 * as an object, so no cast is needed and the extra key is not excess-property checked.
 */
const headingProps = (
  level: HeadingLevel,
): { readonly role: "heading"; readonly "aria-level": HeadingLevel } => ({
  role: "heading",
  "aria-level": level,
})

/**
 * The only way to set a font size outside `src/ui`: a ramp variant plus a colour tone. The family
 * comes with the variant (display face on numeral/display/title, platform font elsewhere).
 */
export function Text({
  variant = "body",
  tone = "default",
  glow = false,
  tabular = false,
  headingLevel,
  style,
  ...rest
}: TextProps) {
  const { colors } = useTheme()
  const shadow = glow ? { textShadowColor: colors.glow, textShadowRadius: glowRadius } : undefined
  return (
    <RNText
      {...rest}
      {...(headingLevel === undefined ? {} : headingProps(headingLevel))}
      style={[
        type[variant],
        { color: colors[toneRole[tone]] },
        tabular ? tabularStyle : undefined,
        shadow,
        style,
      ]}
    />
  )
}
