import { SessionId } from "@tanren/shared"
import { Match, Option, Schema } from "effect"
import { useLocalSearchParams, useRouter } from "expo-router"
import { View } from "react-native"
import { ActivityDetail } from "../../src/components/feed/ActivityDetail"
import { useActivity } from "../../src/hooks/useFeed"
import { AppBar, EmptyState, IconButton, Page, radius, Skeleton, space } from "../../src/ui"

const NOT_FOUND = (
  <EmptyState
    icon="warning"
    title="Activity not found"
    body="It may have been deleted on another device."
  />
)

function DetailSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading activity" style={{ gap: space.lg }}>
      <Skeleton width="60%" height={36} />
      <Skeleton width="100%" height={176} radius={radius.lg} />
      <Skeleton width="100%" height={196} radius={radius.lg} />
    </View>
  )
}

function ActivityPage({
  sessionId,
  back,
}: {
  readonly sessionId: SessionId
  readonly back: () => void
}) {
  const { state } = useActivity(sessionId)
  const title = Match.value(state).pipe(
    Match.tag("Ready", ({ value }) =>
      Option.match(value, { onNone: () => "Activity", onSome: (a) => a.title }),
    ),
    Match.orElse(() => "Activity"),
  )
  return (
    <Page
      scroll
      header={
        <AppBar
          title={title}
          leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
        />
      }
    >
      {Match.value(state).pipe(
        Match.tagsExhaustive({
          Loading: () => <DetailSkeleton />,
          Failed: ({ message }) => (
            <EmptyState icon="warning" title="Could not load this activity" body={message} />
          ),
          Ready: ({ value }) =>
            Option.match(value, {
              onNone: () => NOT_FOUND,
              onSome: (activity) => <ActivityDetail activity={activity} layout="stacked" />,
            }),
        }),
      )}
    </Page>
  )
}

export default function ActivityScreen() {
  const router = useRouter()
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>()
  // A direct load has no history to go back to: fall back to the feed.
  const back = () => (router.canGoBack() ? router.back() : router.replace("/feed"))
  return Option.match(Schema.decodeUnknownOption(SessionId)(sessionId), {
    onNone: () => (
      <Page
        scroll
        header={
          <AppBar
            title="Activity"
            leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
          />
        }
      >
        {NOT_FOUND}
      </Page>
    ),
    onSome: (id) => <ActivityPage sessionId={id} back={back} />,
  })
}
