import { Array as Arr, Option } from "effect"
import { useState } from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"
import type { LogSetInput, TodayExercise } from "../hooks/useToday"
import { BigButton } from "./BigButton"
import { SetList } from "./SetList"
import { Stepper } from "./Stepper"
import { formatKg, stepReps, stepWeight } from "./stepMath"
import { colors, sizes, space } from "./theme"

interface ExercisePageProps {
  readonly item: TodayExercise
  readonly width: number
  readonly pending: boolean
  readonly logSet: (input: LogSetInput) => Promise<boolean>
  /** Called once the set is stored locally; starts the rest timer. */
  readonly onLogged: (restSeconds: number) => void
}

interface SetEntryProps {
  readonly item: TodayExercise
  readonly pending: boolean
  readonly logSet: (input: LogSetInput) => Promise<boolean>
  readonly onLogged: (restSeconds: number) => void
}

/**
 * Prefilled weight and reps with steppers and one "Log set" button. The parent keys it by the
 * number of logged sets, so after a log the entry remounts with the next set's prefill.
 */
function SetEntry({ item, pending, logSet, onLogged }: SetEntryProps) {
  const [weightKg, setWeightKg] = useState(item.prefill.weightKg)
  const [reps, setReps] = useState(item.prefill.reps)
  const setNumber = item.loggedSets.length + 1
  const log = () => {
    const plannedSetId = Option.map(Arr.get(item.plannedSets, item.loggedSets.length), (s) => s.id)
    return logSet({
      exerciseId: item.exercise.id,
      plannedSetId,
      weightKg,
      reps,
      rpe: Option.none(),
    }).then((logged) => (logged ? onLogged(item.restSeconds) : undefined))
  }
  return (
    <View style={styles.entry}>
      <Stepper
        label="Weight"
        valueText={formatKg(weightKg)}
        unit="kg"
        onDecrement={() => setWeightKg(stepWeight(weightKg, -1))}
        onIncrement={() => setWeightKg(stepWeight(weightKg, 1))}
      />
      <Stepper
        label="Reps"
        valueText={String(reps)}
        unit="reps"
        onDecrement={() => setReps(stepReps(reps, -1))}
        onIncrement={() => setReps(stepReps(reps, 1))}
      />
      <BigButton
        label={`LOG SET ${setNumber}`}
        accessibilityLabel={`Log set ${setNumber}: ${formatKg(weightKg)} kilograms, ${reps} reps`}
        variant="primary"
        height={sizes.logButton}
        disabled={pending}
        onPress={() => {
          log()
        }}
      />
    </View>
  )
}

const progressText = (item: TodayExercise): string => {
  const planned = item.plannedSets.length
  const logged = item.loggedSets.length
  return planned === 0
    ? `${logged} logged`
    : logged >= planned
      ? `All ${planned} planned sets done`
      : `Set ${logged + 1} of ${planned}`
}

/** One exercise, one page: name, planned/logged sets, and the logging controls. */
export function ExercisePage({ item, width, pending, logSet, onLogged }: ExercisePageProps) {
  return (
    <ScrollView style={{ width }} contentContainerStyle={styles.content}>
      <View style={styles.heading}>
        <Text style={styles.name} accessibilityRole="header">
          {item.exercise.name}
        </Text>
        <Text style={styles.progress}>{progressText(item)}</Text>
      </View>
      <SetList plannedSets={item.plannedSets} loggedSets={item.loggedSets} />
      <SetEntry
        key={`${item.exercise.id}-${item.loggedSets.length}`}
        item={item}
        pending={pending}
        logSet={logSet}
        onLogged={onLogged}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.lg, paddingBottom: space.xl },
  heading: { gap: 4 },
  name: { color: colors.text, fontSize: 36, fontWeight: "900", lineHeight: 42 },
  progress: { color: colors.accent, fontSize: 18, fontWeight: "700" },
  entry: { gap: space.lg },
})
