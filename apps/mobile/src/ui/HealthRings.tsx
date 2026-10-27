import type { ReactNode } from "react"
import { type StyleProp, View, type ViewStyle } from "react-native"
import Svg from "react-native-svg"
import { RingArc, RingOverlay } from "./ProgressRing"
import { useTheme } from "./theme"

/** Gap between the outer and the inner ring (docs/design/health-module.md §5). */
const RING_GAP = 4

export interface HealthRingsProps {
  /** Outer diameter: 104 on the Today module, 176 / 240 on the `/health` hero. */
  readonly size: 104 | 176 | 240
  /** Both rings' stroke (10 / 12 / 14). */
  readonly stroke: number
  /** Eaten / budget; `danger` when over budget (pass progress 1). */
  readonly outer: { readonly progress: number; readonly tone: "accent" | "danger" }
  /** Protein / target. */
  readonly inner: { readonly progress: number; readonly tone: "success" }
  /** No targets: both arcs at 0, tracks only. */
  readonly empty?: boolean
  /** Both fractions in words, e.g. "Eaten 46 percent of budget, protein 62 percent of target". */
  readonly accessibilityLabel: string
  /** Centred over the rings (absolutely positioned, ignores touches). */
  readonly children?: ReactNode
  readonly style?: StyleProp<ViewStyle>
}

/**
 * Two concentric arcs on `border` tracks (§5): eaten / budget outside, protein / target inside, both
 * starting at 12 o'clock. Outer r = size/2 - stroke/2, inner r = outer r - stroke - 4. Static (no
 * animation); one `image` role, since a single progressbar would misreport two values.
 */
export function HealthRings({
  size,
  stroke,
  outer,
  inner,
  empty = false,
  accessibilityLabel,
  children,
  style,
}: HealthRingsProps) {
  const { colors } = useTheme()
  const centre = size / 2
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[{ width: size, height: size }, style]}
    >
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <RingArc
          centre={centre}
          diameter={size}
          stroke={stroke}
          progress={empty ? 0 : outer.progress}
          color={colors[outer.tone]}
          trackColor={colors.border}
        />
        <RingArc
          centre={centre}
          diameter={size - 2 * (stroke + RING_GAP)}
          stroke={stroke}
          progress={empty ? 0 : inner.progress}
          color={colors[inner.tone]}
          trackColor={colors.border}
        />
      </Svg>
      {children === undefined ? null : <RingOverlay size={size}>{children}</RingOverlay>}
    </View>
  )
}
