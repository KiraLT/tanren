import type { Activity } from "@tanren/shared"
import { Array as Arr } from "effect"
import { StatRow } from "../../ui"
import { statTiles, statValueVariant } from "./feedGroups"

export interface ActivityStatsProps {
  readonly activity: Activity
}

/**
 * Three equal tiles (design §3): duration | volume or reps | sets over exercises, as a `StatRow
 * variant="plain"` (a `title2` value over a muted `label` caption; (326 - 2 * 12) / 3 = 100.67 px
 * each inside a phone card).
 */
export function ActivityStats({ activity }: ActivityStatsProps) {
  return (
    <StatRow
      variant="plain"
      items={Arr.map(statTiles(activity), (tile) => ({
        label: tile.caption,
        value: tile.value,
        valueVariant: statValueVariant(tile.value),
      }))}
    />
  )
}
