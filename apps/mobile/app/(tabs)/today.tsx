import { Match } from "effect"
import { Link } from "expo-router"
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Screen } from "../../src/components/Screen"
import { TodayReady } from "../../src/components/TodayReady"
import { colors, radius, space } from "../../src/components/theme"
import { SIGN_IN_SUPPORTED, SIGN_IN_WEB_ONLY_NOTICE } from "../../src/hooks/useSendMagicLink"
import { useSignedIn } from "../../src/hooks/useSignedIn"
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
      <Screen>
        <View style={styles.message}>
          <ActivityIndicator
            size="large"
            color={colors.accent}
            accessibilityLabel="Loading today"
          />
        </View>
      </Screen>
    ),
    Empty: () => (
      <Screen>
        <Message title="Nothing planned today" body="Rest up. Your next session shows up here." />
      </Screen>
    ),
    Failed: ({ message }) => (
      <Screen>
        <Message title="Could not load today" body={message} />
      </Screen>
    ),
    // Renders its own Screen: the wide aside follows the pager's current exercise.
    Ready: ({ plannedSession, exercises }) => (
      <TodayReady plannedSession={plannedSession} exercises={exercises} />
    ),
  }),
)

/** Top-right "Sign in" link over every Today state; hidden while loading and once signed in. */
function SignInEntry() {
  const signedIn = useSignedIn()
  const insets = useSafeAreaInsets()
  if (signedIn._tag !== "SignedOut") {
    return null
  }
  if (!SIGN_IN_SUPPORTED) {
    return (
      <View style={[styles.entry, { top: insets.top + space.sm }]} pointerEvents="none">
        <Text style={styles.notice} accessibilityLabel={SIGN_IN_WEB_ONLY_NOTICE}>
          {SIGN_IN_WEB_ONLY_NOTICE}
        </Text>
      </View>
    )
  }
  return (
    <View style={[styles.entry, { top: insets.top + space.sm }]} pointerEvents="box-none">
      <Link href="/sign-in" asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Sign in"
          style={({ pressed }) => [styles.entryLink, pressed && styles.entryPressed]}
        >
          <Text style={styles.entryLabel}>Sign in</Text>
        </Pressable>
      </Link>
    </View>
  )
}

export default function TodayScreen() {
  const { state } = useToday()
  return (
    <View style={styles.root}>
      {renderState(state)}
      <SignInEntry />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  entry: { position: "absolute", right: space.md, zIndex: 10 },
  entryLink: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.background,
  },
  entryPressed: { opacity: 0.7 },
  notice: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  entryLabel: { color: colors.accent, fontSize: 18, fontWeight: "800" },
  message: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg, gap: 12 },
  title: { color: colors.text, fontSize: 32, fontWeight: "900", textAlign: "center" },
  body: { color: colors.textMuted, fontSize: 20, textAlign: "center" },
})
