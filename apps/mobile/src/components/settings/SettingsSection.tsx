import type { ReactNode } from "react"
import { View } from "react-native"
import { ListGroup, rhythm, Text } from "../../ui"

export interface SettingsSectionProps {
  readonly title: string
  readonly children: ReactNode
}

/**
 * A titled group: a `headline` heading over one `ListGroup`. Rows are direct children (a fragment
 * counts as one child and would lose its hairlines, so pass arrays or separate elements).
 */
export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <View style={{ gap: rhythm.labelToGroup }}>
      <Text variant="headline" accessibilityRole="header">
        {title}
      </Text>
      <ListGroup>{children}</ListGroup>
    </View>
  )
}
