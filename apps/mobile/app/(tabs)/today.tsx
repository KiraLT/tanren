import { Array as Arr, Match } from "effect"
import { useRouter } from "expo-router"
import { View } from "react-native"
import { TodayPrograms, useDueToday } from "../../src/components/TodayPrograms"
import { TodayReady } from "../../src/components/TodayReady"
import { FinishWorkout } from "../../src/components/today/FinishWorkout"
import { HealthModule, useHealthModuleShown } from "../../src/components/today/HealthModule"
import { todayEmptyCopy } from "../../src/components/today/todayEmptyCopy"
import { useLayoutMode } from "../../src/hooks/useLayoutMode"
import { SIGN_IN_SUPPORTED, SIGN_IN_WEB_ONLY_NOTICE } from "../../src/hooks/useSendMagicLink"
import { useSignedIn } from "../../src/hooks/useSignedIn"
import { type TodayState, useToday } from "../../src/hooks/useToday"
import {
  AppBar,
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
  const copy = todayEmptyCopy(programsDue.length)
  return (
    // With the card: a scrolling page (16 top padding, 24 section gap); without it the plain body,
    // where the empty state fills and centres.
    <Page header={<TodayBar />} scroll={healthShown} sectionGap={space.xl}>
      <HealthModule />
      <TodayPrograms />
      <EmptyState icon="calendar" title={copy.title} body={copy.body} compact={healthShown} />
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
  }),
)

export default function TodayScreen() {
  const { state } = useToday()
  return renderState(state)
}
