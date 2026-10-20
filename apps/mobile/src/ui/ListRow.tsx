import type { ReactNode } from "react"
import { Pressable, type StyleProp, View, type ViewStyle } from "react-native"
import { usePressableInteraction } from "./interaction"
import { Text } from "./Text"
import { useTheme } from "./theme"
import { space, stroke } from "./tokens"

export interface ListRowProps {
  readonly title: string
  readonly subtitle?: string
  readonly leading?: ReactNode
  readonly trailing?: ReactNode
  readonly onPress?: () => void
  readonly selected?: boolean
  readonly accessibilityLabel?: string
  readonly style?: StyleProp<ViewStyle>
}

/** One row of a grouped list: hairline bottom border, grows with Dynamic Type (min 56). */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  selected = false,
  accessibilityLabel,
  style,
}: ListRowProps) {
  const { colors } = useTheme()
  const { hovered, handlers, focusStyle } = usePressableInteraction()
  const base: ViewStyle = {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: stroke.hairline,
    borderBottomColor: colors.border,
    backgroundColor: selected ? colors.accentSoft : "transparent",
  }
  const content = (
    <>
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="headline">{title}</Text>
        {subtitle === undefined ? null : (
          <Text variant="subhead" tone="muted">
            {subtitle}
          </Text>
        )}
      </View>
      {trailing}
    </>
  )
  const label = accessibilityLabel === undefined ? {} : { accessibilityLabel }
  if (onPress === undefined) {
    return (
      <View style={[base, style]} {...label}>
        {content}
      </View>
    )
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      {...label}
      {...handlers}
      style={({ pressed }) => [
        base,
        (hovered || pressed) && { backgroundColor: colors.surface },
        focusStyle,
        style,
      ]}
    >
      {content}
    </Pressable>
  )
}
