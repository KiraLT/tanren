import { Array as Arr, Option } from "effect"
import { useState } from "react"
import { ScrollView, View } from "react-native"
import { formatClock } from "../hooks/restClock"
import type { LogSetInput, TodayExercise } from "../hooks/useToday"
import { ExerciseIllustration } from "../library/ExerciseIllustration"
import {
  Button,
  gutter,
  Icon,
  SetDots,
  StatRow,
  Stepper,
  sizes,
  space,
  stepperSizeFor,
  stroke,
  Text,
  useBreakpoint,
  useColumns,
  useTheme,
} from "../ui"
import { exerciseStats } from "./exerciseStats"
import { SetList } from "./SetList"
import { formatKg, stepReps, stepWeight } from "./stepMath"
import { illustrationIdFor, lastSetText } from "./todayHeader"

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
 * Prefilled weight and reps with borderless steppers (a hairline between them, a 24 gap on phone) and the one
 * bold element on the screen, "Log set". The parent keys it by the number of logged sets, so
 * after a log the entry remounts with the next set's prefill.
 */
function SetEntry({ item, pending, logSet, onLogged }: SetEntryProps) {
  const { colors } = useTheme()
  const breakpoint = useBreakpoint()
  const phone = breakpoint === "phone"
  const desktop = breakpoint === "desktop"
  // The block is the page column less both gutters, capped at 560: 696 -> 560 (xxl), 404 -> 340 (xl).
  const { main } = useColumns()
  const stepperSize = desktop
    ? stepperSizeFor(Math.min(sizes.controlMaxWidth, main - 2 * gutter.desktop))
    : "xl"
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
    <View
      style={[
        { gap: space.lg },
        // Desktop: the controls stay a centred 560 block, the numerals are the 96 step.
        desktop ? { alignSelf: "center", width: "100%", maxWidth: sizes.controlMaxWidth } : null,
      ]}
    >
      <View style={phone ? { gap: space.xl } : undefined}>
        <Stepper
          label="Weight"
          size={stepperSize}
          valueText={formatKg(weightKg)}
          unit="kg"
          onDecrement={() => setWeightKg(stepWeight(weightKg, -1))}
          onIncrement={() => setWeightKg(stepWeight(weightKg, 1))}
          style={phone ? undefined : { paddingBottom: space.sm }}
        />
        <Stepper
          label="Reps"
          size={stepperSize}
          valueText={String(reps)}
          unit="reps"
          onDecrement={() => setReps(stepReps(reps, -1))}
          onIncrement={() => setReps(stepReps(reps, 1))}
          style={
            phone
              ? undefined
              : {
                  paddingTop: space.sm,
                  borderTopWidth: stroke.hairline,
                  borderTopColor: colors.border,
                }
          }
        />
      </View>
      <Button
        label="Log set"
        icon="check"
        accessibilityLabel={`Log set ${setNumber}: ${formatKg(weightKg)} kilograms, ${reps} reps`}
        variant="primary"
        size="xl"
        disabled={pending}
        onPress={() => {
          log()
        }}
      />
      {desktop ? (
        // One desktop stat rule (ui-desktop §stat rows): in-card tiles; dense when the block is
        // narrow (900: 340 -> 3 x 108 with 12 padding). Phone/tablet never reach this branch.
        <StatRow variant="tile" dense={stepperSize === "xl"} items={exerciseStats(item)} />
      ) : (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: space.sm,
          }}
        >
          <Icon name="timer" size={sizes.iconSm} color={colors.textMuted} />
          <Text variant="subhead" tone="muted">
            Rest {formatClock(item.restSeconds)} starts after the set
          </Text>
        </View>
      )}
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

/** Illustration (when the exercise maps to the catalog) beside name, set dots and the last set. */
function ExerciseHead({ item }: { readonly item: TodayExercise }) {
  const { colors } = useTheme()
  const desktop = useBreakpoint() === "desktop"
  const planned = item.plannedSets.length
  const logged = item.loggedSets.length
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.lg,
        paddingBottom: space.lg,
        borderBottomWidth: stroke.hairline,
        borderBottomColor: colors.border,
      }}
    >
      <ExerciseIllustration
        catalogId={illustrationIdFor(item.exercise)}
        size={desktop ? sizes.illustrationLg : sizes.illustrationMd}
      />
      <View style={{ flex: 1, gap: space.xs }}>
        <Text variant="display" accessibilityRole="header">
          {item.exercise.name}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Text variant="subhead">{progressText(item)}</Text>
          {planned === 0 ? null : (
            <SetDots
              variant="pill"
              total={planned}
              completed={logged}
              accessibilityLabel={`${Math.min(logged, planned)} of ${planned} sets done`}
            />
          )}
        </View>
        <Text variant="subhead" tone="muted">
          {lastSetText(item.loggedSets, item.prefill)}
        </Text>
      </View>
    </View>
  )
}

/** One exercise, one page: the head, the logging controls, then the planned/logged sets. */
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
        paddingTop: space.lg,
        paddingBottom: space.xxl,
        gap: space.lg,
      }}
    >
      <ExerciseHead item={item} />
      <SetEntry
        key={`${item.exercise.id}-${item.loggedSets.length}`}
        item={item}
        pending={pending}
        logSet={logSet}
        onLogged={onLogged}
      />
      {showSets ? <SetList plannedSets={item.plannedSets} loggedSets={item.loggedSets} /> : null}
    </ScrollView>
  )
}
