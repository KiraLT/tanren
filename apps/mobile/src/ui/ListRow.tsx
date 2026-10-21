import { Array as Arr } from "effect"
import { Children, createContext, type ReactNode, use } from "react"
import { Pressable, type StyleProp, View, type ViewStyle } from "react-native"
import {
  type DiscState,
  discStyle,
  listGroupStyle,
  listSeparatorStyle,
  rowPressedBackground,
  rowStyle,
} from "./controls"
import { Icon, type IconName } from "./Icon"
import { usePressableInteraction } from "./interaction"
import { Text } from "./Text"
import { useTheme } from "./theme"
import { sizes } from "./tokens"

export type { DiscState } from "./controls"

/** True inside a `ListGroup`: the row drops its own hairline (the group draws them). */
const GroupedContext = createContext(false)

export interface ListGroupProps {
  readonly children: ReactNode
  readonly style?: StyleProp<ViewStyle>
}

/** A grouped list (§5): `surface`, radius 16, hairlines between rows, never a border per row. */
export function ListGroup({ children, style }: ListGroupProps) {
  const { colors } = useTheme()
  const rows = Arr.flatMap(Children.toArray(children), (child, index) =>
    index === 0
      ? [child]
      : [<View key={`separator-${index}`} style={listSeparatorStyle(colors)} />, child],
  )
  return (
    <GroupedContext value={true}>
      <View style={[listGroupStyle(colors), style]}>{rows}</View>
    </GroupedContext>
  )
}

export interface RowDisc {
  readonly state: DiscState
  /** 1-based number shown on `now`/`todo`; `done` shows a check. */
  readonly index: number
}

function Disc({ state, index }: RowDisc) {
  const { colors } = useTheme()
  const spec = discStyle(state, colors)
  const color = colors[spec.foreground]
  return (
    <View
      style={spec.container}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {state === "done" ? (
        <Icon name="check" size={sizes.iconXs} color={color} />
      ) : (
        <Text variant="label" style={{ color, fontVariant: ["tabular-nums"] }}>
          {String(index)}
        </Text>
      )}
    </View>
  )
}

export interface ListRowProps {
  readonly title: string
  readonly subtitle?: string
  /** Free leading slot; `disc` / `icon` are the standard ones and win over it. */
  readonly leading?: ReactNode
  /** Numbered disc: done (check), now (accent), todo (outline). */
  readonly disc?: RowDisc
  /** 20 px leading glyph in `textMuted`. */
  readonly icon?: IconName
  readonly trailing?: ReactNode
  readonly onPress?: () => void
  readonly selected?: boolean
  readonly accessibilityLabel?: string
  readonly style?: StyleProp<ViewStyle>
}

/** One row (min 52, grows with Dynamic Type); put rows in a `ListGroup` for hairline grouping. */
export function ListRow({
  title,
  subtitle,
  leading,
  disc,
  icon,
  trailing,
  onPress,
  selected = false,
  accessibilityLabel,
  style,
}: ListRowProps) {
  const { colors } = useTheme()
  const grouped = use(GroupedContext)
  const { hovered, handlers, focusStyle } = usePressableInteraction()
  const base = rowStyle(grouped, selected, colors)
  const lead =
    disc !== undefined ? (
      <Disc state={disc.state} index={disc.index} />
    ) : icon !== undefined ? (
      <Icon name={icon} size={sizes.iconSm} color={colors.textMuted} />
    ) : (
      leading
    )
  const content = (
    <>
      {lead}
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
        (hovered || pressed) && { backgroundColor: rowPressedBackground(grouped, colors) },
        focusStyle,
        style,
      ]}
    >
      {content}
    </Pressable>
  )
}
