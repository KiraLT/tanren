import { Array as Arr, Option } from "effect"
import { useRouter } from "expo-router"
import { type StyleProp, View, type ViewStyle } from "react-native"
import { useNutritionDay } from "../../hooks/useNutritionDay"
import { Card, HealthRings, space, stroke, Text } from "../../ui"
import { HealthStatRow } from "../health/HealthStats"
import { moduleHidden, moduleLabel, moduleStats } from "../health/nutritionText"
import { localDateOf } from "../planFormat"
import { heroNumber, isStale, metaLine, ringFractions, ringsLabel } from "./healthModuleMath"

/** Ring diameter on Today (docs/design/health-module.md §3 row 1). */
const RING = 104

export interface HealthModuleProps {
  readonly style?: StyleProp<ViewStyle>
}

/**
 * Today's health card (health-module.md §3, merge direction): the double ring (eaten / budget
 * outside, protein / target inside) beside the "Left today" numeral; Eaten · Burned · Protein; the
 * steps caption with "as of HH:MM"; the first insight. The whole card opens `/health`. Renders
 * nothing while loading, on a failed read, and with no targets, no Garmin total and nothing logged
 * (§6). The device's calendar day at render.
 */
export function HealthModule({ style }: HealthModuleProps) {
  const router = useRouter()
  const state = useNutritionDay(localDateOf(new Date()))
  if (state._tag !== "Ready" || moduleHidden(state.value.day)) {
    return null
  }
  const { day, insights } = state.value
  const now = new Date()
  const fractions = ringFractions(day)
  const hero = heroNumber(day)
  const meta = metaLine(day, now)
  const insight = Option.map(Arr.head(insights), (first) => first.text)
  return (
    <Card
      // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
      onPress={() => router.push("/health")}
      accessibilityLabel={moduleLabel(day, hero, meta, insight)}
      style={style}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <HealthRings
          size={RING}
          stroke={stroke.ring}
          outer={{
            progress: Option.getOrElse(fractions.eaten, () => 0),
            tone: fractions.over ? "danger" : "accent",
          }}
          inner={{ progress: Option.getOrElse(fractions.protein, () => 0), tone: "success" }}
          empty={Option.isNone(day.targets)}
          accessibilityLabel={ringsLabel(fractions)}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="label" tone="muted" numberOfLines={1}>
            {hero.label}
          </Text>
          <Text
            variant="display"
            tone={hero.tone === "danger" ? "danger" : "default"}
            tabular
            numberOfLines={1}
          >
            {hero.value}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {hero.caption}
          </Text>
        </View>
      </View>
      <HealthStatRow
        items={moduleStats(day, isStale(day.burnedAsOf, now))}
        align="start"
        style={{ marginTop: space.md }}
      />
      <Text variant="caption" tone="muted" numberOfLines={1} style={{ marginTop: space.sm }}>
        {meta}
      </Text>
      {Option.match(insight, {
        onNone: () => null,
        onSome: (text) => (
          <Text variant="caption" numberOfLines={1} style={{ marginTop: space.xs }}>
            {text}
          </Text>
        ),
      })}
    </Card>
  )
}
