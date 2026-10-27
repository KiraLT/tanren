import type { LocalDate } from "@tanren/shared"
import { Match } from "effect"
import { useRouter } from "expo-router"
import { useState } from "react"
import { View } from "react-native"
import { weekStartFor } from "../src/components/health/dayBarMath"
import { InsightList } from "../src/components/health/InsightList"
import { formatWeekRange, localDateOf } from "../src/components/planFormat"
import {
  NutritionCard,
  TrackerCard,
  TrainingCard,
  WeekChartCard,
} from "../src/components/review/ReviewCards"
import {
  nextWeekStart,
  previousWeekStart,
  type ReviewSummary,
  weekEndOf,
} from "../src/components/review/reviewMath"
import { useWeekReview } from "../src/hooks/useWeekReview"
import {
  AppBar,
  Columns,
  EmptyState,
  IconButton,
  Page,
  radius,
  Skeleton,
  space,
  Text,
} from "../src/ui"

function WeekSwitcher({
  weekStart,
  current,
  onChange,
}: {
  readonly weekStart: LocalDate
  readonly current: LocalDate
  readonly onChange: (weekStart: LocalDate) => void
}) {
  const range = formatWeekRange(weekStart, weekEndOf(weekStart))
  const label = weekStart === current ? `This week · ${range}` : range
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <IconButton
        icon="chevronLeft"
        accessibilityLabel="Previous week"
        onPress={() => onChange(previousWeekStart(weekStart))}
      />
      <Text
        variant="headline"
        style={{ flex: 1, textAlign: "center" }}
        accessibilityLiveRegion="polite"
      >
        {label}
      </Text>
      <IconButton
        icon="chevronRight"
        accessibilityLabel="Next week"
        disabled={weekStart >= current}
        onPress={() => onChange(nextWeekStart(weekStart))}
      />
    </View>
  )
}

function ReviewSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading weekly review" style={{ gap: space.xl }}>
      <Skeleton width="100%" height={132} radius={radius.lg} />
      <Skeleton width="100%" height={196} radius={radius.lg} />
    </View>
  )
}

function ReviewReady({
  summary,
  today,
}: {
  readonly summary: ReviewSummary
  readonly today: LocalDate
}) {
  return (
    <Columns
      split="7/5"
      main={
        <View style={{ gap: space.xl }}>
          <TrainingCard training={summary.training} />
          <NutritionCard nutrition={summary.nutrition} />
        </View>
      }
      side={
        <View style={{ gap: space.xl }}>
          <TrackerCard tracker={summary.tracker} />
          <WeekChartCard days={summary.days} today={today} />
          <InsightList insights={summary.insights} />
        </View>
      }
    />
  )
}

/** Weekly review (ADR-0029): the local Mon–Sun week's training, nutrition and Garmin numbers. */
export default function ReviewScreen() {
  const router = useRouter()
  const today = localDateOf(new Date())
  const current = weekStartFor(today)
  const [weekStart, setWeekStart] = useState<LocalDate>(current)
  const state = useWeekReview(weekStart)
  // A direct load has no history to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace("/you"))
  return (
    <Page
      scroll
      wide
      header={
        <AppBar
          title="Weekly review"
          leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
        />
      }
    >
      <WeekSwitcher
        weekStart={weekStart}
        current={current}
        onChange={(next) => setWeekStart(next > current ? current : next)}
      />
      {Match.value(state).pipe(
        Match.tagsExhaustive({
          Loading: () => <ReviewSkeleton />,
          Failed: ({ message }) => (
            <EmptyState icon="warning" title="Could not load the review" body={message} />
          ),
          Ready: ({ value }) => <ReviewReady summary={value} today={today} />,
        }),
      )}
    </Page>
  )
}
