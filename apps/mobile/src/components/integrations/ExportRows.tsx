import type { ActivityExportId } from "@tanren/shared"
import { Linking, View } from "react-native"
import type { ActionState } from "../../hooks/useIntegrations"
import { Button, EmptyState, ListGroup, ListRow, StatusPill, space, Text } from "../../ui"
import {
  EXPORTS_EMPTY_BODY,
  EXPORTS_EMPTY_TITLE,
  type ExportRowCopy,
} from "../settings/integrationsCopy"

export interface ExportRowsProps {
  readonly rows: ReadonlyArray<ExportRowCopy>
  readonly action: ActionState
  readonly onRetry: (id: ActivityExportId) => void
}

/**
 * Compact Retry: `md` height (48) with 12 px side padding instead of 24, so pill + Retry leave the
 * title column >= 138 px at 390 (design §8 arithmetic, in the report).
 */
const RETRY_STYLE = { paddingHorizontal: space.md } as const

function ExportRow({
  row,
  action,
  onRetry,
}: {
  readonly row: ExportRowCopy
  readonly action: ActionState
  readonly onRetry: (id: ActivityExportId) => void
}) {
  const pill = <StatusPill label={row.pill.label} tone={row.pill.tone} />
  const label = `${row.title}, ${row.pill.label}`
  if (row.action._tag === "View") {
    const url = row.action.url
    return (
      <ListRow
        icon={row.icon}
        title={row.title}
        subtitle={row.subtitle}
        trailing={pill}
        chevron
        onPress={() => {
          Linking.openURL(url)
        }}
        accessibilityLabel={`${label}, view on Strava`}
      />
    )
  }
  if (row.action._tag === "Retry") {
    const { id, accessibilityLabel } = row.action
    const busy = action._tag === "Busy" && action.action === id
    return (
      <ListRow
        icon={row.icon}
        title={row.title}
        subtitle={row.subtitle}
        accessibilityLabel={label}
        trailing={
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            {pill}
            <Button
              label="Retry"
              variant="secondary"
              size="md"
              loading={busy}
              disabled={action._tag === "Busy"}
              accessibilityLabel={accessibilityLabel}
              onPress={() => onRetry(id)}
              style={RETRY_STYLE}
            />
          </View>
        }
      />
    )
  }
  return (
    <ListRow
      icon={row.icon}
      title={row.title}
      subtitle={row.subtitle}
      trailing={pill}
      accessibilityLabel={label}
    />
  )
}

/** "Recent exports": newest first (the worker's order), at most `RECENT_EXPORTS`. */
export function ExportRows({ rows, action, onRetry }: ExportRowsProps) {
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="headline" accessibilityRole="header">
        Recent exports
      </Text>
      {rows.length === 0 ? (
        <EmptyState icon="clock" title={EXPORTS_EMPTY_TITLE} body={EXPORTS_EMPTY_BODY} />
      ) : (
        <ListGroup>
          {rows.map((row) => (
            <ExportRow key={row.key} row={row} action={action} onRetry={onRetry} />
          ))}
        </ListGroup>
      )}
    </View>
  )
}
