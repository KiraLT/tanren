import { Option } from "effect"
import { useState } from "react"
import { useWindowDimensions, View } from "react-native"
import type { ExerciseSummary } from "../../hooks/useHistory"
import { ExerciseIllustration } from "../../library/ExerciseIllustration"
import { ListRow, sizes, Text } from "../../ui"
import { illustrationIdFor } from "../todayHeader"
import { e1RmText, formatLoggedDate, formatSetText } from "./progressFormat"
import { fitRowDetail, rowDetailMaxChars } from "./rowDetail"

interface ExerciseRowProps {
  readonly summary: ExerciseSummary
  readonly selected: boolean
  readonly onPress: () => void
}

/** 56 px illustration, name (headline), `best set · e1RM` (subhead; best set only when bodyweight), last-logged day. */
export function ExerciseRow({ summary, selected, onPress }: ExerciseRowProps) {
  const best = formatSetText(summary.best.weightKg, summary.best.reps)
  const e1Rm = e1RmText(summary.best.weightKg, summary.bestE1Rm)
  const last = formatLoggedDate(summary.lastLoggedAt)
  // One line at any width: the row's own width (first guess: the window) decides whether the e1RM
  // part fits; the cut is at the separator (`fitRowDetail`), and `subtitleLines` backs it up.
  const { width: windowWidth } = useWindowDimensions()
  const [rowWidth, setRowWidth] = useState(windowWidth)
  const detail = fitRowDetail(best, e1Rm, rowDetailMaxChars(rowWidth))
  const spoken = Option.match(e1Rm, {
    onNone: () => `best set ${best}`,
    onSome: (text) => `best set ${best}, ${text}`,
  })
  return (
    <View onLayout={({ nativeEvent }) => setRowWidth(nativeEvent.layout.width)}>
      <ListRow
        thumb
        leading={
          <ExerciseIllustration
            catalogId={illustrationIdFor(summary.exercise)}
            size={sizes.illustrationSm}
          />
        }
        title={summary.exercise.name}
        subtitle={detail}
        subtitleLines={1}
        trailing={
          <Text variant="caption" tone="muted" tabular>
            {last}
          </Text>
        }
        selected={selected}
        onPress={onPress}
        accessibilityLabel={`${summary.exercise.name}, ${spoken}, last logged ${last}`}
      />
    </View>
  )
}
