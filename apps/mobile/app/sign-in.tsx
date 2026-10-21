import { Match } from "effect"
import { useRouter } from "expo-router"
import { useState } from "react"
import { TextInput } from "react-native"
import {
  type MagicLinkState,
  SIGN_IN_SUPPORTED,
  SIGN_IN_WEB_ONLY_NOTICE,
  useSendMagicLink,
} from "../src/hooks/useSendMagicLink"
import { useSignedIn } from "../src/hooks/useSignedIn"
import {
  Banner,
  Button,
  Page,
  radius,
  sizes,
  space,
  stroke,
  Text,
  type Theme,
  type,
  useStyles,
  useTheme,
} from "../src/ui"

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
    // The primary button shows its own loading state while sending.
    Sending: () => null,
    Sent: () => <Banner tone="success" title="Check your email" body={SENT_TEXT} />,
    Failed: ({ message }) => (
      <Banner tone="danger" title="Could not send the link" body={message} />
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
  const styles = useStyles(createStyles)
  const { colors } = useTheme()
  const sending = state._tag === "Sending"
  const backToToday = () => router.replace("/today")

  // Loading shows only the heading, so someone already signed in never sees the form flash.
  const body = !SIGN_IN_SUPPORTED ? (
    <>
      <Text tone="muted" accessibilityLabel={SIGN_IN_WEB_ONLY_NOTICE}>
        {SIGN_IN_WEB_ONLY_NOTICE}
      </Text>
      <Button label="Back to Today" variant="primary" onPress={backToToday} />
    </>
  ) : (
    Match.value(signedIn).pipe(
      Match.tagsExhaustive({
        Loading: () => null,
        SignedIn: () => (
          <>
            <Text tone="muted">You are signed in.</Text>
            <Button label="Back to Today" variant="primary" onPress={backToToday} />
          </>
        ),
        SignedOut: () => (
          <>
            <Text tone="muted">We email you a link. Open it on this device.</Text>
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
            <Button
              label={sending ? "Sending…" : "Send magic link"}
              accessibilityLabel="Send magic link"
              variant="primary"
              loading={sending}
              disabled={sending}
              onPress={() => send(email)}
            />
            <Status state={state} />
            <Button label="Back to Today" variant="text" onPress={backToToday} />
          </>
        ),
      }),
    )
  )

  return (
    <Page scroll>
      <Text variant="display" accessibilityRole="header">
        Sign in
      </Text>
      {body}
    </Page>
  )
}

const createStyles = ({ colors }: Theme) => ({
  input: {
    ...type.body,
    minHeight: sizes.tap,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: space.lg,
  },
})
