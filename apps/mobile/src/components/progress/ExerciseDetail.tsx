import type { ExerciseId } from "@tanren/shared"
import { Array as Arr, Match, Option } from "effect"
import { View } from "react-native"
import { type ExerciseHistory, type HistoryState, useExerciseHistory } from "../../hooks/useHistory"
import { MuscleMap } from "../../illustrations/muscleMap/MuscleMap"
import {
  Card,
  EmptyState,
  ListGroup,
  ListRow,
  Skeleton,
  StatusPill,
  sizes,
  space,
  Text,
} from "../../ui"
import { ExerciseThumb } from "./ProgressRows"
import { bestSetParts, formatE1Rm, formatLoggedDate, formatSetText } from "./progressFormat"
import { Sparkline } from "./Sparkline"
import { WeekBars } from "./WeekBars"

function DetailSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading exercise" style={{ gap: space.lg }}>
      <Skeleton width="50%" height={32} />
      <Skeleton width="100%" height={88} />
      <Skeleton width="100%" height={140} />
      <Skeleton width="100%" height={110} />
    </View>
  )
}

interface DetailProps {
  readonly history: ExerciseHistory
}

/**
 * The screen's one bold element: the best set's weight as the `numeral` with its unit line under it
 * (`label`). The best set strictly beats every earlier set, so it is always a personal record.
 */
function BestSetCard({ history }: DetailProps) {
  return (
    <Card>
      {Option.match(history.best, {
        onNone: () => <Text tone="muted">No sets logged yet.</Text>,
        onSome: (best) => {
          const parts = bestSetParts(best.weightKg, best.reps)
          return (
            <View
              accessible
              accessibilityLabel={`Best set ${formatSetText(best.weightKg, best.reps)}, ${formatE1Rm(history.bestE1Rm)}, personal record`}
              style={{ gap: space.xs }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text variant="caption" tone="muted">
                  Best set
                </Text>
                <StatusPill label="PR" tone="accent" />
              </View>
              <Text variant="numeral" glow style={{ paddingVertical: space.xs }}>
                {parts.value}
              </Text>
              <Text variant="label" tone="muted">
                {parts.unit}
              </Text>
              <Text variant="subhead" tone="muted">
                {formatE1Rm(history.bestE1Rm)}
              </Text>
            </View>
          )
        },
      })}
    </Card>
  )
}

function RecentSessions({ history }: DetailProps) {
  if (history.recent.length === 0) {
    return null
  }
  return (
    <View style={{ gap: space.lg }}>
      <Text variant="caption" tone="muted" accessibilityRole="header">
        Recent sessions
      </Text>
      {Arr.map(history.recent, ({ session, sets }) => (
        <View key={session.id} style={{ gap: space.sm }}>
          <Text variant="caption" tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
            {formatLoggedDate(session.startedAt)}
          </Text>
          <ListGroup>
            {Arr.map(sets, (set, index) => (
              <ListRow
                key={set.id}
                leading={
                  <Text variant="caption" tone="muted" style={{ minWidth: space.xxl }}>
                    {`Set ${index + 1}`}
                  </Text>
                }
                title={formatSetText(set.weightKg, set.reps)}
                trailing={set.isPr ? <StatusPill label="PR" tone="accent" /> : undefined}
                accessibilityLabel={`Set ${index + 1}, ${formatSetText(set.weightKg, set.reps)}${set.isPr ? ", personal record" : ""}`}
              />
            ))}
          </ListGroup>
        </View>
      ))}
    </View>
  )
}

function DetailReady({ history }: DetailProps) {
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.lg }}>
        <ExerciseThumb catalogId={history.exercise.catalogId} size={sizes.illustrationMd} />
        <Text variant="title2" accessibilityRole="header" style={{ flex: 1 }}>
          {history.exercise.name}
        </Text>
      </View>
      <MuscleMap primary={history.exercise.muscleGroups} secondary={[]} size={200} />
      <BestSetCard history={history} />
      <Card style={{ gap: space.md }}>
        <Text variant="headline">Volume, last 8 weeks</Text>
        <WeekBars weeks={history.weeks} />
      </Card>
      <Card style={{ gap: space.md }}>
        <Text variant="headline">Estimated 1RM</Text>
        <Sparkline trend={history.e1RmTrend} />
      </Card>
      <RecentSessions history={history} />
    </View>
  )
}

const renderState = Match.type<HistoryState<Option.Option<ExerciseHistory>>>().pipe(
  Match.tagsExhaustive({
    Loading: () => <DetailSkeleton />,
    Failed: ({ message }) => (
      <EmptyState icon="warning" title="Could not load this exercise" body={message} />
    ),
    Ready: ({ value }) =>
      Option.match(value, {
        onNone: () => (
          <EmptyState title="Exercise not found" body="It is not on this device (any more)." />
        ),
        onSome: (history) => <DetailReady history={history} />,
      }),
  }),
)

interface ExerciseDetailProps {
  readonly exerciseId: ExerciseId
}

/** One exercise's progress: best set, 8-week volume bars, e1RM trend, recent sessions. */
export function ExerciseDetail({ exerciseId }: ExerciseDetailProps) {
  const { state } = useExerciseHistory(exerciseId)
  return renderState(state)
}
