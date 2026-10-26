import type { Activity } from "@tanren/shared"
import { Array as Arr } from "effect"
import { View } from "react-native"
import { space, Text } from "../../ui"
import { statTiles } from "./feedGroups"

export interface ActivityStatsProps {
  readonly activity: Activity
}

/**
 * Three equal tiles (design §3): duration | volume or reps | sets over exercises. A `title2`
 * value over a muted `label` caption; (326 - 2 * 12) / 3 = 100.67 px each inside a phone card.
 */
export function ActivityStats({ activity }: ActivityStatsProps) {
  return (
    <View style={{ flexDirection: "row", gap: space.md }}>
      {Arr.map(statTiles(activity), (tile) => (
        <View key={tile.caption} style={{ flex: 1, flexBasis: 0, minWidth: 0 }}>
          <Text variant="title2" tabular numberOfLines={1}>
            {tile.value}
          </Text>
          <Text variant="label" tone="muted" numberOfLines={1}>
            {tile.caption}
          </Text>
        </View>
      ))}
    </View>
  )
}
