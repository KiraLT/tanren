import { useRouter } from "expo-router"
import { useState } from "react"
import { TextInput, View, type ViewStyle } from "react-native"
import { useAuthGate } from "../src/hooks/useAuthGate"
import {
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

/** The wordmark is a logotype, not UI chrome: literal capitals with open tracking. */
const WORDMARK_TRACKING = 4

/** Sign-in column cap on wide windows (centred inside the page frame, no card). */
const COLUMN_MAX_WIDTH = 420

export default function SignInScreen() {
  const router = useRouter()
  const signedIn = useSignedIn()
  const gated = useAuthGate("/today") === "sign-in"
  const { state, send } = useSendMagicLink()
  const [email, setEmail] = useState(__DEV__ ? DEV_EMAIL : "")
  const styles = useStyles(createStyles)
  const { colors } = useTheme()
  const sending = state._tag === "Sending"
  const sent = state._tag === "Sent"
  const backToToday = () => router.replace("/today")
  const backButton = gated ? null : (
    // Gated device (ADR-0019): Today would only bounce back here.
    <Button label="Back to Today" variant="text" onPress={backToToday} />
  )

  // Loading shows only the heading, so someone already signed in never sees the form flash.
  const intro = !SIGN_IN_SUPPORTED ? (
    <Text variant="subhead" tone="muted" accessibilityLabel={SIGN_IN_WEB_ONLY_NOTICE}>
      {SIGN_IN_WEB_ONLY_NOTICE}
    </Text>
  ) : signedIn._tag === "SignedIn" ? (
    <Text variant="subhead" tone="muted">
      You are signed in.
    </Text>
  ) : signedIn._tag === "SignedOut" ? (
    <Text variant="subhead" tone="muted">
      {sent ? "It works once, on this device." : "We’ll email you a link. It works once."}
    </Text>
  ) : null

  const body =
    !SIGN_IN_SUPPORTED || signedIn._tag === "SignedIn" ? (
      <Button label="Back to Today" variant="primary" size="lg" onPress={backToToday} />
    ) : signedIn._tag === "Loading" ? null : sent ? (
      <>
        <Text variant="headline" accessibilityLabel={`Link sent to ${email}`}>
          {email}
        </Text>
        <Button
          label="Send again"
          variant="secondary"
          size="lg"
          disabled={sending}
          onPress={() => send(email)}
        />
        {backButton}
      </>
    ) : (
      <>
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
        {state._tag === "Failed" ? (
          <Banner tone="danger" title="Could not send the link" body={state.message} />
        ) : null}
        <Button
          label={sending ? "Sending…" : "Send sign-in link"}
          accessibilityLabel="Send sign-in link"
          variant="primary"
          size="lg"
          loading={sending}
          disabled={sending}
          onPress={() => send(email)}
        />
        {backButton}
      </>
    )

  return (
    <Page scroll>
      <View style={column}>
        <Text
          variant="title"
          accessibilityLabel="Tanren"
          style={{ letterSpacing: WORDMARK_TRACKING }}
        >
          TANREN
        </Text>
        <Text variant="display" accessibilityRole="header">
          {sent ? "Check your email" : "Sign in"}
        </Text>
        {intro}
        {body}
      </View>
    </Page>
  )
}

const column: ViewStyle = {
  width: "100%",
  maxWidth: COLUMN_MAX_WIDTH,
  alignSelf: "center",
  gap: space.lg,
  paddingTop: space.xxxl,
}

const createStyles = ({ colors }: Theme) => ({
  input: {
    ...type.body,
    minHeight: sizes.controlLg,
    borderRadius: radius.lg,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: space.lg,
  },
})
