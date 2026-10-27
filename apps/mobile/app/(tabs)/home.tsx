import { Array as Arr, Match, Option } from "effect"
import { useLocalSearchParams, useRouter } from "expo-router"
import { View } from "react-native"
import { weekStartFor } from "../../src/components/health/dayBarMath"
import { formatDayDate, localDateOf } from "../../src/components/planFormat"
import { TrackerCard, WeekChartCard } from "../../src/components/review/ReviewCards"
import { weekHasNutritionData } from "../../src/components/review/reviewMath"
import { TodayPrograms, useDueToday } from "../../src/components/TodayPrograms"
import { TodayReady } from "../../src/components/TodayReady"
import { FinishWorkout } from "../../src/components/today/FinishWorkout"
import { FreeFooter } from "../../src/components/today/FreeFooter"
import { FREE_WORKOUT_TITLE } from "../../src/components/today/freeWorkoutCopy"
import { HealthModule } from "../../src/components/today/HealthModule"
import { LatestActivityCard, RecentActivity } from "../../src/components/today/HomeCards"
import { UpNextCard } from "../../src/components/today/UpNextCard"
import { ThisWeekCard } from "../../src/components/week/ThisWeekCard"
import { SIGN_IN_SUPPORTED, SIGN_IN_WEB_ONLY_NOTICE } from "../../src/hooks/useSendMagicLink"
import { useSignedIn } from "../../src/hooks/useSignedIn"
import { useStartAction, useTodayFeed } from "../../src/hooks/useStartWorkout"
import { type TodayState, useToday } from "../../src/hooks/useToday"
import { useWeekReview } from "../../src/hooks/useWeekReview"
import { AppBar, gutter, IconButton, Page, space, Text, useBreakpoint } from "../../src/ui"

/** Top-right sign-in control in the AppBar; hidden while loading and once signed in. */
function SignInEntry() {
  const signedIn = useSignedIn()
  const router = useRouter()
  if (signedIn._tag !== "SignedOut") {
    return null
  }
  if (!SIGN_IN_SUPPORTED) {
    return (
      <Text variant="caption" tone="muted" accessibilityLabel={SIGN_IN_WEB_ONLY_NOTICE}>
        {SIGN_IN_WEB_ONLY_NOTICE}
      </Text>
    )
  }
  return (
    <IconButton
      icon="user"
      accessibilityLabel="Sign in"
      onPress={() => router.navigate("/sign-in")}
    />
  )
}

/** Back from the pager to Home's cards (the tab bar's Home keeps the `?workout` param). */
function PagerBack() {
  const router = useRouter()
  return (
    <IconButton
      icon="chevronLeft"
      accessibilityLabel="Back to Home"
      onPress={() => router.replace("/home")}
    />
  )
}

/**
 * Above the pager (health-module.md §3): the health module (phone only; at desktop it is the
 * aside's first card) and the programs due. `TodayReady`'s page is unpadded, so each takes the
 * gutter here and sits `space.lg` below the previous; a hidden module takes no space.
 */
function ReadyBanner() {
  const breakpoint = useBreakpoint()
  const marginHorizontal = gutter[breakpoint]
  const programsDue = useDueToday()
  return (
    <>
      {breakpoint === "desktop" ? null : (
        <HealthModule style={{ marginHorizontal, marginTop: space.lg }} />
      )}
      {Arr.isReadonlyArrayNonEmpty(programsDue) && (
        <View style={{ marginHorizontal, marginTop: space.lg }}>
          <TodayPrograms />
        </View>
      )}
    </>
  )
}

/** The pager (today's session, one exercise per page) for `/home?workout=1`; null when none. */
const pagerFor = Match.type<TodayState>().pipe(
  Match.tagsExhaustive({
    Loading: () => null,
    Empty: () => null,
    Failed: () => null,
    Ready: ({ plannedSession, exercises, session }) => (
      <TodayReady
        title={plannedSession.name}
        leading={<PagerBack />}
        accessory={<SignInEntry />}
        exercises={exercises}
        footer={<FinishWorkout session={session} />}
        banner={<ReadyBanner />}
        asideTop={<HealthModule />}
      />
    ),
    Free: ({ exercises, session }) =>
      Arr.isReadonlyArrayNonEmpty(exercises) ? (
        <TodayReady
          title={FREE_WORKOUT_TITLE}
          leading={<PagerBack />}
          accessory={<SignInEntry />}
          exercises={exercises}
          footer={<FreeFooter session={session} />}
          banner={<ReadyBanner />}
          asideTop={<HealthModule />}
        />
      ) : null,
  }),
)

/**
 * Home (ADR-0029, navigation-v2.md §2 Merge, §3, §6): the Up-next card with the one Start pill,
 * the health module, "This week" and the latest activity. At desktop (desktop-fill.md §2) the
 * column shows the three newest feed items instead of the teaser, and the aside holds the health
 * module, the programs due, the week's eaten vs burned chart (only with data) and the tracker tiles. The Start pill opens the pager at `/home?workout=1`.
 */
export default function HomeScreen() {
  const { state } = useToday()
  const due = useDueToday()
  const { done, latest, recent } = useTodayFeed()
  const today = localDateOf(new Date())
  // One week read for Home: "This week" and, at desktop, the eaten vs burned chart and the tracker.
  const week = useWeekReview(weekStartFor(today))
  const action = useStartAction(state, due, done.length)
  const params = useLocalSearchParams<{ workout?: string | string[] }>()
  const desktop = useBreakpoint() === "desktop"
  const pager = params.workout === "1" ? pagerFor(state) : null
  if (pager !== null) {
    return pager
  }
  // The program row is the Up-next card itself when nothing is planned: list the others only.
  const programsUpNext = state._tag === "Empty"
  const header = (
    <AppBar title="Home" eyebrow={{ label: formatDayDate(today) }} trailing={<SignInEntry />} />
  )
  const programs = <TodayPrograms skipFirst={programsUpNext} />
  return (
    <Page
      scroll
      header={header}
      sectionGap={space.lg}
      {...(desktop
        ? {
            aside: (
              <View style={{ gap: space.lg }}>
                <HealthModule />
                {programs}
                {week._tag === "Ready" && weekHasNutritionData(week.value.days) ? (
                  <WeekChartCard days={week.value.days} today={today} />
                ) : null}
                {week._tag === "Ready" ? <TrackerCard tracker={week.value.tracker} /> : null}
              </View>
            ),
          }
        : {})}
    >
      <UpNextCard state={state} due={due} action={action} done={done} />
      {desktop ? null : <HealthModule />}
      {desktop ? null : programs}
      {week._tag === "Ready" ? <ThisWeekCard summary={week.value} /> : null}
      {desktop ? (
        <RecentActivity items={recent} />
      ) : (
        Option.match(latest, {
          onNone: () => null,
          onSome: (item) => <LatestActivityCard item={item} />,
        })
      )}
    </Page>
  )
}
