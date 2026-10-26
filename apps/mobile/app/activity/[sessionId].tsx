import { SessionId } from "@tanren/shared"
import { Match, Option, Schema } from "effect"
import { useLocalSearchParams, useRouter } from "expo-router"
import { View } from "react-native"
import { Pills } from "../../src/components/feed/ActivityCard"
import {
  ActivityDetail,
  ActivityExercises,
  ActivityHead,
  ActivityMuscles,
  ActivityTiles,
} from "../../src/components/feed/ActivityDetail"
import { tilesPerRow } from "../../src/components/feed/detailText"
import { useActivity } from "../../src/hooks/useFeed"
import {
  AppBar,
  Columns,
  EmptyState,
  gutter,
  IconButton,
  Page,
  radius,
  Skeleton,
  space,
  useBreakpoint,
  useColumns,
} from "../../src/ui"

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
  const desktop = useBreakpoint() === "desktop"
  // Main column's inner width, a safe under-estimate of `Columns`' own (632 at 1280, 340 at 900:
  // below 1024 the split is 6/6 and four tiles would truncate, so they go 2 x 2).
  const mainInner = useColumns("7/5").main - 2 * gutter.desktop
  const title = Match.value(state).pipe(
    Match.tag("Ready", ({ value }) =>
      Option.match(value, { onNone: () => "Activity", onSome: (a) => a.title }),
    ),
    Match.orElse(() => "Activity"),
  )
  // Only a Ready activity is wide; Loading, Failed and not-found stay one 600 column.
  const ready = state._tag === "Ready" && Option.isSome(state.value)
  return (
    <Page
      scroll
      wide={ready}
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
              onSome: (activity) =>
                desktop ? (
                  <Columns
                    split="7/5"
                    main={
                      <View style={{ gap: space.lg }}>
                        <ActivityHead activity={activity} withPills={false} />
                        <ActivityTiles activity={activity} perRow={tilesPerRow(mainInner)} />
                        <ActivityExercises activity={activity} />
                      </View>
                    }
                    side={
                      <View style={{ gap: space.lg }}>
                        <ActivityMuscles activity={activity} />
                        <View style={{ alignItems: "center" }}>
                          <Pills activity={activity} />
                        </View>
                      </View>
                    }
                  />
                ) : (
                  <ActivityDetail activity={activity} layout="stacked" />
                ),
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
