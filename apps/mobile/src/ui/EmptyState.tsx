import { type StyleProp, View, type ViewStyle } from "react-native"
import { Button } from "./Button"
import { emptyStateHeadingLevel } from "./controls"
import { Icon, type IconName } from "./Icon"
import { type HeadingLevel, Text } from "./Text"
import { useTheme } from "./theme"
import { sizes, space } from "./tokens"

export interface EmptyStateAction {
  readonly label: string
  readonly onPress: () => void
  /** Default `"secondary"` (md). `"primary"` is the screen's main action: primary fill, size lg. */
  readonly variant?: "primary" | "secondary"
}

export interface EmptyStateProps {
  readonly icon?: IconName
  readonly title: string
  readonly body: string
  readonly action?: EmptyStateAction
  /**
   * Top-aligned under a sibling card (Today below the health module): no fill, no minimum height,
   * no top padding, so the parent's gap is the whole distance. Default false: centred and filling.
   */
  readonly compact?: boolean
  /** Heading level of the title on web (default 1: the page title). Use 2 under an AppBar `h1`. */
  readonly headingLevel?: HeadingLevel
  readonly style?: StyleProp<ViewStyle>
}

/**
 * Never collapses: `flex: 1` has basis 0%, so inside a `ScrollView` content container or a
 * `FlatList` empty component (no bounded parent height) the box would shrink onto its sibling
 * above. The minimum height keeps its breathing room; in a bounded parent `flex: 1` still fills it.
 */
const MIN_HEIGHT = 240

/** Centred empty (or failed, with `icon="warning"`) state: title, muted body, one secondary action. */
export function EmptyState({
  icon,
  title,
  body,
  action,
  compact = false,
  headingLevel,
  style,
}: EmptyStateProps) {
  const { colors } = useTheme()
  return (
    <View
      style={[
        compact
          ? {
              alignItems: "center",
              justifyContent: "flex-start",
              gap: space.md,
              paddingHorizontal: space.xl,
              paddingBottom: space.xl,
            }
          : {
              flex: 1,
              minHeight: MIN_HEIGHT,
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
      <Text
        variant="headline"
        headingLevel={emptyStateHeadingLevel(headingLevel)}
        style={{ textAlign: "center" }}
      >
        {title}
      </Text>
      <Text tone="muted" style={{ textAlign: "center" }}>
        {body}
      </Text>
      {action === undefined ? null : (
        <Button
          label={action.label}
          onPress={action.onPress}
          variant={action.variant ?? "secondary"}
          size={action.variant === "primary" ? "lg" : "md"}
        />
      )}
    </View>
  )
}
