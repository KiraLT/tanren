import type { ReactNode } from "react"
import { type StyleProp, View, type ViewStyle } from "react-native"
import Svg, { Circle } from "react-native-svg"
import { useTheme } from "./theme"

/** `neutral` draws the arc in `text`, for screens where an accented button sits beside the ring. */
export type TimerRingTone = "accent" | "success" | "neutral"

const toneRole = { accent: "accent", success: "success", neutral: "text" } as const

export interface TimerRingProps {
  /** Fraction of the rest remaining, 0..1 (clamped). */
  readonly progress: number
  readonly size?: number
  readonly strokeWidth?: number
  readonly tone?: TimerRingTone
  /** Usually the `numeral` clock; the caller supplies the accessible label. */
  readonly children?: ReactNode
  readonly accessibilityLabel?: string
  readonly style?: StyleProp<ViewStyle>
}

const clamp01 = (value: number): number =>
  Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value))

/** Rest ring: a `border` track and an arc that shrinks clockwise from 12 o'clock; no animation. */
export function TimerRing({
  progress,
  size = 220,
  strokeWidth = 12,
  tone = "accent",
  children,
  accessibilityLabel,
  style,
}: TimerRingProps) {
  const { colors } = useTheme()
  const r = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * r
  const centre = size / 2
  return (
    <View
      accessible
      accessibilityRole="timer"
      {...(accessibilityLabel === undefined ? {} : { accessibilityLabel })}
      style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}
    >
      <Svg
        width={size}
        height={size}
        style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          cx={centre}
          cy={centre}
          r={r}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={centre}
          cy={centre}
          r={r}
          stroke={colors[toneRole[tone]]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={[circumference, circumference]}
          strokeDashoffset={circumference * (1 - clamp01(progress))}
          fill="none"
        />
      </Svg>
      {children}
    </View>
  )
}
