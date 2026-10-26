import { Schema, SchemaTransformation } from "effect"
import { UserId } from "./ids"

/**
 * ISO-8601 string on the wire, `DateTime.Utc` in TypeScript. Strict: decodes only a full date-time
 * with seconds and an explicit `Z` or `±HH:MM` offset (`updatedAt` is the LWW key, so no guessing);
 * encodes `YYYY-MM-DDTHH:mm:ss.sssZ`.
 */
export const Timestamp = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/),
).pipe(Schema.decodeTo(Schema.DateTimeUtc, SchemaTransformation.dateTimeUtcFromString))
export type Timestamp = typeof Timestamp.Type

const daysInMonth = (year: number, month: number): number => {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  if (month === 2) {
    return isLeap ? 29 : 28
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

const isValidCalendarDate = (s: string): boolean => {
  const year = Number(s.slice(0, 4))
  const month = Number(s.slice(5, 7))
  const day = Number(s.slice(8, 10))
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

/** A calendar date without time, `YYYY-MM-DD`, in the owner's local calendar. */
export const LocalDate = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/),
  Schema.makeFilter(isValidCalendarDate, { expected: "a valid calendar date (YYYY-MM-DD)" }),
).pipe(Schema.brand("LocalDate"))
export type LocalDate = typeof LocalDate.Type

/** Names, titles. */
export const Label = Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(80))
export type Label = typeof Label.Type

/** One-liners. */
export const Note = Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(500))
export type Note = typeof Note.Type

/** Free text. */
export const Text = Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(4000))
export type Text = typeof Text.Type

export const Email = Schema.Trimmed.check(
  Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  Schema.isMaxLength(254),
).pipe(Schema.brand("Email"))
export type Email = typeof Email.Type

/** IANA-shaped zone name; validity against the tz database is not checked (Hermes/ICU risk). */
export const TimeZone = Schema.Trimmed.check(
  Schema.isPattern(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/),
  Schema.isMaxLength(64),
).pipe(Schema.brand("TimeZone"))
export type TimeZone = typeof TimeZone.Type

/** Kilograms in 0.25 steps; `0` = bodyweight. */
export const WeightKg = Schema.Number.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(1000),
  Schema.isMultipleOf(0.25),
).pipe(Schema.brand("WeightKg"))
export type WeightKg = typeof WeightKg.Type

export const Reps = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 0, maximum: 1000 }),
).pipe(Schema.brand("Reps"))
export type Reps = typeof Reps.Type

export const Rpe = Schema.Number.check(
  Schema.isBetween({ minimum: 1, maximum: 10 }),
  Schema.isMultipleOf(0.5),
).pipe(Schema.brand("Rpe"))
export type Rpe = typeof Rpe.Type

/** 0-based position within the parent. */
export const OrderIndex = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
export type OrderIndex = typeof OrderIndex.Type

export const RestSeconds = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 0, maximum: 3600 }),
)
export type RestSeconds = typeof RestSeconds.Type

export const PageLimit = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: 500 }),
)
export type PageLimit = typeof PageLimit.Type

export const Weekday = Schema.Literals(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])
export type Weekday = typeof Weekday.Type

export const EntityName = Schema.Literals([
  "user",
  "profile",
  "exercise",
  "plan",
  "planWeek",
  "plannedSession",
  "plannedSet",
  "session",
  "set",
  "programEnrollment",
  "programDayCompletion",
  /** A profile location (not a table): `search_exercises availableAt` with an unknown id. */
  "location",
  /** An outbound activity export (not a synced table): `POST /integrations/strava/exports/retry`. */
  "activityExport",
])
export type EntityName = typeof EntityName.Type

export const SyncTable = EntityName.pick([
  "profile",
  "exercise",
  "plan",
  "planWeek",
  "plannedSession",
  "plannedSet",
  "session",
  "set",
  "programEnrollment",
  "programDayCompletion",
])
export type SyncTable = typeof SyncTable.Type

/** The keys `Insert`/`Patch` omit. */
export const ROW_COLUMNS = ["id", "userId", "createdAt", "updatedAt", "deletedAt"] as const

/** Sync columns every synced entity spreads into its `Schema.Class` fields. */
export const rowFields = <Id extends Schema.Constraint>(id: Id) => ({
  id,
  userId: UserId,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  deletedAt: Schema.OptionFromNullOr(Timestamp),
})
