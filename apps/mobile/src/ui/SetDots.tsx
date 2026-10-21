import { Array as Arr } from "effect"
import { type StyleProp, View, type ViewStyle } from "react-native"
import { setDotStates, setDotStyle } from "./controls"
import { useTheme } from "./theme"
import { space } from "./tokens"

export interface SetDotsProps {
  readonly total: number
  /** Sets logged so far; the next one is drawn as the wide `now` dot. */
  readonly completed: number
  readonly accessibilityLabel: string
  readonly style?: StyleProp<ViewStyle>
}

/** Set progress (§5): 8 px dots, done `success`, now `accent` 16 px wide, todo `border`. */
export function SetDots({ total, completed, accessibilityLabel, style }: SetDotsProps) {
  const { colors } = useTheme()
  const states = setDotStates(total, completed)
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
      style={[{ flexDirection: "row", alignItems: "center", gap: space.xs }, style]}
    >
      {Arr.map(states, (state, index) => (
        <View key={`dot-${index}`} style={setDotStyle(state, colors)} />
      ))}
    </View>
  )
}
