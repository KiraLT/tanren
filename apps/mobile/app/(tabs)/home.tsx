import { Array as Arr, Match } from "effect"
import { useLocalSearchParams, useRouter } from "expo-router"
import { View } from "react-native"
import { formatDayDate, localDateOf } from "../../src/components/planFormat"
import { TodayPrograms, useDueToday } from "../../src/components/TodayPrograms"
import { TodayReady } from "../../src/components/TodayReady"
import { FinishWorkout } from "../../src/components/today/FinishWorkout"
import { FreeFooter } from "../../src/components/today/FreeFooter"
import { FREE_WORKOUT_TITLE } from "../../src/components/today/freeWorkoutCopy"
import { HealthModule } from "../../src/components/today/HealthModule"
import { LatestActivityCard, ThisWeekCard } from "../../src/components/today/HomeCards"
import { UpNextCard } from "../../src/components/today/UpNextCard"
import { SIGN_IN_SUPPORTED, SIGN_IN_WEB_ONLY_NOTICE } from "../../src/hooks/useSendMagicLink"
import { useSignedIn } from "../../src/hooks/useSignedIn"
import { useDoneToday, useStartAction } from "../../src/hooks/useStartWorkout"
import { type TodayState, useToday } from "../../src/hooks/useToday"
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
 * the health module, "This week" and the latest activity. At desktop the health module and the
 * programs due move to the aside. The Start pill opens the pager at `/home?workout=1`.
 */
export default function HomeScreen() {
  const { state } = useToday()
  const due = useDueToday()
  const done = useDoneToday()
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
    <AppBar
      title="Home"
      eyebrow={{ label: formatDayDate(localDateOf(new Date())) }}
      trailing={<SignInEntry />}
    />
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
              </View>
            ),
          }
        : {})}
    >
      <UpNextCard state={state} due={due} action={action} done={done} />
      {desktop ? null : <HealthModule />}
      {desktop ? null : programs}
      <ThisWeekCard />
      <LatestActivityCard />
    </Page>
  )
}
