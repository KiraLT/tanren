import type { PlannedSession } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import { type ReactNode, useState } from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"
import { useLayoutMode } from "../hooks/useLayoutMode"
import { useLogSet } from "../hooks/useLogSet"
import { useRestTimer } from "../hooks/useRestTimer"
import type { TodayExercise } from "../hooks/useToday"
import { clampPage, ExercisePager } from "./ExercisePager"
import { RestTimerBar } from "./RestTimerBar"
import { Screen } from "./Screen"
import { SetList } from "./SetList"
import { colors, space } from "./theme"

interface TodayReadyProps {
  readonly plannedSession: PlannedSession
  readonly exercises: ReadonlyArray<TodayExercise>
}

interface TodayAsideProps {
  readonly current: Option.Option<TodayExercise>
  readonly rest: ReactNode
}

/** Wide layout only: the current exercise's sets and the rest timer. Read-only, no log button. */
function TodayAside({ current, rest }: TodayAsideProps) {
  return (
    <View style={styles.aside}>
      <ScrollView contentContainerStyle={styles.asideContent}>
        {Option.match(current, {
          onNone: () => null,
          onSome: (item) => (
            <>
              <Text style={styles.asideTitle} accessibilityRole="header">
                Sets · {item.exercise.name}
              </Text>
              <SetList plannedSets={item.plannedSets} loggedSets={item.loggedSets} />
            </>
          ),
        })}
      </ScrollView>
      {rest}
    </View>
  )
}

/**
 * Today's session: title, the exercise pager, store errors, and the rest timer. In the two-column
 * layout the rest timer moves to the aside, next to the current exercise's sets.
 */
export function TodayReady({ plannedSession, exercises }: TodayReadyProps) {
  const { logSet, pending, error } = useLogSet()
  const { remaining, start, stop } = useRestTimer()
  const [page, setPage] = useState(0)
  const wide = useLayoutMode() === "two-column"
  const current = Arr.get(exercises, clampPage(page, exercises.length))
  const rest = <RestTimerBar remaining={remaining} onSkip={stop} />
  return (
    <Screen aside={<TodayAside current={current} rest={rest} />}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.caption}>TODAY</Text>
          <Text style={styles.title} accessibilityRole="header">
            {plannedSession.name}
          </Text>
        </View>
        <ExercisePager
          exercises={exercises}
          pending={pending}
          logSet={logSet}
          onLogged={start}
          index={page}
          onIndexChange={setPage}
          showSets={!wide}
        />
        {Option.match(error, {
          onNone: () => null,
          onSome: (message) => (
            <Text style={styles.error} accessibilityRole="alert">
              Could not log the set: {message}
            </Text>
          ),
        })}
        {wide ? null : rest}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.md },
  caption: { color: colors.accent, fontSize: 14, fontWeight: "800", letterSpacing: 3 },
  title: { color: colors.textMuted, fontSize: 20, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 18, fontWeight: "700", padding: space.md },
  aside: { flex: 1 },
  asideContent: { padding: space.md, paddingTop: space.lg, gap: space.md },
  asideTitle: { color: colors.text, fontSize: 22, fontWeight: "900" },
})
