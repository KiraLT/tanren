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
}

/**
 * The only way to set a font size outside `src/ui`: a ramp variant plus a colour tone. The family
 * comes with the variant (display face on numeral/display/title, platform font elsewhere).
 */
export function Text({
  variant = "body",
  tone = "default",
  glow = false,
  tabular = false,
  style,
  ...rest
}: TextProps) {
  const { colors } = useTheme()
  const shadow = glow ? { textShadowColor: colors.glow, textShadowRadius: glowRadius } : undefined
  return (
    <RNText
      {...rest}
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
