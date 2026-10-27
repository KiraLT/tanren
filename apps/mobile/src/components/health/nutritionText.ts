import { type DayTotals, formatInt } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import type { HealthStatProps } from "./HealthStats"

/** The no-value dash of a stat slot. */
const DASH = "—"

/**
 * Eaten · Burned · Protein (docs/design/health-module.md §3 row 2, §4, §6), shared by the Today
 * module (`headline`) and the `/health` hero (`title`, which also prints "kcal" after Eaten and a
 * present Burned): Eaten (accent dot, `danger` over budget), Burned (no dot, `muted` when `stale`,
 * "—" without a Garmin total), Protein (success dot, "/ 155 g" against the target, "g" without one).
 */
export const healthStats = (
  day: DayTotals,
  stale: boolean,
  variant: "headline" | "title",
): readonly [HealthStatProps, HealthStatProps, HealthStatProps] => {
  const kcal = variant === "title" ? "kcal" : undefined
  return [
    {
      label: "Eaten",
      value: formatInt(day.eaten.kcal),
      unit: kcal,
      dot: "accent",
      valueVariant: variant,
      valueTone: Option.exists(day.kcalLeft, (left) => left < 0) ? "danger" : "neutral",
    },
    {
      label: "Burned",
      value: Option.match(day.burned, { onNone: () => DASH, onSome: formatInt }),
      unit: Option.isSome(day.burned) ? kcal : undefined,
      valueVariant: variant,
      valueTone: stale ? "muted" : "neutral",
    },
    {
      label: "Protein",
      value: formatInt(day.eaten.proteinG),
      unit: Option.match(day.targets, {
        onNone: () => "g",
        onSome: (targets) => `/ ${formatInt(targets.proteinG)} g`,
      }),
      dot: "success",
      valueVariant: variant,
      valueTone: "neutral",
    },
  ]
}

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
  const burned = Option.match(day.burned, { onNone: () => "no data", onSome: formatInt })
  const protein = Option.match(day.targets, {
    onNone: () => `${formatInt(day.eaten.proteinG)} g`,
    onSome: (targets) => `${formatInt(day.eaten.proteinG)} of ${formatInt(targets.proteinG)} g`,
  })
  return Arr.join(
    [
      `Health today: ${hero.label} ${hero.value}`,
      `eaten ${formatInt(day.eaten.kcal)}`,
      `burned ${burned}`,
      `protein ${protein}`,
      meta,
      ...Option.toArray(insight),
    ],
    "; ",
  )
}
