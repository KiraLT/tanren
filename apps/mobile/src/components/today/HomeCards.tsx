import { Match, Option } from "effect"
import { useRouter } from "expo-router"
import { Pressable, View } from "react-native"
import type { FeedItem } from "../../services/FeedRepo"
import {
  Button,
  Card,
  radius,
  sizes,
  space,
  Text,
  usePressableInteraction,
  useTheme,
} from "../../ui"
import { formatDurationCompact } from "../feed/feedGroups"

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
 * a sibling "See all" to Activity. Home passes the item from its one feed read (`useTodayFeed`).
 */
export function LatestActivityCard({ item }: { readonly item: FeedItem }) {
  const router = useRouter()
  const { colors } = useTheme()
  const { hovered, handlers, focusStyle } = usePressableInteraction()
  const { title, line } = teaserText(item)
  const open = () =>
    Match.valueTags(item, {
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
