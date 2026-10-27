import { Array as Arr } from "effect"
import { type StyleProp, View, type ViewStyle } from "react-native"
import { space, Text, useTheme } from "../../ui"

/** 8 px colour dot before Eaten / Protein; dot + gap = 14 (docs/design/health-module.md §3). */
const DOT = 8
const DOT_GAP = 6

const VALUE_TONE = {
  neutral: "default",
  danger: "danger",
  muted: "muted",
} as const satisfies { readonly [T in HealthStatProps["valueTone"]]: string }

export interface HealthStatProps {
  /** Sentence case ("Eaten"), `label` muted. */
  readonly label: string
  /** `formatInt`-ed number, or "—" when there is none. */
  readonly value: string
  /** Caption after the value, no leading space (the row's gap is the space): "/ 155 g", "kcal". */
  readonly unit?: string | undefined
  readonly dot?: "accent" | "success" | undefined
  /** `headline` on the Today module, `title` on the `/health` hero. */
  readonly valueVariant: "headline" | "title"
  /** `danger` over budget, `muted` for a stale burned value. */
  readonly valueTone: "neutral" | "danger" | "muted"
}

interface HealthStatSlotProps extends HealthStatProps {
  /** Alignment inside the slot; `HealthStatRow` passes its own. */
  readonly align?: "start" | "center"
}

/** One stat slot: label line (16) over the value line (22 headline / 30 title); flex 1. */
export function HealthStat({
  label,
  value,
  unit,
  dot,
  valueVariant,
  valueTone,
  align = "start",
}: HealthStatSlotProps) {
  const { colors } = useTheme()
  const alignItems = align === "center" ? "center" : "flex-start"
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: DOT_GAP }}>
        {dot === undefined ? null : (
          <View
            style={{
              width: DOT,
              height: DOT,
              borderRadius: DOT / 2,
              backgroundColor: colors[dot],
            }}
          />
        )}
        <Text variant="label" tone="muted" numberOfLines={1}>
          {label}
        </Text>
      </View>
      {/* A baseline sibling (not a nested span) so the unit keeps the caption's platform face; the
          gap is the space, so unit strings carry none (designer UI-HM-r1 F3). */}
      <View
        style={{ flexDirection: "row", alignItems: "baseline", gap: space.xs, maxWidth: "100%" }}
      >
        <Text
          variant={valueVariant}
          tone={VALUE_TONE[valueTone]}
          tabular
          numberOfLines={1}
          style={{ flexShrink: 1 }}
        >
          {value}
        </Text>
        {unit === undefined ? null : (
          <Text variant="caption" tone="muted" tabular numberOfLines={1}>
            {unit}
          </Text>
        )}
      </View>
    </View>
  )
}

export interface HealthStatRowProps {
  /** Eaten, Burned, Protein (§3). */
  readonly items: readonly [HealthStatProps, HealthStatProps, HealthStatProps]
  /** `start` on the Today module and the 1280 hero, `center` on the 390 hero. */
  readonly align: "start" | "center"
  readonly style?: StyleProp<ViewStyle>
}

/** Three equal flex-1 slots, gap 8 (§3 row 2, §4 stat row). */
export function HealthStatRow({ items, align, style }: HealthStatRowProps) {
  return (
    <View style={[{ flexDirection: "row", gap: space.sm }, style]}>
      {Arr.map(items, (item) => (
        <HealthStat key={item.label} {...item} align={align} />
      ))}
    </View>
  )
}
