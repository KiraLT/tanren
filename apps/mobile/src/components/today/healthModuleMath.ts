import { type DayTotals, formatInt } from "@tanren/shared"
import { Array as Arr, DateTime, Option } from "effect"
import { clamp01 } from "../../ui/controls"
import { formatClock, formatDate } from "../feed/feedGroups"

/**
 * The pure half of the health module (docs/design/health-module.md §5–§6): ring fractions, the
 * numeral group, the meta caption. The Today `HealthModule` and the `/health` hero both read it.
 */

export interface RingFractions {
  /** eaten / budget, clamped to 0..1; None without a budget (no targets). */
  readonly eaten: Option.Option<number>
  /** protein / target, clamped to 0..1; None without targets. */
  readonly protein: Option.Option<number>
  /** `kcalLeft` < 0: the outer ring turns `danger`. */
  readonly over: boolean
}

export const ringFractions = (day: DayTotals): RingFractions => ({
  eaten: Option.map(day.budgetKcal, (budget) => clamp01(day.eaten.kcal / budget)),
  protein: Option.map(day.targets, (targets) => clamp01(day.eaten.proteinG / targets.proteinG)),
  over: Option.exists(day.kcalLeft, (left) => left < 0),
})

const percent = (fraction: number): number => Math.round(fraction * 100)

/** The rings' text equivalent: "Eaten 46 percent of budget, protein 62 percent of target". */
export const ringsLabel = (fractions: RingFractions): string =>
  Option.match(Option.all([fractions.eaten, fractions.protein]), {
    onNone: () => "No goal set: calorie and protein rings empty",
    onSome: ([eaten, protein]) =>
      `${fractions.over ? "Over budget" : `Eaten ${percent(eaten)} percent of budget`}, protein ${percent(protein)} percent of target`,
  })

export interface HeroNumber {
  /** "Left today" / "Over today" / "Burned today" (rendered uppercase). */
  readonly label: string
  readonly value: string
  readonly tone: "neutral" | "danger"
  readonly caption: string
}

/** U+2212, the typographic minus of "−220". */
const MINUS = "−"

/** The numeral group of §6: kcal left (or over) against the budget, burned without targets. */
export const heroNumber = (day: DayTotals): HeroNumber =>
  Option.match(Option.all([day.budgetKcal, day.kcalLeft]), {
    onNone: () => ({
      label: "Burned today",
      value: Option.match(day.burned, { onNone: () => "—", onSome: formatInt }),
      tone: "neutral",
      caption: "Set a goal for a budget",
    }),
    onSome: ([budget, left]) => ({
      label: left < 0 ? "Over today" : "Left today",
      value: left < 0 ? `${MINUS}${formatInt(-left)}` : formatInt(left),
      tone: left < 0 ? "danger" : "neutral",
      caption:
        day.entries.length === 0 ? "nothing logged yet" : `of ${formatInt(budget)} kcal budget`,
    }),
  })

/** The calendar day of an instant in `zone`, "2026-10-27". */
const dayIn = (at: DateTime.DateTime, zone: DateTime.TimeZone): string =>
  DateTime.formatIsoDate(DateTime.setZone(at, zone))

/**
 * True when the calendar day of `burnedAsOf` in `zone` (the device zone by default) is not the day
 * of `now` (§6 "stale"); None is not stale.
 */
export const isStale = (
  burnedAsOf: Option.Option<DateTime.Utc>,
  now: Date,
  zone: DateTime.TimeZone = DateTime.zoneMakeLocal(),
): boolean =>
  Option.exists(
    burnedAsOf,
    (asOf) => dayIn(asOf, zone) !== dayIn(DateTime.fromDateUnsafe(now), zone),
  )

/** "" today, "yesterday ", else "26 Oct ". */
const dayPrefix = (asOf: DateTime.Zoned, now: DateTime.Zoned): string => {
  const day = DateTime.formatIsoDate(asOf)
  return day === DateTime.formatIsoDate(now)
    ? ""
    : day === DateTime.formatIsoDate(DateTime.subtract(now, { days: 1 }))
      ? "yesterday "
      : `${formatDate(asOf)} `
}

/**
 * "A tracker is connected" for row 3 (§6): the server says Garmin is connected, or the local store
 * already holds a live `daily_health` row (only a connected tracker writes them), so a connected
 * user does not read "No tracker connected" while the status loads or the device is offline.
 */
export const isTrackerConnected = (garminConnected: boolean, anyDailyHealthRow: boolean): boolean =>
  garminConnected || anyDailyHealthRow

/**
 * Row 3 without a `daily_health` row for the day (§6): Garmin connected but not pulled yet this
 * morning, or no tracker at all.
 */
const noRowLine = (trackerConnected: boolean): string =>
  trackerConnected ? "Waiting for Garmin" : "No tracker connected"

/** "as of 14:05" / "as of yesterday 23:40" / "as of 24 Oct 11:00" in `zone`; None without a row. */
const asOfLine = (day: DayTotals, now: Date, zone: DateTime.TimeZone): Option.Option<string> =>
  Option.map(day.burnedAsOf, (utc) => {
    const asOf = DateTime.setZone(utc, zone)
    const today = DateTime.setZone(DateTime.fromDateUnsafe(now), zone)
    return `as of ${dayPrefix(asOf, today)}${formatClock(asOf)}`
  })

/**
 * Row 3 of the module (§6 with plan Amendment 26: steps only, never resting heart rate):
 * "as of 14:05 · 8,420 steps", "as of yesterday 23:40 · 8,420 steps"; without a `daily_health` row
 * for the day "Waiting for Garmin" when Garmin is connected, else "No tracker connected". Clock and
 * day in `zone` (the device zone at the call sites).
 */
export const metaLine = (
  day: DayTotals,
  now: Date,
  zone: DateTime.TimeZone,
  trackerConnected: boolean,
): string =>
  Option.match(asOfLine(day, now, zone), {
    onNone: () => noRowLine(trackerConnected),
    onSome: (asOf) =>
      Arr.join(
        Arr.getSomes([
          Option.some(asOf),
          Option.map(day.steps, (steps) => `${formatInt(steps)} steps`),
        ]),
        " · ",
      ),
  })

/**
 * The `/health` week caption: `metaLine` without the steps (they have their own tile), so a stale
 * row still reads stale: "as of 16:50", "as of 27 Oct 16:37", "Waiting for Garmin",
 * "No tracker connected".
 */
export const freshnessLine = (
  day: DayTotals,
  now: Date,
  zone: DateTime.TimeZone,
  trackerConnected: boolean,
): string => Option.getOrElse(asOfLine(day, now, zone), () => noRowLine(trackerConnected))
