import type { Provider, ProviderStatus } from "@tanren/shared"
import type { DateTime } from "effect"
import { View } from "react-native"
import { Card, type IconName, ListGroup, ListRow, rhythm, StatusPill, space, Text } from "../../ui"
import {
  ABOUT_BODIES,
  ABOUT_TITLE,
  type AboutScope,
  APPLE_HEALTH,
  providerRow,
} from "../settings/integrationsCopy"

export interface ProviderListProps {
  readonly strava: ProviderStatus
  readonly garmin: ProviderStatus
  readonly zone: DateTime.TimeZone
  readonly onOpen: (provider: Provider) => void
}

const ICONS: { readonly [P in Provider]: IconName } = { strava: "swap", garmin: "download" }

/** The Integrations list: Strava and Garmin (each opens its detail), then the static Apple Health row. */
export function ProviderList({ strava, garmin, zone, onOpen }: ProviderListProps) {
  return (
    <ListGroup>
      {[strava, garmin].map((status) => {
        const row = providerRow(status, zone)
        return (
          <ListRow
            key={status.provider}
            icon={ICONS[status.provider]}
            title={row.title}
            subtitle={row.subtitle}
            trailing={<StatusPill label={row.pill.label} tone={row.pill.tone} />}
            chevron
            onPress={() => onOpen(status.provider)}
            accessibilityLabel={row.accessibilityLabel}
          />
        )
      })}
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

/** Desktop side column: what the integrations on this page do (`scope` = list or one provider). */
export function AboutIntegrations({ scope }: { readonly scope: AboutScope }) {
  return (
    <Card padding={rhythm.cardPadding}>
      <View style={{ gap: space.sm }}>
        <Text variant="headline" accessibilityRole="header">
          {ABOUT_TITLE}
        </Text>
        <Text tone="muted">{ABOUT_BODIES[scope]}</Text>
      </View>
    </Card>
  )
}
