import { Match } from "effect"
import { useRouter } from "expo-router"
import { View } from "react-native"
import { TodayReady } from "../../src/components/TodayReady"
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

interface TodayBarProps {
  readonly subtitle?: string
}

/** The Today title row, with the sign-in entry on the right, over every state. */
function TodayBar({ subtitle }: TodayBarProps) {
  return (
    <AppBar
      title="Today"
      {...(subtitle === undefined ? {} : { subtitle })}
      trailing={<SignInEntry />}
    />
  )
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

const renderState = Match.type<TodayState>().pipe(
  Match.tagsExhaustive({
    Loading: () => (
      <Page padded={false} header={<TodayBar />}>
        <TodaySkeleton />
      </Page>
    ),
    Empty: () => (
      <Page header={<TodayBar />}>
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
    // Renders its own Page: the wide aside follows the pager's current exercise.
    Ready: ({ plannedSession, exercises }) => (
      <TodayReady header={<TodayBar subtitle={plannedSession.name} />} exercises={exercises} />
    ),
  }),
)

export default function TodayScreen() {
  const { state } = useToday()
  return renderState(state)
}
