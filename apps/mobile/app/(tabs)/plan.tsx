import type { PlannedSessionId } from "@tanren/shared"
import { Match, Option } from "effect"
import { useState } from "react"
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native"
import { PlannedSessionCard } from "../../src/components/PlannedSessionCard"
import { PlanWeek } from "../../src/components/PlanWeek"
import { localDateOf } from "../../src/components/planFormat"
import { selectedSession } from "../../src/components/planSelection"
import { Screen } from "../../src/components/Screen"
import { colors, space } from "../../src/components/theme"
import { useLayoutMode } from "../../src/hooks/useLayoutMode"
import { type PlanWeekState, type PlanWeekView, usePlanWeek } from "../../src/hooks/usePlanWeek"

interface MessageProps {
  readonly title: string
  readonly body: string
}

function Message({ title, body }: MessageProps) {
  return (
    <View style={styles.message}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  )
}

interface PlanReadyProps {
  readonly view: PlanWeekView
}

/**
 * The week. Wide: cards are pressable and compact, and the aside shows the selected session's
 * blocks (default today's, else the next upcoming, else the first). Phone: cards show their blocks.
 */
function PlanReady({ view }: PlanReadyProps) {
  const today = localDateOf(new Date())
  const wide = useLayoutMode() === "two-column"
  const [selectedId, setSelectedId] = useState<Option.Option<PlannedSessionId>>(Option.none())
  const selected = selectedSession(view, today, selectedId)
  const aside = Option.match(selected, {
    onNone: () => <Message title="No sessions" body="This week has no planned sessions yet." />,
    onSome: (item) => (
      <ScrollView contentContainerStyle={styles.asideContent}>
        <PlannedSessionCard item={item} />
      </ScrollView>
    ),
  })
  if (!wide) {
    return (
      <Screen>
        <PlanWeek view={view} today={today} />
      </Screen>
    )
  }
  return (
    <Screen aside={aside}>
      <PlanWeek
        view={view}
        today={today}
        showBlocks={false}
        onSelectSession={(id) => setSelectedId(Option.some(id))}
        {...Option.match(selected, {
          onNone: () => ({}),
          onSome: (item) => ({ selectedSessionId: item.plannedSession.id }),
        })}
      />
    </Screen>
  )
}

const renderState = Match.type<PlanWeekState>().pipe(
  Match.tagsExhaustive({
    Loading: () => (
      <Screen>
        <View style={styles.message}>
          <ActivityIndicator size="large" color={colors.accent} accessibilityLabel="Loading plan" />
        </View>
      </Screen>
    ),
    Empty: () => (
      <Screen>
        <Message
          title="No plan this week"
          body="Ask Claude to write your plan. It shows up here."
        />
      </Screen>
    ),
    Failed: ({ message }) => (
      <Screen>
        <Message title="Could not load the plan" body={message} />
      </Screen>
    ),
    Ready: ({ view }) => <PlanReady view={view} />,
  }),
)

export default function PlanScreen() {
  const { state } = usePlanWeek()
  return renderState(state)
}

const styles = StyleSheet.create({
  message: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg, gap: 12 },
  title: { color: colors.text, fontSize: 32, fontWeight: "900", textAlign: "center" },
  body: { color: colors.textMuted, fontSize: 20, textAlign: "center" },
  asideContent: { padding: space.md, paddingTop: space.lg },
})
