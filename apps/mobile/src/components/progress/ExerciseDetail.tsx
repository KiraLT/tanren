import type { ExerciseId } from "@tanren/shared"
import { Array as Arr, Match, Option } from "effect"
import { View } from "react-native"
import { type ExerciseHistory, type HistoryState, useExerciseHistory } from "../../hooks/useHistory"
import { ExerciseIllustration } from "../../library/ExerciseIllustration"
import { MuscleMapImage } from "../../library/MuscleMapImage"
import {
  Card,
  Columns,
  EmptyState,
  ListGroup,
  ListRow,
  Skeleton,
  StatusPill,
  sizes,
  space,
  Text,
  useBreakpoint,
} from "../../ui"
import { illustrationIdFor } from "../todayHeader"
import {
  bestSetParts,
  e1RmText,
  formatLoggedDate,
  formatSetText,
  hasE1RmTrend,
  weekBarsHeading,
  weekSeries,
} from "./progressFormat"
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
          const e1Rm = e1RmText(best.weightKg, history.bestE1Rm)
          const spoken = Option.match(e1Rm, { onNone: () => "", onSome: (text) => `, ${text}` })
          return (
            <View
              accessible
              accessibilityLabel={`Best set ${formatSetText(best.weightKg, best.reps)}${spoken}, personal record`}
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
              {Option.match(e1Rm, {
                onNone: () => null,
                onSome: (text) => (
                  <Text variant="subhead" tone="muted">
                    {text}
                  </Text>
                ),
              })}
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

export type DetailLayout = "stacked" | "split"

interface DetailReadyProps extends DetailProps {
  readonly layout: DetailLayout
}

function DetailReady({ history, layout }: DetailReadyProps) {
  const desktop = useBreakpoint() === "desktop"
  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.lg }}>
      <ExerciseIllustration
        catalogId={illustrationIdFor(history.exercise)}
        size={sizes.illustrationMd}
      />
      <Text variant="title2" accessibilityRole="header" style={{ flex: 1 }}>
        {history.exercise.name}
      </Text>
    </View>
  )
  const muscleMap = (
    <MuscleMapImage
      catalogId={illustrationIdFor(history.exercise)}
      primary={history.exercise.muscleGroups}
      secondary={[]}
      size={sizes.illustrationLg}
    />
  )
  const bestSet = <BestSetCard history={history} />
  const weekBars = (
    <Card style={{ gap: space.md }}>
      <Text variant="headline">{weekBarsHeading(weekSeries(history.weeks).unit)}</Text>
      <WeekBars weeks={history.weeks} />
    </Card>
  )
  const e1RmCard = hasE1RmTrend(history.e1RmTrend) ? (
    <Card style={{ gap: space.md }}>
      <Text variant="headline">Estimated 1RM</Text>
      <Sparkline trend={history.e1RmTrend} />
    </Card>
  ) : null
  if (layout === "split" && desktop) {
    return (
      <Columns
        split="7/5"
        main={
          <View style={{ gap: space.lg }}>
            {header}
            {bestSet}
            {weekBars}
            {e1RmCard}
          </View>
        }
        side={
          <View style={{ gap: space.lg }}>
            {muscleMap}
            <RecentSessions history={history} />
          </View>
        }
      />
    )
  }
  return (
    <View style={{ gap: space.lg }}>
      {header}
      {muscleMap}
      {bestSet}
      {weekBars}
      {e1RmCard}
      <RecentSessions history={history} />
    </View>
  )
}

const renderState = (layout: DetailLayout) =>
  Match.type<HistoryState<Option.Option<ExerciseHistory>>>().pipe(
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
          onSome: (history) => <DetailReady history={history} layout={layout} />,
        }),
    }),
  )

interface ExerciseDetailProps {
  readonly exerciseId: ExerciseId
  /** "split" is the two-column desktop composition (direct-load route); default "stacked". */
  readonly layout?: DetailLayout
}

/** True when the history loaded and the exercise exists: the only state that gets the wide page. */
export const isDetailReady = (state: HistoryState<Option.Option<ExerciseHistory>>): boolean =>
  state._tag === "Ready" && Option.isSome(state.value)

/** The detail for an already-read history state (the route reads it to size its page). */
export function ExerciseDetailView({
  state,
  layout = "stacked",
}: {
  readonly state: HistoryState<Option.Option<ExerciseHistory>>
  readonly layout?: DetailLayout
}) {
  return renderState(layout)(state)
}

/** One exercise's progress: best set, 8-week volume bars, e1RM trend, recent sessions. */
export function ExerciseDetail({ exerciseId, layout = "stacked" }: ExerciseDetailProps) {
  const { state } = useExerciseHistory(exerciseId)
  return <ExerciseDetailView state={state} layout={layout} />
}
