import type { ReactNode } from "react"
import { type StyleProp, View, type ViewStyle } from "react-native"
import Svg, { Circle } from "react-native-svg"
import { clamp01, type RingSize, ringGeometry, ringSpec } from "./controls"
import { useTheme } from "./theme"

export type { RingSize } from "./controls"

export interface ProgressRingProps {
  /** Fraction done, 0..1 (clamped). */
  readonly progress: number
  /** `sm` 20 / 3 stroke (app bar eyebrow), `md` 44 / 4 stroke (cards). */
  readonly size?: RingSize
  /** Stroke width in px, overriding the size preset's. */
  readonly stroke?: number
  /** Outer diameter in px, overriding the size preset's (e.g. the Player's 220 ring). */
  readonly diameter?: number
  /** Centred over the ring (absolutely positioned, ignores touches). */
  readonly children?: ReactNode
  readonly accessibilityLabel: string
  readonly style?: StyleProp<ViewStyle>
}

/** A small `accent` arc on a `border` track, filling clockwise from 12 o'clock (§5 progress marks). */
export function ProgressRing({
  progress,
  size = "sm",
  stroke,
  diameter,
  children,
  accessibilityLabel,
  style,
}: ProgressRingProps) {
  const { colors } = useTheme()
  const spec = ringSpec(size, { stroke, diameter })
  const ring = ringGeometry(spec.size, spec.stroke, progress)
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamp01(progress) * 100) }}
      style={[{ width: spec.size, height: spec.size }, style]}
    >
      <Svg width={spec.size} height={spec.size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle
          cx={ring.centre}
          cy={ring.centre}
          r={ring.r}
          stroke={colors.border}
          strokeWidth={spec.stroke}
          fill="none"
        />
        <Circle
          cx={ring.centre}
          cy={ring.centre}
          r={ring.r}
          stroke={colors.accent}
          strokeWidth={spec.stroke}
          strokeLinecap="round"
          strokeDasharray={[ring.circumference, ring.circumference]}
          strokeDashoffset={ring.dashOffset}
          fill="none"
        />
      </Svg>
      {children === undefined ? null : (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: spec.size,
            height: spec.size,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {children}
        </View>
      )}
    </View>
  )
}
