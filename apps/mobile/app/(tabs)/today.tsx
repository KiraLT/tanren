import { Array as Arr, Match, Option } from "effect"
import { useRouter } from "expo-router"
import { View } from "react-native"
import { TodayPrograms, useDueToday } from "../../src/components/TodayPrograms"
import { TodayReady } from "../../src/components/TodayReady"
import { FinishWorkout } from "../../src/components/today/FinishWorkout"
import { HealthStrip, useHealthLine } from "../../src/components/today/HealthStrip"
import { NutritionStrip } from "../../src/components/today/NutritionStrip"
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
 * The health and nutrition strips above the pager, stacked `space.sm` (nutrition.md §6):
 * `TodayReady`'s page is unpadded, so each takes the gutter here; the first visible one sits
 * `space.lg` under the AppBar, and with both hidden the banner takes no space.
 */
function ReadyStrips() {
  const breakpoint = useBreakpoint()
  const healthShown = Option.isSome(useHealthLine())
  const marginHorizontal = gutter[breakpoint]
  const programsDue = useDueToday()
  return (
    <>
      <HealthStrip style={{ marginHorizontal, marginTop: space.lg }} />
      <NutritionStrip style={{ marginHorizontal, marginTop: healthShown ? space.sm : space.lg }} />
      {/* Programs due, above the pager; the wrapper exists only when one is due (no empty space). */}
      {Arr.isReadonlyArrayNonEmpty(programsDue) && (
        <View style={{ marginHorizontal, marginTop: space.lg }}>
          <TodayPrograms />
        </View>
      )}
    </>
  )
}

/** Empty: both strips as `Page` sections; under a visible health strip, the page's 16 gap is pulled to 8. */
function EmptyStrips() {
  const healthShown = Option.isSome(useHealthLine())
  return (
    <>
      <HealthStrip />
      <NutritionStrip style={healthShown ? { marginTop: space.sm - space.lg } : undefined} />
    </>
  )
}

const renderState = Match.type<TodayState>().pipe(
  Match.tagsExhaustive({
    Loading: () => (
      <Page padded={false} header={<TodayBar />}>
        <TodaySkeleton />
      </Page>
    ),
    Empty: () => (
      <Page header={<TodayBar />}>
        <EmptyStrips />
        <TodayPrograms />
        <EmptyState
          icon="calendar"
          title="Nothing planned today"
          body="Rest up. Your next session shows up here."
        />
      </Page>
    ),
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
        banner={<ReadyStrips />}
      />
    ),
  }),
)

export default function TodayScreen() {
  const { state } = useToday()
  return renderState(state)
}
