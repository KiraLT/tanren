import { Match } from "effect"
import { useRouter } from "expo-router"
import { useState } from "react"
import { StyleSheet, Text, TextInput, View } from "react-native"
import { BigButton } from "../src/components/BigButton"
import { Screen } from "../src/components/Screen"
import { colors, radius, sizes, space } from "../src/components/theme"
import {
  type MagicLinkState,
  SIGN_IN_SUPPORTED,
  SIGN_IN_WEB_ONLY_NOTICE,
  useSendMagicLink,
} from "../src/hooks/useSendMagicLink"
import { useSignedIn } from "../src/hooks/useSignedIn"

const DEV_EMAIL = "dev@tanren.local"

const SENT_TEXT = __DEV__
  ? "Link sent — locally it is printed in the wrangler terminal"
  : "Link sent — open it on this device to finish signing in"

interface StatusProps {
  readonly state: MagicLinkState
}

const renderStatus = Match.type<MagicLinkState>().pipe(
  Match.tagsExhaustive({
    Idle: () => null,
    Sending: () => (
      <Text style={styles.status} accessibilityRole="alert">
        Sending…
      </Text>
    ),
    Sent: () => (
      <Text style={[styles.status, styles.sent]} accessibilityRole="alert">
        {SENT_TEXT}
      </Text>
    ),
    Failed: ({ message }) => (
      <Text style={[styles.status, styles.failed]} accessibilityRole="alert">
        {message}
      </Text>
    ),
  }),
)

function Status({ state }: StatusProps) {
  return renderStatus(state)
}

export default function SignInScreen() {
  const router = useRouter()
  const signedIn = useSignedIn()
  const { state, send } = useSendMagicLink()
  const [email, setEmail] = useState(__DEV__ ? DEV_EMAIL : "")
  const sending = state._tag === "Sending"
  const backToToday = () => router.replace("/today")

  // Loading shows only the heading, so someone already signed in never sees the form flash.
  const body = !SIGN_IN_SUPPORTED ? (
    <>
      <Text style={styles.body} accessibilityLabel={SIGN_IN_WEB_ONLY_NOTICE}>
        {SIGN_IN_WEB_ONLY_NOTICE}
      </Text>
      <BigButton
        label="Back to Today"
        accessibilityLabel="Back to Today"
        variant="primary"
        onPress={backToToday}
      />
    </>
  ) : (
    Match.value(signedIn).pipe(
      Match.tagsExhaustive({
        Loading: () => null,
        SignedIn: () => (
          <>
            <Text style={styles.body}>You are signed in.</Text>
            <BigButton
              label="Back to Today"
              accessibilityLabel="Back to Today"
              variant="primary"
              onPress={backToToday}
            />
          </>
        ),
        SignedOut: () => (
          <>
            <Text style={styles.body}>We email you a link. Open it on this device.</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Email address"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              editable={!sending}
              onSubmitEditing={() => send(email)}
            />
            <BigButton
              label={sending ? "Sending…" : "Send magic link"}
              accessibilityLabel="Send magic link"
              variant="primary"
              disabled={sending}
              onPress={() => send(email)}
            />
            <Status state={state} />
            <BigButton
              label="Back to Today"
              accessibilityLabel="Back to Today"
              onPress={backToToday}
            />
          </>
        ),
      }),
    )
  )

  return (
    <Screen>
      <View style={styles.root}>
        <Text style={styles.caption}>TANREN</Text>
        <Text style={styles.title} accessibilityRole="header">
          Sign in
        </Text>
        {body}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: space.md, paddingTop: space.lg, gap: space.md },
  caption: { color: colors.accent, fontSize: 14, fontWeight: "800", letterSpacing: 3 },
  title: { color: colors.text, fontSize: 40, fontWeight: "900" },
  body: { color: colors.textMuted, fontSize: 20 },
  input: {
    height: sizes.tap,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 20,
    paddingHorizontal: 16,
  },
  status: { fontSize: 18, fontWeight: "700", color: colors.textMuted },
  sent: { color: colors.success },
  failed: { color: colors.danger },
})
