import type { ProviderStatus } from "@tanren/shared"
import type { DateTime } from "effect"
import { View } from "react-native"
import type { ActionState } from "../../hooks/useIntegrations"
import { Button, Card, ListGroup, ListRow, rhythm, StatusPill, space, Text } from "../../ui"
import {
  CONNECT_LABEL,
  DETAIL_BODY,
  DISCONNECT_LABEL,
  detailHeadline,
  failureBody,
  failureTitle,
  providerRow,
} from "../settings/integrationsCopy"
import { StatusBanner } from "./StatusBanner"

export interface StravaCardProps {
  readonly strava: ProviderStatus
  readonly zone: DateTime.TimeZone
  readonly action: ActionState
  readonly onConnect: () => void
  readonly onDisconnect: () => void
}

/**
 * Provider card: who is connected, what Tanren sends, Connect (disconnected or revoked) and the
 * danger Disconnect row (connected or revoked). Connect is the Forge primary `lg` Button (56 px,
 * above Strava's 48 px minimum) with the brand's exact label.
 */
export function StravaCard({ strava, zone, action, onConnect, onDisconnect }: StravaCardProps) {
  const pill = providerRow(strava, zone).pill
  const busy = action._tag === "Busy"
  const canConnect = strava.state !== "connected"
  const canDisconnect = strava.state !== "disconnected"
  return (
    <View style={{ gap: space.lg }}>
      <Card padding={rhythm.cardPadding}>
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Text variant="headline" style={{ flex: 1 }}>
              {detailHeadline(strava)}
            </Text>
            <StatusPill label={pill.label} tone={pill.tone} />
          </View>
          <Text tone="muted">{DETAIL_BODY}</Text>
          {canConnect ? (
            <Button
              label={CONNECT_LABEL}
              variant="primary"
              size="lg"
              loading={busy && action.action === "connect"}
              disabled={busy}
              onPress={onConnect}
              style={{ alignSelf: "stretch" }}
            />
          ) : null}
        </View>
      </Card>
      {canDisconnect ? (
        <ListGroup>
          <ListRow
            tone="danger"
            title={busy && action.action === "disconnect" ? "Disconnecting…" : DISCONNECT_LABEL}
            accessibilityLabel={DISCONNECT_LABEL}
            disabled={busy}
            onPress={onDisconnect}
          />
        </ListGroup>
      ) : null}
      {action._tag === "Failed" ? (
        <StatusBanner
          tone="danger"
          title={failureTitle(action.reason)}
          body={failureBody(action.reason)}
        />
      ) : null}
    </View>
  )
}
