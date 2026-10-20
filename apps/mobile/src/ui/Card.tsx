import type { ReactNode } from "react"
import { Pressable, type StyleProp, View, type ViewStyle } from "react-native"
import type { ColorRoles } from "./colors"
import { usePressableInteraction } from "./interaction"
import { useTheme } from "./theme"
import { radius, space, stroke, type Tone } from "./tokens"

const toneBackground: { readonly [T in Tone]: keyof ColorRoles } = {
  neutral: "surface",
  accent: "accentSoft",
  success: "successSoft",
  danger: "dangerSoft",
}

export interface CardProps {
  readonly children: ReactNode
  /** Makes the card pressable; give it an `accessibilityLabel` then. */
  readonly onPress?: () => void
  readonly accessibilityLabel?: string
  readonly selected?: boolean
  readonly tone?: Tone
  readonly padding?: number
  readonly style?: StyleProp<ViewStyle>
}

/** Flat surface with a hairline border, no shadow; `selected` adds a 2 px accent outline. */
export function Card({
  children,
  onPress,
  accessibilityLabel,
  selected = false,
  tone = "neutral",
  padding = space.lg,
  style,
}: CardProps) {
  const { colors } = useTheme()
  const base: ViewStyle = {
    padding,
    borderRadius: radius.md,
    borderCurve: "continuous",
    backgroundColor: selected ? colors.accentSoft : colors[toneBackground[tone]],
    borderWidth: selected ? stroke.outline : stroke.hairline,
    borderColor: selected ? colors.accent : colors.border,
  }
  if (onPress === undefined) {
    return <View style={[base, style]}>{children}</View>
  }
  return (
    <PressableCard
      base={base}
      hoverBackground={selected ? colors.accentSoft : colors.surfaceRaised}
      onPress={onPress}
      selected={selected}
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      {children}
    </PressableCard>
  )
}

interface PressableCardProps {
  readonly children: ReactNode
  readonly base: ViewStyle
  readonly hoverBackground: string
  readonly onPress: () => void
  readonly selected: boolean
  readonly accessibilityLabel: string | undefined
  readonly style: StyleProp<ViewStyle> | undefined
}

/** The pressable half of `Card`: hover tint and focus ring live in their own hook scope. */
function PressableCard({
  children,
  base,
  hoverBackground,
  onPress,
  selected,
  accessibilityLabel,
  style,
}: PressableCardProps) {
  const { hovered, handlers, focusStyle } = usePressableInteraction()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      {...handlers}
      {...(accessibilityLabel === undefined ? {} : { accessibilityLabel })}
      style={({ pressed }) => [
        base,
        hovered && { backgroundColor: hoverBackground },
        pressed && { opacity: 0.85 },
        focusStyle,
        style,
      ]}
    >
      {children}
    </Pressable>
  )
}
