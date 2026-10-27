import type { ProviderStatus } from "@tanren/shared"
import { type DateTime, Option } from "effect"
import { useState } from "react"
import { Linking, TextInput, View } from "react-native"
import type { ActionState } from "../../hooks/useIntegrations"
import {
  Button,
  Card,
  radius,
  rhythm,
  StatusPill,
  sizes,
  space,
  stroke,
  Text,
  type Theme,
  type,
  useStyles,
  useTheme,
} from "../../ui"
import {
  canSubmitToken,
  GARMIN,
  GARMIN_TOKEN_URL,
  garminConnectedLine,
  garminVisibleFailure,
  providerRow,
  tokenAddedLine,
} from "../settings/integrationsCopy"
import { StatusBanner } from "./StatusBanner"

export interface GarminCardProps {
  readonly garmin: ProviderStatus
  readonly zone: DateTime.TimeZone
  readonly action: ActionState
  /** Receives the trimmed token; the card clears its field right after. */
  readonly onConnect: (token: string) => void
  readonly onDisconnect: () => void
}

/**
 * Paste-token field (design §8 / §5). The token lives only in this component's state, is trimmed
 * before it leaves, and is cleared on every attempt; it is never logged or persisted.
 */
function TokenForm({
  busy,
  connecting,
  onConnect,
}: {
  readonly busy: boolean
  readonly connecting: boolean
  readonly onConnect: (token: string) => void
}) {
  const { colors } = useTheme()
  const styles = useStyles(createStyles)
  const [token, setToken] = useState("")
  const ready = canSubmitToken(token) && !busy
  const submit = () => {
    if (!ready) return
    onConnect(token.trim())
    setToken("")
  }
  return (
    <>
      <TextInput
        style={styles.input}
        value={token}
        onChangeText={setToken}
        onSubmitEditing={submit}
        placeholder={GARMIN.placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={GARMIN.placeholder}
        secureTextEntry
        autoCorrect={false}
        autoCapitalize="none"
        autoComplete="off"
        textContentType="password"
        editable={!busy}
      />
      <Text
        variant="caption"
        tone="accent"
        accessibilityRole="link"
        onPress={() => {
          void Linking.openURL(GARMIN_TOKEN_URL)
        }}
      >
        {GARMIN.tokenLink}
      </Text>
      <Button
        // No spinner while connecting: the label itself says it can take up to 30 s.
        label={connecting ? GARMIN.connecting : GARMIN.connect}
        accessibilityLabel={connecting ? GARMIN.connecting : GARMIN.connect}
        variant="primary"
        size="lg"
        disabled={!ready || connecting}
        onPress={submit}
        style={{ alignSelf: "stretch" }}
      />
    </>
  )
}

/** Garmin's card: paste-token connect (disconnected, revoked) or the import summary + Disconnect. */
export function GarminCard({ garmin, zone, action, onConnect, onDisconnect }: GarminCardProps) {
  const pill = providerRow(garmin, zone).pill
  const busy = action._tag === "Busy"
  const failure = garminVisibleFailure(action, garmin.state)
  return (
    <View style={{ gap: space.lg }}>
      {garmin.state === "revoked" ? (
        <StatusBanner tone="danger" title={GARMIN.revokedTitle} body={GARMIN.revokedBody} />
      ) : null}
      <Card padding={rhythm.cardPadding}>
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Text variant="headline" accessibilityRole="header" style={{ flex: 1 }}>
              Garmin
            </Text>
            <StatusPill label={pill.label} tone={pill.tone} />
          </View>
          {garmin.state === "connected" ? (
            <>
              <Text>{garminConnectedLine(garmin)}</Text>
              {Option.match(tokenAddedLine(garmin, zone), {
                onNone: () => null,
                onSome: (line) => (
                  <Text variant="caption" tone="muted">
                    {line}
                  </Text>
                ),
              })}
              <Text variant="caption" tone="muted">
                {GARMIN.expiry}
              </Text>
              <Button
                label={
                  busy && action.action === "disconnect" ? "Disconnecting…" : GARMIN.disconnect
                }
                accessibilityLabel={GARMIN.disconnect}
                variant="destructive"
                size="lg"
                loading={busy && action.action === "disconnect"}
                disabled={busy}
                onPress={onDisconnect}
                style={{ alignSelf: "stretch" }}
              />
            </>
          ) : (
            <>
              <Text tone="muted">{GARMIN.body}</Text>
              <TokenForm
                busy={busy}
                connecting={busy && action.action === "connect"}
                onConnect={onConnect}
              />
            </>
          )}
        </View>
      </Card>
      {Option.match(failure, {
        onNone: () => null,
        onSome: (banner) => <StatusBanner {...banner} />,
      })}
    </View>
  )
}

const createStyles = ({ colors }: Theme) => ({
  input: {
    ...type.body,
    minHeight: sizes.control,
    borderRadius: radius.md,
    borderCurve: "continuous" as const,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: space.lg,
  },
})
