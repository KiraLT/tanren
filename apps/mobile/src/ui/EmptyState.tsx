import { type StyleProp, View, type ViewStyle } from "react-native"
import { Button } from "./Button"
import { Icon, type IconName } from "./Icon"
import { Text } from "./Text"
import { useTheme } from "./theme"
import { sizes, space } from "./tokens"

export interface EmptyStateAction {
  readonly label: string
  readonly onPress: () => void
}

export interface EmptyStateProps {
  readonly icon?: IconName
  readonly title: string
  readonly body: string
  readonly action?: EmptyStateAction
  readonly style?: StyleProp<ViewStyle>
}

/** Centred empty (or failed, with `icon="warning"`) state: title, muted body, one secondary action. */
export function EmptyState({ icon, title, body, action, style }: EmptyStateProps) {
  const { colors } = useTheme()
  return (
    <View
      style={[
        {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: space.md,
          padding: space.xl,
        },
        style,
      ]}
    >
      {icon === undefined ? null : (
        <Icon name={icon} size={sizes.iconLg} color={colors.textMuted} />
      )}
      <Text variant="headline" accessibilityRole="header" style={{ textAlign: "center" }}>
        {title}
      </Text>
      <Text tone="muted" style={{ textAlign: "center" }}>
        {body}
      </Text>
      {action === undefined ? null : (
        <Button label={action.label} onPress={action.onPress} variant="secondary" />
      )}
    </View>
  )
}
