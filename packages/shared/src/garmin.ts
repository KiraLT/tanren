import { Option, Schema, Struct } from "effect"
import { Label, LocalDate, ROW_COLUMNS, rowFields, Timestamp } from "./common"
import { DailyHealthId, ImportedActivityId } from "./ids"
import { ExportFailureReason, Provider } from "./integrations"

/**
 * Imported provider data (garmin.md §1, ADR-0023): pull-only synced tables the Worker writes and
 * the app reads. The client never pushes them (`Sync.push` answers `forbidden`).
 */

export const ImportedSport = Schema.Literals([
  "running",
  "walking",
  "cycling",
  "swimming",
  "hiking",
  "strength",
  "cardio",
  "other",
])
export type ImportedSport = typeof ImportedSport.Type

const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const HeartRate = Schema.Int.check(Schema.isBetween({ minimum: 20, maximum: 260 }))

// ImportedActivity

export const ImportedActivityFields = {
  /** Immutable (server ignores changes). */
  provider: Provider,
  /** Garmin's activityId as text; unique per `(userId, provider)`. Immutable. */
  externalId: Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  sport: ImportedSport,
  /** Garmin's activityName, trimmed to a `Label`; the importer falls back to the sport, title-cased. */
  title: Label,
  startedAt: Timestamp,
  durationSeconds: NonNegativeInt,
  distanceMeters: Schema.OptionFromNullOr(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
  calories: Schema.OptionFromNullOr(NonNegativeInt),
  avgHeartRate: Schema.OptionFromNullOr(HeartRate),
  maxHeartRate: Schema.OptionFromNullOr(HeartRate),
}

export class ImportedActivity extends Schema.Class<ImportedActivity>(
  "@tanren/shared/ImportedActivity",
)({
  ...rowFields(ImportedActivityId),
  ...ImportedActivityFields,
}) {}
export type ImportedActivityEncoded = (typeof ImportedActivity)["Encoded"]

export const ImportedActivityInsert = ImportedActivity.mapFields(Struct.omit(ROW_COLUMNS))
export type ImportedActivityInsert = typeof ImportedActivityInsert.Type
/** Exact partial: absent key = unchanged; the immutable `provider` / `externalId` are not patchable. */
export const ImportedActivityPatch = ImportedActivity.mapFields(
  Struct.omit([...ROW_COLUMNS, "provider", "externalId"]),
).mapFields(Struct.map(Schema.optionalKey))
export type ImportedActivityPatch = typeof ImportedActivityPatch.Type

// DailyHealth

export const DailyHealthFields = {
  /** Immutable (server ignores changes). */
  provider: Provider,
  /** The device's local calendar day; unique per `(userId, provider, date)`. Immutable. */
  date: LocalDate,
  totalCalories: Schema.OptionFromNullOr(NonNegativeInt),
  activeCalories: Schema.OptionFromNullOr(NonNegativeInt),
  steps: Schema.OptionFromNullOr(NonNegativeInt),
  restingHeartRate: Schema.OptionFromNullOr(HeartRate),
}

export class DailyHealth extends Schema.Class<DailyHealth>("@tanren/shared/DailyHealth")({
  ...rowFields(DailyHealthId),
  ...DailyHealthFields,
}) {}
export type DailyHealthEncoded = (typeof DailyHealth)["Encoded"]

export const DailyHealthInsert = DailyHealth.mapFields(Struct.omit(ROW_COLUMNS))
export type DailyHealthInsert = typeof DailyHealthInsert.Type
/** Exact partial: absent key = unchanged; the immutable `provider` / `date` are not patchable. */
export const DailyHealthPatch = DailyHealth.mapFields(
  Struct.omit([...ROW_COLUMNS, "provider", "date"]),
).mapFields(Struct.map(Schema.optionalKey))
export type DailyHealthPatch = typeof DailyHealthPatch.Type

// sportOf

/**
 * Garmin `activityType.typeKey` → `ImportedSport`. VERIFY: sample keys come from Garmin Connect's
 * public type list, not yet read from `$S/garmin/spec.json` (GM-3 confirms against list items).
 */
const SPORT_BY_TYPE_KEY: ReadonlyMap<string, ImportedSport> = new Map<string, ImportedSport>([
  ["running", "running"],
  ["trail_running", "running"],
  ["treadmill_running", "running"],
  ["track_running", "running"],
  ["virtual_run", "running"],
  ["walking", "walking"],
  ["casual_walking", "walking"],
  ["speed_walking", "walking"],
  ["cycling", "cycling"],
  ["indoor_cycling", "cycling"],
  ["road_biking", "cycling"],
  ["mountain_biking", "cycling"],
  ["gravel_cycling", "cycling"],
  ["virtual_ride", "cycling"],
  ["e_bike_fitness", "cycling"],
  ["swimming", "swimming"],
  ["lap_swimming", "swimming"],
  ["open_water_swimming", "swimming"],
  ["hiking", "hiking"],
  ["strength_training", "strength"],
  ["cardio", "cardio"],
  ["hiit", "cardio"],
  ["elliptical", "cardio"],
  ["stair_stepper", "cardio"],
  ["indoor_cardio", "cardio"],
  ["indoor_rowing", "cardio"],
])

/** Unknown or unmapped keys become `"other"`; matching ignores case and surrounding blanks. */
export const sportOf = (garminType: string): ImportedSport =>
  Option.getOrElse(
    Option.fromNullishOr(SPORT_BY_TYPE_KEY.get(garminType.trim().toLowerCase())),
    (): ImportedSport => "other",
  )

// GarminCursor

/**
 * The pull cursor kept in the `integration.scope` column (garmin.md §3). `activitiesSince` is the
 * start of the re-read window (yesterday: late uploads); `healthThrough` is the last day whose
 * daily summary is final.
 */
export const GarminCursor = Schema.Struct({
  activitiesSince: Timestamp,
  healthThrough: LocalDate,
  /** Last successful drain of this user. */
  lastPullAt: Schema.OptionFromNullOr(Timestamp),
  lastError: Schema.OptionFromNullOr(ExportFailureReason),
  /** Last drain attempt of this user, failures included: orders the cron's work list (fairness). */
  lastAttemptAt: Schema.optionalKey(Timestamp),
})
export type GarminCursor = typeof GarminCursor.Type
export type GarminCursorEncoded = (typeof GarminCursor)["Encoded"]

/** The `scope` column's text form: a JSON string holding the cursor's wire shape. */
export const GarminCursorJson = Schema.fromJsonString(GarminCursor)
