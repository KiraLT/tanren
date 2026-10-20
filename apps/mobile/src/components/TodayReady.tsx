import type { PlannedSession } from "@tanren/shared"
import { Option } from "effect"
import { StyleSheet, Text, View } from "react-native"
import { useLogSet } from "../hooks/useLogSet"
import { useRestTimer } from "../hooks/useRestTimer"
import type { TodayExercise } from "../hooks/useToday"
import { ExercisePager } from "./ExercisePager"
import { RestTimerBar } from "./RestTimerBar"
import { colors, space } from "./theme"

interface TodayReadyProps {
  readonly plannedSession: PlannedSession
  readonly exercises: ReadonlyArray<TodayExercise>
}

/** Today's session: title, the exercise pager, store errors, and the rest timer. */
export function TodayReady({ plannedSession, exercises }: TodayReadyProps) {
  const { logSet, pending, error } = useLogSet()
  const { remaining, start, stop } = useRestTimer()
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.caption}>TODAY</Text>
        <Text style={styles.title} accessibilityRole="header">
          {plannedSession.name}
        </Text>
      </View>
      <ExercisePager exercises={exercises} pending={pending} logSet={logSet} onLogged={start} />
      {Option.match(error, {
        onNone: () => null,
        onSome: (message) => (
          <Text style={styles.error} accessibilityRole="alert">
            Could not log the set: {message}
          </Text>
        ),
      })}
      <RestTimerBar remaining={remaining} onSkip={stop} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.md },
  caption: { color: colors.accent, fontSize: 14, fontWeight: "800", letterSpacing: 3 },
  title: { color: colors.textMuted, fontSize: 20, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 18, fontWeight: "700", padding: space.md },
})
