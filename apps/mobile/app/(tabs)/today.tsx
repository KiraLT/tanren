import { Match } from "effect"
import { ActivityIndicator, StyleSheet, Text, View } from "react-native"
import { Screen } from "../../src/components/Screen"
import { TodayReady } from "../../src/components/TodayReady"
import { colors, space } from "../../src/components/theme"
import { type TodayState, useToday } from "../../src/hooks/useToday"

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

const renderState = Match.type<TodayState>().pipe(
  Match.tagsExhaustive({
    Loading: () => (
      <View style={styles.message}>
        <ActivityIndicator size="large" color={colors.accent} accessibilityLabel="Loading today" />
      </View>
    ),
    Empty: () => (
      <Message title="Nothing planned today" body="Rest up. Your next session shows up here." />
    ),
    Failed: ({ message }) => <Message title="Could not load today" body={message} />,
    Ready: ({ plannedSession, exercises }) => (
      <TodayReady plannedSession={plannedSession} exercises={exercises} />
    ),
  }),
)

export default function TodayScreen() {
  const { state } = useToday()
  return <Screen>{renderState(state)}</Screen>
}

const styles = StyleSheet.create({
  message: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg, gap: 12 },
  title: { color: colors.text, fontSize: 32, fontWeight: "900", textAlign: "center" },
  body: { color: colors.textMuted, fontSize: 20, textAlign: "center" },
})
