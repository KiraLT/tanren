import { Array as Arr, Match } from "effect"
import { useRouter } from "expo-router"
import { useState } from "react"
import { View } from "react-native"
import { TodayPrograms, useDueToday } from "../../src/components/TodayPrograms"
import { TodayReady } from "../../src/components/TodayReady"
import { FinishWorkout } from "../../src/components/today/FinishWorkout"
import { FreeFooter } from "../../src/components/today/FreeFooter"
import {
  ADD_EXERCISE_LABEL,
  CANCEL_FAILED_TITLE,
  CANCEL_WORKOUT_LABEL,
  FREE_WORKOUT_TITLE,
  START_FAILED_TITLE,
  START_WORKOUT_LABEL,
  WORKOUT_STARTED_BODY,
  WORKOUT_STARTED_TITLE,
} from "../../src/components/today/freeWorkoutCopy"
import { HealthModule, useHealthModuleShown } from "../../src/components/today/HealthModule"
import { todayEmptyCopy } from "../../src/components/today/todayEmptyCopy"
import { useLayoutMode } from "../../src/hooks/useLayoutMode"
import { SIGN_IN_SUPPORTED, SIGN_IN_WEB_ONLY_NOTICE } from "../../src/hooks/useSendMagicLink"
import { useSignedIn } from "../../src/hooks/useSignedIn"
import { type TodayState, useFreeWorkoutActions, useToday } from "../../src/hooks/useToday"
import {
  AppBar,
  Banner,
  Button,
  EmptyState,
  gutter,
  IconButton,
  Page,
  Skeleton,
  space,
  Text,
  useBreakpoint,
} from "../../src/ui"

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

/** The Today title row, with the sign-in entry on the right, while nothing is ready. */
function TodayBar() {
  return <AppBar title="Today" trailing={<SignInEntry />} />
}

/** Layout-shaped placeholder: exercise heading, three set rows, two steppers, the log button. */
function TodaySkeleton() {
  const breakpoint = useBreakpoint()
  return (
    <View
      accessibilityLabel="Loading today"
      style={{
        flex: 1,
        paddingHorizontal: gutter[breakpoint],
        gap: space.xl,
        paddingTop: space.lg,
      }}
    >
      <View style={{ gap: space.sm }}>
        <Skeleton width="70%" height={44} />
        <Skeleton width="30%" height={20} />
      </View>
      <View style={{ gap: space.sm }}>
        <Skeleton width="100%" height={56} />
        <Skeleton width="100%" height={56} />
        <Skeleton width="100%" height={56} />
      </View>
      <Skeleton width="100%" height={84} />
      <Skeleton width="100%" height={84} />
      <Skeleton width="100%" height={96} />
    </View>
  )
}

/**
 * Above the pager (health-module.md §3): the health module (one column only; the two-column layout
 * shows it as the aside's first card) and the programs due. `TodayReady`'s page is unpadded, so each
 * takes the gutter here and sits `space.lg` below the previous; a hidden module takes no space.
 */
function ReadyBanner() {
  const breakpoint = useBreakpoint()
  const wide = useLayoutMode() === "two-column"
  const marginHorizontal = gutter[breakpoint]
  const programsDue = useDueToday()
  return (
    <>
      {wide ? null : <HealthModule style={{ marginHorizontal, marginTop: space.lg }} />}
      {/* Programs due, above the pager; the wrapper exists only when one is due (no empty space). */}
      {Arr.isReadonlyArrayNonEmpty(programsDue) && (
        <View style={{ marginHorizontal, marginTop: space.lg }}>
          <TodayPrograms />
        </View>
      )}
    </>
  )
}

/**
 * Nothing planned (PWA-2): with the health card shown, the card sits 16 below the AppBar and the
 * empty state 24 below the card, top-aligned and compact; without the card it stays centred.
 */
function TodayEmpty() {
  const healthShown = useHealthModuleShown()
  const programsDue = useDueToday()
  const { start } = useFreeWorkoutActions()
  const [failed, setFailed] = useState(false)
  const copy = todayEmptyCopy(programsDue.length)
  const onStart = () => {
    setFailed(false)
    start().then((ok) => setFailed(!ok))
  }
  return (
    // With the card: a scrolling page (16 top padding, 24 section gap); without it the plain body,
    // where the empty state fills and centres.
    <Page header={<TodayBar />} scroll={healthShown} sectionGap={space.xl}>
      <HealthModule />
      <TodayPrograms />
      {failed ? (
        <Banner tone="danger" title={START_FAILED_TITLE} onDismiss={() => setFailed(false)} />
      ) : null}
      <EmptyState
        icon="calendar"
        title={copy.title}
        body={copy.body}
        compact={healthShown}
        action={{ label: START_WORKOUT_LABEL, onPress: onStart, variant: "primary" }}
      />
    </Page>
  )
}

/**
 * A free workout with no exercise yet (free-workout.md §4): the Empty layout with "Workout started",
 * a primary "Add exercise" to the Library and a secondary "Cancel workout" (no confirm: nothing is
 * lost, the row only holds intent). Today reloads through `StoreEvents` after either write.
 */
function TodayFreeEmpty() {
  const healthShown = useHealthModuleShown()
  const router = useRouter()
  const { cancel } = useFreeWorkoutActions()
  const [failed, setFailed] = useState(false)
  const onCancel = () => {
    setFailed(false)
    cancel().then((ok) => setFailed(!ok))
  }
  return (
    <Page header={<TodayBar />} scroll={healthShown} sectionGap={space.xl}>
      <HealthModule />
      <TodayPrograms />
      {failed ? (
        <Banner tone="danger" title={CANCEL_FAILED_TITLE} onDismiss={() => setFailed(false)} />
      ) : null}
      {/* Without the card the pair centres in the body, like `TodayEmpty`'s filling empty state. */}
      <View
        style={
          healthShown ? { gap: space.sm } : { flex: 1, justifyContent: "center", gap: space.sm }
        }
      >
        <EmptyState
          icon="dumbbell"
          title={WORKOUT_STARTED_TITLE}
          body={WORKOUT_STARTED_BODY}
          compact
          action={{
            label: ADD_EXERCISE_LABEL,
            onPress: () => router.navigate("/train?view=library"),
            variant: "primary",
          }}
        />
        <Button
          label={CANCEL_WORKOUT_LABEL}
          variant="secondary"
          onPress={onCancel}
          style={{ alignSelf: "center" }}
        />
      </View>
    </Page>
  )
}

const renderState = Match.type<TodayState>().pipe(
  Match.tagsExhaustive({
    Loading: () => (
      <Page padded={false} header={<TodayBar />}>
        <TodaySkeleton />
      </Page>
    ),
    Empty: () => <TodayEmpty />,
    Failed: ({ message }) => (
      <Page header={<TodayBar />}>
        <EmptyState icon="warning" title="Could not load today" body={message} />
      </Page>
    ),
    // Renders its own Page and AppBar: the counter and the aside follow the pager's exercise.
    Ready: ({ plannedSession, exercises, session }) => (
      <TodayReady
        title={plannedSession.name}
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
          accessory={<SignInEntry />}
          exercises={exercises}
          footer={<FreeFooter session={session} />}
          banner={<ReadyBanner />}
          asideTop={<HealthModule />}
        />
      ) : (
        <TodayFreeEmpty />
      ),
  }),
)

export default function TodayScreen() {
  const { state } = useToday()
  return renderState(state)
}
