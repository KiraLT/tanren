import type { ReactNode } from "react"
import { Pressable, View } from "react-native"
import { Icon, ListGroup, sizes, space, Text, useTheme } from "../../ui"

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
    <View style={{ gap: space.sm }}>
      <Text variant="headline" accessibilityRole="header">
        {title}
      </Text>
      <ListGroup>{children}</ListGroup>
    </View>
  )
}

/** Trailing 20 px chevron of a row that opens something. */
export function Chevron() {
  const { colors } = useTheme()
  return <Icon name="chevronRight" size={sizes.iconSm} color={colors.textMuted} />
}

export interface DestructiveRowProps {
  readonly title: string
  readonly subtitle?: string
  readonly accessibilityLabel: string
  readonly onPress: () => void
  readonly disabled?: boolean
}

/** iOS-style destructive row: `danger` title on a transparent background, no filled slab. */
export function DestructiveRow({
  title,
  subtitle,
  accessibilityLabel,
  onPress,
  disabled = false,
}: DestructiveRowProps) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: sizes.control,
          justifyContent: "center",
          gap: 2,
          paddingHorizontal: space.lg,
          paddingVertical: space.sm,
          backgroundColor: pressed ? colors.surfaceRaised : "transparent",
        },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text variant="headline" tone="danger">
        {title}
      </Text>
      {subtitle === undefined ? null : (
        <Text variant="subhead" tone="muted">
          {subtitle}
        </Text>
      )}
    </Pressable>
  )
}
