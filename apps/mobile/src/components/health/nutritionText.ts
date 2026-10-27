import { type DayTotals, formatInt } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import type { HealthStatProps } from "./HealthStats"

/** `1420` → "1,420": the shared grouping (comma thousands, Lead 14:56). */
export const kcalText = (n: number): string => formatInt(n)

/** The no-value dash of a stat slot. */
const DASH = "—"

/**
 * The Today health module's stat row (docs/design/health-module.md §3 row 2, §6): Eaten (accent dot,
 * `danger` over budget), Burned (no dot, `muted` when `stale`, "—" without a Garmin total), Protein
 * (success dot, "/ 155 g" against the target, "g" without one).
 */
export const moduleStats = (
  day: DayTotals,
  stale: boolean,
): readonly [HealthStatProps, HealthStatProps, HealthStatProps] => [
  {
    label: "Eaten",
    value: kcalText(day.eaten.kcal),
    dot: "accent",
    valueVariant: "headline",
    valueTone: Option.exists(day.kcalLeft, (left) => left < 0) ? "danger" : "neutral",
  },
  {
    label: "Burned",
    value: Option.match(day.burned, { onNone: () => DASH, onSome: kcalText }),
    valueVariant: "headline",
    valueTone: stale ? "muted" : "neutral",
  },
  {
    label: "Protein",
    value: kcalText(day.eaten.proteinG),
    unit: Option.match(day.targets, {
      onNone: () => "g",
      onSome: (targets) => `/ ${kcalText(targets.proteinG)} g`,
    }),
    dot: "success",
    valueVariant: "headline",
    valueTone: "neutral",
  },
]

/** The module is hidden only when nutrition is off, there is no Garmin total and nothing was logged (§6). */
export const moduleHidden = (day: DayTotals): boolean =>
  Option.isNone(day.targets) && Option.isNone(day.burned) && day.entries.length === 0

/**
 * The module's text equivalent (§6): "Health today: Left today 1,650; eaten 1,420; burned 1,840;
 * protein 96 of 155 g; as of 14:05 · 8,420 steps", then the insight when there is one.
 */
export const moduleLabel = (
  day: DayTotals,
  hero: { readonly label: string; readonly value: string },
  meta: string,
  insight: Option.Option<string>,
): string => {
  const burned = Option.match(day.burned, { onNone: () => "no data", onSome: kcalText })
  const protein = Option.match(day.targets, {
    onNone: () => `${kcalText(day.eaten.proteinG)} g`,
    onSome: (targets) => `${kcalText(day.eaten.proteinG)} of ${kcalText(targets.proteinG)} g`,
  })
  return Arr.join(
    [
      `Health today: ${hero.label} ${hero.value}`,
      `eaten ${kcalText(day.eaten.kcal)}`,
      `burned ${burned}`,
      `protein ${protein}`,
      meta,
      ...Option.toArray(insight),
    ],
    "; ",
  )
}
