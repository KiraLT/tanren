import type { DayTotals, ImportedActivity, Insight, LocalDate, WeekReview } from "@tanren/shared"
import { Array as Arr, Match, Option } from "effect"
import { useRouter } from "expo-router"
import type { ReactNode } from "react"
import { View } from "react-native"
import { ImportedCard } from "../../src/components/feed/ImportedCard"
import { DAY_BARS_HEIGHT, DayBars } from "../../src/components/health/DayBars"
import { WEEK_DAYS, weekStartFor } from "../../src/components/health/dayBarMath"
import { FoodLog } from "../../src/components/health/FoodLog"
import { HealthHero } from "../../src/components/health/HealthHero"
import { InsightList } from "../../src/components/health/InsightList"
import { WeekReviewCard } from "../../src/components/health/WeekReviewCard"
import { localDateOf } from "../../src/components/planFormat"
import { useFoodEntryActions } from "../../src/hooks/useFoodEntryActions"
import type { HistoryState } from "../../src/hooks/useHistory"
import { type NutritionDay, useNutritionDay } from "../../src/hooks/useNutritionDay"
import { type HealthWeek, useNutritionWeek } from "../../src/hooks/useNutritionWeek"
import {
  AppBar,
  Card,
  Columns,
  EmptyState,
  IconButton,
  Page,
  radius,
  rhythm,
  SegmentBar,
  Skeleton,
  sizes,
  space,
  Text,
  useBreakpoint,
} from "../../src/ui"

function HealthSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading health" style={{ gap: space.xl }}>
      <Skeleton width="100%" height={sizes.statTile} radius={radius.md} />
      <Skeleton width="100%" height={DAY_BARS_HEIGHT} radius={radius.md} />
      <Skeleton width="100%" height={86} radius={radius.lg} />
    </View>
  )
}

function ProteinDays({ review }: { readonly review: WeekReview }) {
  const hit = review.daysOnProteinTarget
  return (
    <Card padding={rhythm.cardPadding}>
      <View style={{ gap: space.sm }}>
        <View style={{ gap: 2 }}>
          <Text variant="headline">Protein target</Text>
          <Text variant="caption" tone="muted">
            {`${hit} of ${WEEK_DAYS} days`}
          </Text>
        </View>
        <SegmentBar
          total={WEEK_DAYS}
          filled={hit}
          accessibilityLabel={`Protein target hit on ${hit} of ${WEEK_DAYS} days`}
          style={{ width: "100%" }}
        />
      </View>
    </Card>
  )
}

function Activities({
  activities,
  open,
}: {
  readonly activities: ReadonlyArray<ImportedActivity>
  readonly open: (activity: ImportedActivity) => void
}) {
  if (activities.length === 0) {
    return null
  }
  return (
    <View style={{ gap: space.md }}>
      {Arr.map(activities, (activity) => (
        <ImportedCard key={activity.id} activity={activity} onPress={() => open(activity)} />
      ))}
    </View>
  )
}

interface ReadyProps {
  readonly day: DayTotals
  readonly insights: ReadonlyArray<Insight>
  readonly week: HealthWeek
  readonly today: LocalDate
  readonly open: (activity: ImportedActivity) => void
}

/** Ready (nutrition.md §6): one column at phone/tablet; desktop `Columns 7/5` like the activity detail. */
function HealthReady({ day, insights, week, today, open }: ReadyProps) {
  const desktop = useBreakpoint() === "desktop"
  const actions = useFoodEntryActions()
  // FoodLog owns the Undo banner; the hook's promises never reject.
  const foodLog = (
    <FoodLog
      key="food"
      entries={day.entries}
      onDelete={actions.softDelete}
      onRestore={actions.restore}
    />
  )
  const main = [
    <HealthHero key="hero" day={day} />,
    <DayBars key="bars" days={week.review.days} today={today} barWidth={desktop ? 28 : 18} />,
    <ProteinDays key="protein" review={week.review} />,
  ]
  const side = [
    <InsightList key="insights" insights={insights} />,
    <WeekReviewCard key="review" review={week.review} />,
    <Activities key="activities" activities={week.activities} open={open} />,
  ]
  const stack = (nodes: ReadonlyArray<ReactNode>) => <View style={{ gap: space.xl }}>{nodes}</View>
  return desktop ? (
    <Columns split="7/5" main={stack([...main, foodLog])} side={stack(side)} />
  ) : (
    stack([...main, ...side, foodLog])
  )
}

type Combined = HistoryState<{
  readonly nutrition: NutritionDay
  readonly week: Option.Option<HealthWeek>
}>

/** Ready without a week: the screen renders Off (targets None). */
const offState = (nutrition: NutritionDay): Combined => ({
  _tag: "Ready",
  value: { nutrition, week: Option.none() },
})

const combine = (
  dayState: HistoryState<NutritionDay>,
  weekState: HistoryState<HealthWeek>,
): Combined =>
  Match.value(dayState).pipe(
    Match.tagsExhaustive({
      Loading: (loading) => loading,
      Failed: (failed) => failed,
      Ready: ({ value }) =>
        Match.value(weekState).pipe(
          Match.tagsExhaustive({
            // Off needs only the day: it never waits on, or fails with, the week read.
            Loading: () =>
              Option.isNone(value.day.targets) ? offState(value) : { _tag: "Loading" as const },
            Failed: (failed) => (Option.isNone(value.day.targets) ? offState(value) : failed),
            Ready: (week) => ({
              _tag: "Ready" as const,
              value: { nutrition: value, week: Option.some(week.value) },
            }),
          }),
        ),
    }),
  )

export default function HealthScreen() {
  const router = useRouter()
  // The device's calendar day at render (same read as the Today strip); the week is its Mon–Sun.
  const today = localDateOf(new Date())
  const state = combine(useNutritionDay(today), useNutritionWeek(weekStartFor(today)))
  // A direct load has no history to go back to: fall back to Today.
  const back = () => (router.canGoBack() ? router.back() : router.replace("/today"))
  const openActivity = (activity: ImportedActivity) =>
    router.navigate({ pathname: "/activity/imported/[id]", params: { id: activity.id } })
  const off = (
    <EmptyState
      icon="target"
      title="Set a nutrition goal"
      body="Tanren derives your calorie and protein targets from it"
      action={{ label: "Set goal", onPress: () => router.navigate("/settings/nutrition") }}
    />
  )
  return (
    // `wide` in every state (nutrition.md §6): Off and Loading render inside the same frame.
    <Page
      scroll
      wide
      header={
        <AppBar
          title="Health"
          leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
          trailing={
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <IconButton
                icon="plus"
                accessibilityLabel="Add food"
                onPress={() => router.navigate("/health/add")}
              />
              <IconButton
                icon="settings"
                accessibilityLabel="Nutrition settings"
                onPress={() => router.navigate("/settings/nutrition")}
              />
            </View>
          }
        />
      }
    >
      {Match.value(state).pipe(
        Match.tagsExhaustive({
          Loading: () => <HealthSkeleton />,
          Failed: ({ message }) => (
            <EmptyState icon="warning" title="Could not load your health data" body={message} />
          ),
          Ready: ({ value }) =>
            Option.match(Option.all([value.nutrition.day.targets, value.week]), {
              onNone: () => off,
              onSome: ([, week]) => (
                <HealthReady
                  day={value.nutrition.day}
                  insights={value.nutrition.insights}
                  week={week}
                  today={today}
                  open={openActivity}
                />
              ),
            }),
        }),
      )}
    </Page>
  )
}
