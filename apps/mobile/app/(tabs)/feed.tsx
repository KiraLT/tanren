import type { Activity, SessionId } from "@tanren/shared"
import { Array as Arr, DateTime, Match, Option } from "effect"
import { useRouter } from "expo-router"
import { useMemo, useState } from "react"
import { FlatList, ScrollView, View } from "react-native"
import { ActivityCard } from "../../src/components/feed/ActivityCard"
import { ActivityDetail } from "../../src/components/feed/ActivityDetail"
import { tilesPerRow } from "../../src/components/feed/detailText"
import { type FeedRow, feedRows, groupByWeek } from "../../src/components/feed/feedGroups"
import { effectiveActivity } from "../../src/components/feed/feedSelection"
import { useFeed } from "../../src/hooks/useFeed"
import { FEED_PAGE, MAX_FEED_LIMIT } from "../../src/services/FeedRepo"
import {
  AppBar,
  Button,
  EmptyState,
  gutter,
  IconButton,
  Page,
  radius,
  Skeleton,
  space,
  Text,
  useBreakpoint,
  useColumns,
} from "../../src/ui"

const HEADER_HEIGHT = 36
const CARD_SKELETON_HEIGHT = 196

function FeedSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading feed" style={{ gap: space.md }}>
      <Skeleton width="100%" height={HEADER_HEIGHT} />
      {Arr.map([0, 1, 2], (card) => (
        <Skeleton key={card} width="100%" height={CARD_SKELETON_HEIGHT} radius={radius.lg} />
      ))}
    </View>
  )
}

interface FeedListProps {
  readonly items: ReadonlyArray<Activity>
  readonly limit: number
  /** The card the desktop aside shows; `None` below desktop (no card is marked). */
  readonly selected: Option.Option<SessionId>
  readonly onOpen: (activity: Activity) => void
  readonly onLoadMore: () => void
}

function FeedList({ items, limit, selected, onOpen, onLoadMore }: FeedListProps) {
  // Grouping reads the clock once per data change; a list kept open past midnight regroups on the
  // next store write.
  const rows = useMemo(
    () =>
      feedRows(
        groupByWeek(items, DateTime.setZone(DateTime.nowUnsafe(), DateTime.zoneMakeLocal())),
      ),
    [items],
  )
  const renderRow = ({ item }: { readonly item: FeedRow }) =>
    Match.value(item).pipe(
      Match.tagsExhaustive({
        Header: ({ section }) => (
          <View
            accessibilityRole="header"
            style={{
              height: HEADER_HEIGHT,
              marginTop: space.xl,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: space.md,
            }}
          >
            <Text variant="title2" numberOfLines={1} style={{ flexShrink: 1 }}>
              {section.label}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {section.summary}
            </Text>
          </View>
        ),
        Card: ({ activity }) => (
          <View style={{ marginTop: space.md }}>
            <ActivityCard
              activity={activity}
              selected={Option.exists(selected, (id) => id === activity.sessionId)}
              onPress={() => onOpen(activity)}
            />
          </View>
        ),
      }),
    )
  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.key}
      renderItem={renderRow}
      extraData={Option.getOrUndefined(selected)}
      contentContainerStyle={{ paddingBottom: space.xxl }}
      ListFooterComponent={
        items.length === limit && limit < MAX_FEED_LIMIT ? (
          <View style={{ marginTop: space.xl }}>
            <Button label="Load more" variant="secondary" onPress={onLoadMore} />
          </View>
        ) : undefined
      }
    />
  )
}

export default function FeedScreen() {
  const router = useRouter()
  const desktop = useBreakpoint() === "desktop"
  const [limit, setLimit] = useState(FEED_PAGE)
  const [picked, setPicked] = useState<Option.Option<SessionId>>(Option.none())
  const feed = useFeed(limit).state
  const activities = feed._tag === "Ready" ? feed.value : []
  const shown = effectiveActivity(activities, picked)

  // An in-progress card is Today's session, so it goes there at every width; a finished one is
  // selected into the aside at desktop and opens its page below it.
  const openActivity = (activity: Activity) =>
    activity.status === "inProgress"
      ? router.navigate("/today")
      : desktop
        ? setPicked(Option.some(activity.sessionId))
        : router.navigate({
            pathname: "/activity/[sessionId]",
            params: { sessionId: activity.sessionId },
          })

  // The aside's inner width: 632 at 1280 (four tiles in a row), 344 at 900 (a 2 x 2 grid).
  const asideInner = useColumns("5/7").side - 2 * gutter.desktop
  const layout = tilesPerRow(asideInner) === 4 ? "split" : "stacked"

  const aside = Option.match(shown, {
    onNone: () => undefined,
    onSome: (activity) => (
      <ScrollView contentContainerStyle={{ padding: gutter.desktop, paddingTop: space.lg }}>
        <ActivityDetail key={activity.sessionId} activity={activity} layout={layout} />
      </ScrollView>
    ),
  })

  return (
    <Page
      header={
        <AppBar
          title="Feed"
          trailing={
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <IconButton
                icon="chart"
                accessibilityLabel="Progress"
                onPress={() => router.navigate("/progress")}
              />
              <IconButton
                icon="settings"
                accessibilityLabel="Settings"
                onPress={() => router.navigate("/settings")}
              />
            </View>
          }
        />
      }
      aside={aside}
      split="5/7"
    >
      {Match.value(feed).pipe(
        Match.tagsExhaustive({
          Loading: () => <FeedSkeleton />,
          Failed: ({ message }) => (
            <EmptyState icon="warning" title="Could not load the feed" body={message} />
          ),
          Ready: ({ value }) =>
            value.length === 0 ? (
              <EmptyState
                icon="flame"
                title="No workouts yet"
                body="Log a set on Today or finish a program day and it shows up here."
                action={{ label: "Go to Today", onPress: () => router.navigate("/today") }}
              />
            ) : (
              <FeedList
                items={value}
                limit={limit}
                selected={desktop ? Option.map(shown, (a) => a.sessionId) : Option.none()}
                onOpen={openActivity}
                onLoadMore={() => setLimit((current) => current + FEED_PAGE)}
              />
            ),
        }),
      )}
    </Page>
  )
}
