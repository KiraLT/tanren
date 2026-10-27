import type { DayTotals } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import { View } from "react-native"
import { type StatItem, StatRow, space, Text, useBreakpoint } from "../../ui"
import { signedKcalText } from "./dayBarMath"
import { asOfText, kcalText } from "./nutritionText"

export interface HealthHeroProps {
  readonly day: DayTotals
}

/** "Burned as of 14:05" from the Garmin row's `updatedAt`; "Burned: no data" without a row. */
const burnedLine = (day: DayTotals): string =>
  Option.match(
    Option.zipWith(day.burned, day.burnedAsOf, (_, at) => at),
    {
      onNone: () => "Burned: no data",
      onSome: (at) => `Burned ${asOfText(at)}`,
    },
  )

/**
 * Today's four numbers as dense tiles and the burned freshness line under them. One row of four
 * from tablet up; on a phone two rows of two, because a 83.5 px tile (nutrition.md §6 arithmetic)
 * leaves 59.5 px for the caption and "kcal burned" truncated (N-MC, 390). Left can be negative.
 */
export function HealthHero({ day }: HealthHeroProps) {
  const phone = useBreakpoint() === "phone"
  const items: ReadonlyArray<StatItem> = [
    { label: "kcal eaten", value: kcalText(day.eaten.kcal) },
    {
      label: "kcal burned",
      value: Option.match(day.burned, { onNone: () => "—", onSome: kcalText }),
    },
    {
      label: "kcal left",
      value: Option.match(day.kcalLeft, { onNone: () => "—", onSome: signedKcalText }),
    },
    { label: "protein", value: `${kcalText(day.eaten.proteinG)} g` },
  ]
  const rows = phone ? Arr.chunksOf(items, 2) : [items]
  return (
    <View style={{ gap: space.sm }}>
      {Arr.map(rows, (row) => (
        <StatRow key={row[0]?.label} variant="tile" dense items={row} />
      ))}
      <Text variant="label" tone="muted">
        {burnedLine(day)}
      </Text>
    </View>
  )
}
