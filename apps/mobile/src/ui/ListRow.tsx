import { Array as Arr } from "effect"
import { Children, createContext, type ReactNode, use } from "react"
import { Pressable, type StyleProp, View, type ViewStyle } from "react-native"
import {
  DISABLED_OPACITY,
  type DiscState,
  discStyle,
  listGroupStyle,
  listSeparatorStyle,
  ROW_ICON_SLOT,
  ROW_TITLE_VARIANT,
  type RowTitleVariant,
  type RowTone,
  rowChevron,
  rowPressedBackground,
  rowStyle,
  rowTones,
  type SeparatorInset,
} from "./controls"
import { Icon, type IconName } from "./Icon"
import { usePressableInteraction } from "./interaction"
import { Text } from "./Text"
import { useTheme } from "./theme"
import { sizes } from "./tokens"

export type { DiscState, RowTitleVariant } from "./controls"

/** True inside a `ListGroup`: the row drops its own hairline (the group draws them). */
const GroupedContext = createContext(false)

/**
 * Whether the caller sits inside a `ListGroup` (a `surface` card): leading art that needs its own
 * tile uses `surfaceRaised` there, since a `surface` tile would vanish into the group.
 */
export const useGrouped = (): boolean => use(GroupedContext)

export interface ListGroupProps {
  readonly children: ReactNode
  /** Hairline start: "none" 16 (default), "icon" 48 (20 icon slot), "thumb" 84 (56 thumb rows). */
  readonly inset?: SeparatorInset
  readonly style?: StyleProp<ViewStyle>
}

/**
 * A grouped list (§5): `surface`, radius 16, hairlines between rows, never a border per row.
 * Pass rows as siblings or an array, never a fragment (hairlines are per child).
 */
export function ListGroup({ children, inset = "none", style }: ListGroupProps) {
  const { colors } = useTheme()
  const rows = Arr.flatMap(Children.toArray(children), (child, index) =>
    index === 0
      ? [child]
      : [<View key={`separator-${index}`} style={listSeparatorStyle(colors, inset)} />, child],
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
  /** Title ramp: `headline` (default), `body` for dense lists, `subhead`. */
  readonly titleVariant?: RowTitleVariant
  readonly subtitle?: string
  /**
   * Free leading slot; `disc` / `icon` are the standard ones and win over it. `null` (not
   * `undefined`) keeps a 20 px empty slot (`ROW_ICON_SLOT`), so the title aligns with icon rows.
   */
  readonly leading?: ReactNode
  /** Numbered disc: done (check), now (accent), todo (outline). */
  readonly disc?: RowDisc
  /** 20 px leading glyph in `textMuted`. */
  readonly icon?: IconName
  readonly trailing?: ReactNode
  /** Trailing 20 px `chevronRight` in `textMuted` (after `trailing`): this row opens something. */
  readonly chevron?: boolean
  /** `danger`: title (and `icon`) in `danger`, transparent background, `surfaceRaised` pressed. */
  readonly tone?: RowTone
  /** Dimmed and not pressable. */
  readonly disabled?: boolean
  readonly onPress?: () => void
  readonly selected?: boolean
  /** The row holds a 56 px thumb: min height 64, vertical padding 4 (instead of 52 / 8). */
  readonly thumb?: boolean
  readonly accessibilityLabel?: string
  readonly style?: StyleProp<ViewStyle>
}

/** One row (min 52, grows with Dynamic Type); put rows in a `ListGroup` for hairline grouping. */
export function ListRow({
  title,
  titleVariant = ROW_TITLE_VARIANT,
  subtitle,
  leading,
  disc,
  icon,
  trailing,
  chevron = false,
  tone = "default",
  disabled = false,
  onPress,
  selected = false,
  thumb = false,
  accessibilityLabel,
  style,
}: ListRowProps) {
  const { colors } = useTheme()
  const grouped = useGrouped()
  const { hovered, handlers, focusStyle } = usePressableInteraction()
  const base = [
    rowStyle(grouped, selected, colors, thumb),
    disabled && { opacity: DISABLED_OPACITY },
  ]
  const toneSpec = rowTones[tone]
  const lead =
    disc !== undefined ? (
      <Disc state={disc.state} index={disc.index} />
    ) : icon !== undefined ? (
      <Icon name={icon} size={sizes.iconSm} color={colors[toneSpec.icon]} />
    ) : leading === null ? (
      <View style={{ width: ROW_ICON_SLOT }} />
    ) : (
      leading
    )
  const content = (
    <>
      {lead}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant={titleVariant} tone={toneSpec.title}>
          {title}
        </Text>
        {subtitle === undefined ? null : (
          <Text variant="subhead" tone="muted">
            {subtitle}
          </Text>
        )}
      </View>
      {trailing}
      {chevron ? (
        <Icon name="chevronRight" size={rowChevron.glyph} color={colors[rowChevron.color]} />
      ) : null}
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
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      {...label}
      {...handlers}
      style={({ pressed }) => [
        base,
        !disabled &&
          (hovered || pressed) && {
            backgroundColor: rowPressedBackground(grouped, colors, tone),
          },
        focusStyle,
        style,
      ]}
    >
      {content}
    </Pressable>
  )
}
