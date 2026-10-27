import { type DayTotals, formatInt } from "@tanren/shared"
import { Array as Arr, DateTime, Option } from "effect"
import type { NutritionDay } from "../../services/NutritionRepo"
import { formatClock } from "../feed/feedGroups"

/** The Today strip's three lines plus their spoken form (nutrition.md §6 "Today strip"). */
export interface StripLines {
  /** "620 kcal left" | "120 kcal over" | "1,420 kcal eaten" (no targets). */
  readonly value: string
  /** "Eaten 1,420 · Burned 1,840 · Protein 96/170 g". */
  readonly detail: string
  /** The first insight's text; `None` when there is none. */
  readonly insight: Option.Option<string>
  readonly accessibilityLabel: string
}

/** `1420` → "1,420": the shared grouping (comma thousands, Lead 14:56). */
export const kcalText = (n: number): string => formatInt(n)

/** "as of 14:05": the instant's 24-h clock in `zone` (the device zone by default). */
export const asOfText = (
  at: DateTime.Utc,
  zone: DateTime.TimeZone = DateTime.zoneMakeLocal(),
): string => `as of ${formatClock(DateTime.setZone(at, zone))}`

/** "Burned 1,840" from the day's Garmin total; "Burned: no data" without one. */
export const burnedText = (day: DayTotals): string =>
  Option.match(day.burned, {
    onNone: () => "Burned: no data",
    onSome: (kcal) => `Burned ${kcalText(kcal)}`,
  })

/** Remaining budget, overshoot, or (tracking off) what was eaten. */
const valueText = (day: DayTotals): string =>
  Option.match(day.kcalLeft, {
    onNone: () => `${kcalText(day.eaten.kcal)} kcal eaten`,
    onSome: (left) => (left < 0 ? `${kcalText(-left)} kcal over` : `${kcalText(left)} kcal left`),
  })

/** "Protein 96/170 g" against the target; "Protein 96 g" without one. */
const proteinText = (day: DayTotals): string =>
  Option.match(day.targets, {
    onNone: () => `Protein ${kcalText(day.eaten.proteinG)} g`,
    onSome: (targets) => `Protein ${kcalText(day.eaten.proteinG)}/${kcalText(targets.proteinG)} g`,
  })

/** The burned part, with " as of 14:05" when the day has a Garmin total (spoken form only). */
const spokenBurned = (day: DayTotals, zone: DateTime.TimeZone): string =>
  Option.match(
    Option.zipWith(day.burned, day.burnedAsOf, (_, at) => at),
    {
      onNone: () => burnedText(day),
      onSome: (at) => `${burnedText(day)} ${asOfText(at, zone)}`,
    },
  )

const detailOf = (day: DayTotals, burned: string): string =>
  `Eaten ${kcalText(day.eaten.kcal)} · ${burned} · ${proteinText(day)}`

/** The strip's lines for one day (nutrition.md §6); pure. */
export const stripLines = (
  nutritionDay: NutritionDay,
  zone: DateTime.TimeZone = DateTime.zoneMakeLocal(),
): StripLines => {
  const { day } = nutritionDay
  const value = valueText(day)
  const insight = Option.map(Arr.head(nutritionDay.insights), (first) => first.text)
  const spoken = [value, detailOf(day, spokenBurned(day, zone)), ...Option.toArray(insight)]
  return {
    value,
    detail: detailOf(day, burnedText(day)),
    insight,
    accessibilityLabel: `Nutrition, ${spoken.join(", ")}`,
  }
}
