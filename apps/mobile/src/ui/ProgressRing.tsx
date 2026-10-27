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

export interface RingArcProps {
  /** Centre of the parent `Svg` (px). */
  readonly centre: number
  /** This ring's outer diameter, stroke included; nested rings pass a smaller one. */
  readonly diameter: number
  readonly stroke: number
  /** Fraction drawn, 0..1 (clamped). */
  readonly progress: number
  readonly color: string
  readonly trackColor: string
}

/**
 * One track + round-capped arc, the drawing every ring shares (`ProgressRing`, `HealthRings`). The
 * parent `Svg` is rotated -90deg so the arc starts at 12 o'clock and fills clockwise.
 */
export function RingArc({ centre, diameter, stroke, progress, color, trackColor }: RingArcProps) {
  const ring = ringGeometry(diameter, stroke, progress)
  return (
    <>
      <Circle
        cx={centre}
        cy={centre}
        r={ring.r}
        stroke={trackColor}
        strokeWidth={stroke}
        fill="none"
      />
      <Circle
        cx={centre}
        cy={centre}
        r={ring.r}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={[ring.circumference, ring.circumference]}
        strokeDashoffset={ring.dashOffset}
        fill="none"
      />
    </>
  )
}

/** Centres `children` over a `size` ring (absolutely positioned, ignores touches). */
export function RingOverlay({
  size,
  children,
}: {
  readonly size: number
  readonly children: ReactNode
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </View>
  )
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
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamp01(progress) * 100) }}
      style={[{ width: spec.size, height: spec.size }, style]}
    >
      <Svg width={spec.size} height={spec.size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <RingArc
          centre={spec.size / 2}
          diameter={spec.size}
          stroke={spec.stroke}
          progress={progress}
          color={colors.accent}
          trackColor={colors.border}
        />
      </Svg>
      {children === undefined ? null : <RingOverlay size={spec.size}>{children}</RingOverlay>}
    </View>
  )
}
