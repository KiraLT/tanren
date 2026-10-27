import type { ImportedActivity } from "@tanren/shared"
import { DateTime } from "effect"
import { View } from "react-native"
import { Card, Icon, radius, StatRow, space, Text, useTheme } from "../../ui"
import { cardStats, importedLabel, importedStamp, sourceLine, sportIcon } from "./importedText"

/** The sport disc beside the title (garmin.md §6): 40, `surfaceRaised`, a 24 glyph. */
const DISC = 40
const GLYPH = 24

export interface ImportedCardProps {
  readonly activity: ImportedActivity
  readonly onPress: () => void
}

/**
 * One imported provider activity in the feed (garmin.md §6): sport disc, title and start, four
 * stats (duration, distance, calories, average heart rate; "—" when not reported), "from Garmin".
 * The stats are `StatRow variant="plain"` with `headline` values, like the session card's tiles:
 * (326 − 3 × 12) / 4 = 72.5 px per slot. `cardStats` keeps every value within 7 characters (bare
 * calories and heart rate, whole km from 100 km) and the labels carry the meaning; "152 bpm"
 * truncated at 390 (GM-6S). A boxed dense tile would leave 51.5 px after its 12 px padding.
 */
export function ImportedCard({ activity, onPress }: ImportedCardProps) {
  const { colors } = useTheme()
  const zone = DateTime.zoneMakeLocal()
  return (
    <Card onPress={onPress} accessibilityLabel={importedLabel(activity, zone)} padding={space.lg}>
      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View
            style={{
              width: DISC,
              height: DISC,
              borderRadius: radius.full,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.surfaceRaised,
            }}
          >
            <Icon name={sportIcon(activity.sport)} size={GLYPH} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="headline" numberOfLines={1}>
              {activity.title}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {importedStamp(activity, zone)}
            </Text>
          </View>
        </View>
        <StatRow
          variant="plain"
          items={cardStats(activity).map((stat) => ({ ...stat, valueVariant: "headline" }))}
        />
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {sourceLine(activity)}
        </Text>
      </View>
    </Card>
  )
}
