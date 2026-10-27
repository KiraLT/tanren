import { useRouter } from "expo-router"
import { useState } from "react"
import { Image, type ImageStyle, TextInput, View, type ViewStyle } from "react-native"
import { InlineAnchor } from "../src/components/legal/LegalPage"
import { SIGN_IN_AGREEMENT_PARTS } from "../src/components/legal/legalCopy"
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

/** The W1 brush wordmark (LOGO-4, plan Amendment 15) is an image: its height here, and the file's aspect. */
const WORDMARK_HEIGHT = 56
const WORDMARK_ASPECT = 1280 / 286

/** Sign-in column cap on wide windows (centred inside the page frame, no card). */
const COLUMN_MAX_WIDTH = 420

export default function SignInScreen() {
  const router = useRouter()
  const signedIn = useSignedIn()
  const gated = useAuthGate("/home") === "sign-in"
  const { state, send } = useSendMagicLink()
  const [email, setEmail] = useState(__DEV__ ? DEV_EMAIL : "")
  const styles = useStyles(createStyles)
  const { colors, scheme } = useTheme()
  const sending = state._tag === "Sending"
  const sent = state._tag === "Sent"
  const backToHome = () => router.replace("/home")
  const backButton = gated ? null : (
    // Gated device (ADR-0019): Today would only bounce back here.
    <Button label="Back to Home" variant="text" onPress={backToHome} />
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
      <Button label="Back to Home" variant="primary" size="lg" onPress={backToHome} />
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
        <Text variant="caption" tone="muted" testID="sign-in-agreement">
          {SIGN_IN_AGREEMENT_PARTS.map((part) =>
            "href" in part ? (
              <InlineAnchor key={part.href} label={part.text} href={part.href} />
            ) : (
              part.text
            ),
          )}
        </Text>
        {backButton}
      </>
    )

  return (
    <Page scroll>
      <View style={column}>
        {/* Off-white ink on dark pages, graphite ink with the burnt-orange hook on light ones. */}
        <Image
          source={scheme === "dark" ? WORDMARK : WORDMARK_PAPER}
          style={wordmarkStyle}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          accessibilityRole="image"
          accessibilityLabel="Tanren"
        />
        <Text variant="display" accessibilityRole="header">
          {sent ? "Check your email" : "Sign in"}
        </Text>
        {intro}
        {body}
      </View>
    </Page>
  )
}

const WORDMARK = require("../assets/brand/wordmark.png")
const WORDMARK_PAPER = require("../assets/brand/wordmark-paper.png")

/** The W1 lockup (LOGO-4): 56 px high, width from the 1280 x 286 file's aspect. */
const wordmarkStyle: ImageStyle = {
  height: WORDMARK_HEIGHT,
  width: Math.round(WORDMARK_HEIGHT * WORDMARK_ASPECT),
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
