import type { ReactNode } from "react"
import { View } from "react-native"
import { Card, space, Text } from "../../ui"

export interface SettingsSectionProps {
  readonly title: string
  readonly children: ReactNode
}

/** A titled group: a `caption` heading over one card whose rows are `ListRow`s. */
export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="caption" tone="muted" accessibilityRole="header">
        {title}
      </Text>
      <Card padding={0} style={{ overflow: "hidden" }}>
        {children}
      </Card>
    </View>
  )
}
