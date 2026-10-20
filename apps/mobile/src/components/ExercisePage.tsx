import { Array as Arr, Option } from "effect"
import { useState } from "react"
import { ScrollView, View } from "react-native"
import type { LogSetInput, TodayExercise } from "../hooks/useToday"
import { Button, gutter, Stepper, sizes, space, Text, useBreakpoint } from "../ui"
import { SetList } from "./SetList"
import { formatKg, stepReps, stepWeight } from "./stepMath"

interface ExercisePageProps {
  readonly item: TodayExercise
  readonly width: number
  readonly pending: boolean
  readonly logSet: (input: LogSetInput) => Promise<boolean>
  /** Called once the set is stored locally; starts the rest timer. */
  readonly onLogged: (restSeconds: number) => void
  /** Show the set list on the page; false in the wide layout, where the aside shows it. */
  readonly showSets?: boolean
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
    <View style={{ gap: space.xl }}>
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
      <Button
        label={`Log set ${setNumber}`}
        accessibilityLabel={`Log set ${setNumber}: ${formatKg(weightKg)} kilograms, ${reps} reps`}
        variant="primary"
        size="xl"
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
export function ExercisePage({
  item,
  width,
  pending,
  logSet,
  onLogged,
  showSets = true,
}: ExercisePageProps) {
  const breakpoint = useBreakpoint()
  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={{
        paddingHorizontal: gutter[breakpoint],
        paddingTop: space.sm,
        paddingBottom: sizes.logButton,
        gap: space.xl,
      }}
    >
      <View style={{ gap: space.xs }}>
        <Text variant="display" accessibilityRole="header">
          {item.exercise.name}
        </Text>
        <Text variant="subhead" tone="muted">
          {progressText(item)}
        </Text>
      </View>
      {showSets ? <SetList plannedSets={item.plannedSets} loggedSets={item.loggedSets} /> : null}
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
