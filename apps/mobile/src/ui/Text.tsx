import { Text as RNText, type TextProps as RNTextProps } from "react-native"
import type { ColorRoles } from "./colors"
import { useTheme } from "./theme"
import { type TypeVariant, type } from "./tokens"

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
}

/** The only way to set a font size outside `src/ui`: a ramp variant plus a colour tone. */
export function Text({ variant = "body", tone = "default", style, ...rest }: TextProps) {
  const { colors } = useTheme()
  return <RNText {...rest} style={[type[variant], { color: colors[toneRole[tone]] }, style]} />
}
