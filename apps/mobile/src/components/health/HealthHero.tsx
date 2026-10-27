import type { DayTotals } from "@tanren/shared"
import { Option } from "effect"
import { View } from "react-native"
import { HealthRings, space, Text, useColumns } from "../../ui"
import { heroNumber, isStale, ringFractions, ringsLabel } from "../today/healthModuleMath"
import { HealthStatRow } from "./HealthStats"
import { healthStats } from "./nutritionText"

export interface HealthHeroProps {
  readonly day: DayTotals
}

/** Ring 240 + gap 32 + a text block of at least 368: below this main width the hero stacks (§4). */
const ROW_MIN_MAIN = 640

/** True when a main column of `main` px lays the hero out as a row (ring beside the text). */
export const heroIsRow = (main: number): boolean => main >= ROW_MIN_MAIN

/** Hero heights for the loading skeleton: 176 + 16 + 110 + 16 + 46 stacked, the 240 ring in a row. */
export const HERO_HEIGHT = { column: 364, row: 240 } as const
/** The 1280 text block (health-module.md §4); it shrinks with a narrower column. */
const TEXT_BLOCK = 424

const LAYOUT = {
  column: { size: 176, stroke: 12 },
  row: { size: 240, stroke: 14 },
} as const

/**
 * The `/health` hero (health-module.md §4, merge direction): the double ring (eaten / budget
 * outside, protein / target inside), the "Left today" numeral group and the three-stat row.
 * Column at phone, tablet and narrow desktop columns (ring 176, all centred: 364 high); a row
 * from a 640 main column up (ring 240 beside a left-aligned text block of at most 424).
 */
export function HealthHero({ day }: HealthHeroProps) {
  const row = heroIsRow(useColumns("7/5").main)
  const { size, stroke } = row ? LAYOUT.row : LAYOUT.column
  const fractions = ringFractions(day)
  const hero = heroNumber(day)
  const stats = healthStats(day, isStale(day.burnedAsOf, new Date()), "title")
  const align = row ? "flex-start" : "center"
  const textAlign = row ? "left" : "center"
  return (
    <View
      style={{
        flexDirection: row ? "row" : "column",
        alignItems: "center",
        gap: row ? space.xxl : space.lg,
      }}
    >
      <HealthRings
        size={size}
        stroke={stroke}
        outer={{
          progress: Option.getOrElse(fractions.eaten, () => 0),
          tone: fractions.over ? "danger" : "accent",
        }}
        inner={{ progress: Option.getOrElse(fractions.protein, () => 0), tone: "success" }}
        empty={Option.isNone(fractions.eaten)}
        accessibilityLabel={ringsLabel(fractions)}
      />
      <View
        style={{
          gap: space.lg,
          alignSelf: row ? "auto" : "stretch",
          ...(row ? { flex: 1, maxWidth: TEXT_BLOCK } : {}),
        }}
      >
        <View style={{ alignItems: align }}>
          <Text variant="label" tone="muted" style={{ textAlign }}>
            {hero.label}
          </Text>
          <Text
            variant="numeral"
            tone={hero.tone === "danger" ? "danger" : "default"}
            tabular
            numberOfLines={1}
            style={{ textAlign }}
          >
            {hero.value}
          </Text>
          <Text variant="caption" tone="muted" style={{ textAlign }}>
            {hero.caption}
          </Text>
        </View>
        <HealthStatRow items={stats} align={row ? "start" : "center"} />
      </View>
    </View>
  )
}
