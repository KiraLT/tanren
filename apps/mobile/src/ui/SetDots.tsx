import { Array as Arr } from "effect"
import { type StyleProp, View, type ViewStyle } from "react-native"
import {
  SET_PILL_GAP,
  type SetDotsVariant,
  setDotStates,
  setDotStyle,
  setPillStyle,
} from "./controls"
import { useTheme } from "./theme"
import { space } from "./tokens"

export interface SetDotsProps {
  readonly total: number
  /** Sets logged so far; the next one is drawn as the wide `now` dot. */
  readonly completed: number
  readonly accessibilityLabel: string
  /** `dot` (default): 8 px dots; `pill`: 10 x 6 marks, done `textMuted`, now 16 x 6 `accent`. */
  readonly variant?: SetDotsVariant
  readonly style?: StyleProp<ViewStyle>
}

/** Set progress (§5): 8 px dots, done `success`, now `accent` 16 px wide, todo `border`. */
export function SetDots({
  total,
  completed,
  accessibilityLabel,
  variant = "dot",
  style,
}: SetDotsProps) {
  const { colors } = useTheme()
  const states = setDotStates(total, completed)
  const markStyle = variant === "pill" ? setPillStyle : setDotStyle
  const gap = variant === "pill" ? SET_PILL_GAP : space.xs
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{
        min: 0,
        max: states.length,
        now: Arr.filter(states, (s) => s === "done").length,
      }}
      style={[{ flexDirection: "row", alignItems: "center", gap }, style]}
    >
      {Arr.map(states, (state, index) => (
        <View key={`dot-${index}`} style={markStyle(state, colors)} />
      ))}
    </View>
  )
}
