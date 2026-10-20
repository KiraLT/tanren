import { useEffect, useRef } from "react"
import {
  Animated,
  type DimensionValue,
  Platform,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native"
import { useTheme } from "./theme"
import { motion, radius as radii } from "./tokens"

export interface SkeletonProps {
  readonly width: DimensionValue
  readonly height: DimensionValue
  readonly radius?: number
  readonly style?: StyleProp<ViewStyle>
}

/** One pulse half-cycle: the full .5↔1 cycle lasts `motion.slow` × 3. */
const HALF_CYCLE = (motion.slow * 3) / 2

/**
 * A placeholder block that pulses (static under reduced motion). Decorative: the screen's skeleton
 * container carries `accessibilityLabel="Loading …"`.
 */
export function Skeleton({ width, height, radius = radii.sm, style }: SkeletonProps) {
  const { colors, reducedMotion } = useTheme()
  const opacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1)
      return undefined
    }
    const useNativeDriver = Platform.OS !== "web"
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: HALF_CYCLE, useNativeDriver }),
        Animated.timing(opacity, { toValue: 1, duration: HALF_CYCLE, useNativeDriver }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [opacity, reducedMotion])
  // The outer View carries the hiding props: `Animated.View` forwards them to the DOM on web,
  // where React warns about unknown props, while `View` maps them to `aria-hidden`.
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={[
          { width, height, borderRadius: radius, backgroundColor: colors.surface, opacity },
          style,
        ]}
      />
    </View>
  )
}
