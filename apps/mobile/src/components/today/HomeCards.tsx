import { Match, Option } from "effect"
import { useRouter } from "expo-router"
import { Pressable, View } from "react-native"
import { useFeed } from "../../hooks/useFeed"
import { useWeekReview } from "../../hooks/useWeekReview"
import type { FeedItem } from "../../services/FeedRepo"
import {
  Button,
  Card,
  radius,
  StatRow,
  sizes,
  space,
  Text,
  usePressableInteraction,
  useTheme,
} from "../../ui"
import { formatDurationCompact } from "../feed/feedGroups"
import { weekStartFor } from "../health/dayBarMath"
import { localDateOf } from "../planFormat"
import { formatVolume } from "../volumeFormat"

/**
 * "This week" (navigation-v2.md §2 Merge): sessions done / planned, volume and PRs of the local
 * Mon–Sun week, the same `WeekReviewRepo` numbers the Weekly review shows. Nothing while loading
 * or on a read failure (the review page carries the error).
 */
export function ThisWeekCard() {
  const router = useRouter()
  const state = useWeekReview(weekStartFor(localDateOf(new Date())))
  if (state._tag !== "Ready") {
    return null
  }
  const { done, planned, volumeKg, prs } = state.value.training
  const items = [
    { label: "Sessions", value: planned > 0 ? `${done} / ${planned}` : String(done) },
    { label: "Volume", value: formatVolume(volumeKg) },
    { label: "PRs", value: String(prs) },
  ]
  // Label-in-name: the accessible name reads the tiles' own strings.
  const spoken = items.map((item) => `${item.label} ${item.value}`).join(", ")
  return (
    <Card
      onPress={() => router.navigate("/review")}
      accessibilityLabel={`This week: ${spoken}. Opens the weekly review`}
    >
      <View style={{ gap: space.sm }}>
        <Text variant="caption" tone="muted" headingLevel={2}>
          This week
        </Text>
        <StatRow variant="tile" items={items} />
      </View>
    </Card>
  )
}

/** Title and "52 min · 18 sets · 2 PRs" of the newest feed item. */
const teaserText = (item: FeedItem): { readonly title: string; readonly line: string } =>
  Match.valueTags(item, {
    session: ({ activity }) => ({
      title: activity.title,
      line: [
        ...Option.match(activity.durationSeconds, {
          onNone: () => [],
          onSome: (seconds) => [formatDurationCompact(seconds)],
        }),
        `${activity.sets} set${activity.sets === 1 ? "" : "s"}`,
        ...(activity.prs > 0 ? [`${activity.prs} PR${activity.prs === 1 ? "" : "s"}`] : []),
      ].join(" · "),
    }),
    imported: ({ activity }) => ({
      title: activity.title,
      line: formatDurationCompact(activity.durationSeconds),
    }),
  })

/**
 * The latest activity teaser: the newest feed item (title + one stat line, opens its detail) and
 * a sibling "See all" to Activity. Not rendered without an item.
 */
export function LatestActivityCard() {
  const router = useRouter()
  const { colors } = useTheme()
  const { hovered, handlers, focusStyle } = usePressableInteraction()
  const { state } = useFeed(1)
  if (state._tag !== "Ready") {
    return null
  }
  const first = state.value[0]
  if (first === undefined) {
    return null
  }
  const { title, line } = teaserText(first)
  const open = () =>
    Match.valueTags(first, {
      session: ({ activity }) =>
        // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
        router.push({
          pathname: "/activity/[sessionId]",
          params: { sessionId: activity.sessionId },
        }),
      imported: ({ activity }) =>
        // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
        router.push({ pathname: "/activity/imported/[id]", params: { id: activity.id } }),
    })
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Latest activity: ${title}, ${line}`}
          onPress={open}
          {...handlers}
          style={({ pressed }) => [
            {
              flex: 1,
              minHeight: sizes.tap,
              justifyContent: "center",
              gap: 2,
              borderRadius: radius.sm,
              ...(hovered || pressed ? { backgroundColor: colors.surfaceRaised } : {}),
            },
            focusStyle,
          ]}
        >
          <Text variant="caption" tone="muted">
            Latest activity
          </Text>
          <Text variant="headline" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="subhead" tone="muted" numberOfLines={1}>
            {line}
          </Text>
        </Pressable>
        <Button
          label="See all"
          size="sm"
          variant="text"
          accessibilityLabel="See all activity"
          onPress={() => router.navigate("/activity")}
        />
      </View>
    </Card>
  )
}
