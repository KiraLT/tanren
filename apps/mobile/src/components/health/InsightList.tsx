import type { Insight } from "@tanren/shared"
import { Array as Arr } from "effect"
import { View } from "react-native"
import { Banner, space } from "../../ui"

export interface InsightListProps {
  /** ≤ 3, already in the shared builder's group order (kcal, protein, logging, week). */
  readonly insights: ReadonlyArray<Insight>
}

/** One info `Banner` per insight (nutrition.md §6; `BannerTone` has no neutral); nothing when none. */
export function InsightList({ insights }: InsightListProps) {
  if (insights.length === 0) {
    return null
  }
  return (
    <View style={{ gap: space.sm }}>
      {Arr.map(insights, (insight) => (
        <Banner key={insight.rule} tone="info" title={insight.text} />
      ))}
    </View>
  )
}
