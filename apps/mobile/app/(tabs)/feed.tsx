import type { Activity } from "@tanren/shared"
import { Array as Arr, DateTime, Match } from "effect"
import { type Href, useRouter } from "expo-router"
import { useMemo, useState } from "react"
import { FlatList, View } from "react-native"
import { ActivityCard } from "../../src/components/feed/ActivityCard"
import { type FeedRow, feedRows, groupByWeek } from "../../src/components/feed/feedGroups"
import { useFeed } from "../../src/hooks/useFeed"
import { FEED_PAGE } from "../../src/services/FeedRepo"
import {
  AppBar,
  Button,
  EmptyState,
  IconButton,
  Page,
  radius,
  Skeleton,
  space,
  Text,
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
  readonly onOpen: (activity: Activity) => void
  readonly onLoadMore: () => void
}

function FeedList({ items, limit, onOpen, onLoadMore }: FeedListProps) {
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
            <ActivityCard activity={activity} onPress={() => onOpen(activity)} />
          </View>
        ),
      }),
    )
  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.key}
      renderItem={renderRow}
      contentContainerStyle={{ paddingBottom: space.xxl }}
      ListFooterComponent={
        items.length === limit ? (
          <View style={{ marginTop: space.xl }}>
            <Button label="Load more" variant="secondary" onPress={onLoadMore} />
          </View>
        ) : undefined
      }
    />
  )
}

/**
 * `/activity/[sessionId]` is FEED-4's route. Until its file exists and `expo start` has regenerated
 * `.expo/types/router.d.ts`, the typed-routes union lacks the pathname; the cast goes once it does.
 */
const activityHref = (sessionId: string): Href =>
  ({ pathname: "/activity/[sessionId]", params: { sessionId } }) as unknown as Href

export default function FeedScreen() {
  const router = useRouter()
  const [limit, setLimit] = useState(FEED_PAGE)
  const feed = useFeed(limit).state

  const openActivity = (activity: Activity) =>
    activity.status === "inProgress"
      ? router.navigate("/today")
      : router.navigate(activityHref(activity.sessionId))

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
                onOpen={openActivity}
                onLoadMore={() => setLimit((current) => current + FEED_PAGE)}
              />
            ),
        }),
      )}
    </Page>
  )
}
