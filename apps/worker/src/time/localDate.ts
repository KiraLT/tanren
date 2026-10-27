import { LocalDate } from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Option, pipe, Schema } from "effect"

// Local calendar days in a profile's IANA zone (nutrition.md §3): which day an instant falls on,
// the UTC range a local day covers, and the Mon–Sun week of a date. An unknown zone is UTC.

/** The zone named `timezone`; an unknown or empty name falls back to UTC. */
export const zoneOf = (timezone: string): DateTime.TimeZone =>
  Option.getOrElse(DateTime.zoneMakeNamed(timezone), () => DateTime.zoneMakeOffset(0))

/** A `YYYY-MM-DD` string we formatted ourselves is always a valid date: a failure is a defect. */
const toLocalDate = (iso: string): Effect.Effect<LocalDate> =>
  Schema.decodeUnknownEffect(LocalDate)(iso).pipe(Effect.orDie)

/** `instant` seen in `timezone`, defaulting to UTC when the zone cannot represent it. */
const zoned = (instant: DateTime.Utc, timezone: string): DateTime.DateTime =>
  Option.getOrElse(
    DateTime.makeZoned(instant, { timeZone: zoneOf(timezone) }),
    (): DateTime.DateTime => instant,
  )

/** The local calendar date of `now` in `timezone`. */
export const localDayOf = (now: DateTime.Utc, timezone: string): Effect.Effect<LocalDate> =>
  toLocalDate(DateTime.formatIsoDate(zoned(now, timezone)))

/** The local hour (0–23) of `now` in `timezone`. */
export const localHourOf = (now: DateTime.Utc, timezone: string): number =>
  DateTime.getPart(zoned(now, timezone), "hour")

const partsOf = (date: LocalDate) => ({
  year: Number(date.slice(0, 4)),
  month: Number(date.slice(5, 7)),
  day: Number(date.slice(8, 10)),
})

/** The date `days` calendar days after `date` (negative goes back). */
export const addDays = (date: LocalDate, days: number): Effect.Effect<LocalDate> =>
  pipe(
    DateTime.makeUnsafe(partsOf(date)),
    DateTime.add({ days }),
    DateTime.formatIsoDateUtc,
    toLocalDate,
  )

/** Local midnight of `date` in `timezone` as a UTC instant (DST gaps resolve to the earlier time). */
const midnightOf = (date: LocalDate, timezone: string): DateTime.Utc =>
  pipe(
    DateTime.makeZoned(partsOf(date), {
      timeZone: zoneOf(timezone),
      adjustForTimeZone: true,
      disambiguation: "earlier",
    }),
    Option.map(DateTime.toUtc),
    Option.getOrElse(() => DateTime.makeUnsafe(partsOf(date))),
  )

/** The half-open UTC range `[local midnight, next local midnight)` that `date` covers. */
export const dayRange = (
  date: LocalDate,
  timezone: string,
): Effect.Effect<{ readonly from: DateTime.Utc; readonly to: DateTime.Utc }> =>
  Effect.map(addDays(date, 1), (next) => ({
    from: midnightOf(date, timezone),
    to: midnightOf(next, timezone),
  }))

/** The seven dates Monday…Sunday of the week that contains `date`. */
export const weekOf = (date: LocalDate): Effect.Effect<ReadonlyArray<LocalDate>> => {
  // `weekDay` is 0 for Sunday; Monday-based offset 0…6.
  const offset = (DateTime.getPartUtc(DateTime.makeUnsafe(partsOf(date)), "weekDay") + 6) % 7
  return Effect.forEach(Arr.range(0, 6), (index) => addDays(date, index - offset))
}
