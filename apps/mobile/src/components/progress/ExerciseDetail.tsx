import type { ExerciseId } from "@tanren/shared"
import { Array as Arr, Match, Option } from "effect"
import { View } from "react-native"
import { type ExerciseHistory, type HistoryState, useExerciseHistory } from "../../hooks/useHistory"
import { Card, EmptyState, Skeleton, StatusPill, space, Text } from "../../ui"
import { formatE1Rm, formatLoggedDate, formatSetText } from "./progressFormat"
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

function BestSetCard({ history }: DetailProps) {
  return (
    <Card>
      {Option.match(history.best, {
        onNone: () => <Text tone="muted">No sets logged yet.</Text>,
        onSome: (best) => (
          <View accessible style={{ gap: space.xs }}>
            <Text variant="caption" tone="muted">
              Best set
            </Text>
            <Text variant="display">{formatSetText(best.weightKg, best.reps)}</Text>
            <Text tone="muted">{formatE1Rm(history.bestE1Rm)}</Text>
          </View>
        ),
      })}
    </Card>
  )
}

function RecentSessions({ history }: DetailProps) {
  if (history.recent.length === 0) {
    return null
  }
  return (
    <View style={{ gap: space.md }}>
      <Text variant="headline" accessibilityRole="header">
        Recent sessions
      </Text>
      {Arr.map(history.recent, ({ session, sets }) => (
        <Card key={session.id} style={{ gap: space.sm }}>
          <Text variant="subhead" tone="muted">
            {formatLoggedDate(session.startedAt)}
          </Text>
          {Arr.map(sets, (set, index) => (
            <View
              key={set.id}
              style={{ flexDirection: "row", alignItems: "center", gap: space.md }}
            >
              <Text tone="muted" style={{ minWidth: space.xxxl }}>{`Set ${index + 1}`}</Text>
              <Text variant="headline" style={{ flex: 1 }}>
                {formatSetText(set.weightKg, set.reps)}
              </Text>
              {set.isPr ? <StatusPill label="PR" tone="accent" /> : null}
            </View>
          ))}
        </Card>
      ))}
    </View>
  )
}

function DetailReady({ history }: DetailProps) {
  return (
    <View style={{ gap: space.lg }}>
      <Text variant="title" accessibilityRole="header">
        {history.exercise.name}
      </Text>
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
