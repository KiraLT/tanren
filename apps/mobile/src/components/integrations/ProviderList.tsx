import type { ProviderStatus } from "@tanren/shared"
import type { DateTime } from "effect"
import { View } from "react-native"
import { Card, ListGroup, ListRow, rhythm, StatusPill, space, Text } from "../../ui"
import { ABOUT_BODY, ABOUT_TITLE, APPLE_HEALTH, providerRow } from "../settings/integrationsCopy"

export interface ProviderListProps {
  readonly strava: ProviderStatus
  readonly zone: DateTime.TimeZone
  readonly onOpen: () => void
}

/** The Integrations list: Strava (opens the detail) and the static Apple Health row. */
export function ProviderList({ strava, zone, onOpen }: ProviderListProps) {
  const row = providerRow(strava, zone)
  return (
    <ListGroup>
      <ListRow
        icon="swap"
        title={row.title}
        subtitle={row.subtitle}
        trailing={<StatusPill label={row.pill.label} tone={row.pill.tone} />}
        chevron
        onPress={onOpen}
        accessibilityLabel={row.accessibilityLabel}
      />
      <ListRow
        icon="zap"
        title={APPLE_HEALTH.title}
        trailing={<StatusPill label={APPLE_HEALTH.pill} tone="neutral" align="center" />}
        // Not `disabled`: ListRow dims the whole row (`opacity` DISABLED_OPACITY, ListRow.tsx
        // `base`), which dropped the pill text to about 2.1:1. The row has no `onPress`, so it
        // is inert without the flag.
        accessibilityLabel={`${APPLE_HEALTH.title}, ${APPLE_HEALTH.pill}`}
      />
    </ListGroup>
  )
}

/** Desktop side column of the list: what integrations do. */
export function AboutIntegrations() {
  return (
    <Card padding={rhythm.cardPadding}>
      <View style={{ gap: space.sm }}>
        <Text variant="headline" accessibilityRole="header">
          {ABOUT_TITLE}
        </Text>
        <Text tone="muted">{ABOUT_BODY}</Text>
      </View>
    </Card>
  )
}
