import { Array as Arr, DateTime, Option } from "effect"
import { useRouter } from "expo-router"
import { type StyleProp, View, type ViewStyle } from "react-native"
import { useTrackerConnected } from "../../hooks/useIntegrations"
import { useNutritionDay } from "../../hooks/useNutritionDay"
import { Card, HealthRings, space, stroke, Text } from "../../ui"
import { HealthStatRow } from "../health/HealthStats"
import { healthStats, moduleHidden, moduleLabel } from "../health/nutritionText"
import { localDateOf } from "../planFormat"
import { heroNumber, isStale, metaLine, ringFractions, ringsLabel } from "./healthModuleMath"

/** Ring diameter on Today (docs/design/health-module.md §3 row 1). */
const RING = 104

export interface HealthModuleProps {
  readonly style?: StyleProp<ViewStyle>
}

/**
 * True when `HealthModule` renders its card (Ready and not `moduleHidden`), so Today's empty state
 * can sit directly under it instead of centring in the rest of the viewport (PWA-2).
 */
export const useHealthModuleShown = (): boolean => {
  const state = useNutritionDay(localDateOf(new Date()))
  return state._tag === "Ready" && !moduleHidden(state.value.day)
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
  const trackerConnected = useTrackerConnected()
  if (state._tag !== "Ready" || moduleHidden(state.value.day)) {
    return null
  }
  const { day, insights } = state.value
  const now = new Date()
  const fractions = ringFractions(day)
  const hero = heroNumber(day)
  const meta = metaLine(day, now, DateTime.zoneMakeLocal(), trackerConnected)
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
          empty={Option.isNone(fractions.eaten)}
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
        items={healthStats(day, isStale(day.burnedAsOf, now), "headline")}
        align="start"
        style={{ marginTop: space.md }}
      />
      <Text variant="caption" tone="muted" numberOfLines={1} style={{ marginTop: space.sm }}>
        {meta}
      </Text>
      {Option.match(insight, {
        onNone: () => null,
        onSome: (text) => (
          <Text variant="caption" numberOfLines={2} style={{ marginTop: space.xs }}>
            {text}
          </Text>
        ),
      })}
    </Card>
  )
}
