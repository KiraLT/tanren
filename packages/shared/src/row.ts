import { Schema, SchemaGetter, Struct } from "effect"
import type { SyncTable } from "./common"
import { Exercise } from "./exercise"
import { DailyHealth, ImportedActivity } from "./garmin"
import { FoodEntry, FoodItems } from "./nutrition"
import { Plan, PlannedSession, PlannedSet, PlanWeek } from "./plan"
import {
  ProgramDayCompletion,
  ProgramDays,
  ProgramEnrollment,
  ProgramSchedule,
  Swaps,
  UserProgram,
} from "./program"
import { Session, WorkoutSet } from "./session"
import { Locations, NutritionProfile, Profile } from "./user"

/**
 * DB row codecs (DB §5). A DB record has camelCase keys (after `transformResultNames`) and
 * differs from the wire row only in its JSON columns, which are strings. Decoding a record
 * yields the entity class instance, encoding an entity yields the flat record. Shared with the
 * expo-sqlite store (step 6).
 */

/** Every field at its wire (encoded) shape: strings for timestamps, `null` for `None`. */
const wireRecord = <F extends Schema.Struct.Fields>(fields: F) =>
  Schema.Struct(Struct.map(fields, Schema.toEncoded))

/** A JSON column: a string holding the field's wire shape. */
const jsonColumn = <S extends Schema.Constraint>(field: S) =>
  Schema.fromJsonString(Schema.toEncoded(field))

/** Pre-ADR-0016 column, still `NOT NULL` in D1 and SQLite: always `"[]"`, never read. */
const LEGACY_EQUIPMENT = "[]"

/**
 * The record keeps the legacy `equipment` column (equipment.md §3): decoding drops it, encoding
 * writes `"[]"`, so every writer of `ROW_KEYS.profile` satisfies the `NOT NULL` without knowing.
 */
export const ProfileRow = Schema.Struct({
  ...wireRecord(Profile.fields).fields,
  goals: jsonColumn(Profile.fields.goals),
  constraints: jsonColumn(Profile.fields.constraints),
  availableDays: jsonColumn(Profile.fields.availableDays),
  equipment: Schema.String,
  locations: jsonColumn(Locations),
  activeLocationId: Schema.NullOr(Schema.String),
  nutrition: Schema.NullOr(jsonColumn(NutritionProfile)),
}).pipe(
  Schema.decodeTo(Profile, {
    decode: SchemaGetter.transform(({ equipment: _legacy, ...profile }) => profile),
    // `Profile`'s encoded `locations`/`activeLocationId` keys are optional (decoding defaults
    // for pre-v3 peers); the columns are not, so an absent key is written as its default.
    encode: SchemaGetter.transform((profile) => ({
      ...profile,
      locations: profile.locations ?? [],
      activeLocationId: profile.activeLocationId ?? null,
      nutrition: profile.nutrition ?? null,
      equipment: LEGACY_EQUIPMENT,
    })),
  }),
)

export const ExerciseRow = Schema.Struct({
  ...wireRecord(Exercise.fields).fields,
  aliases: jsonColumn(Exercise.fields.aliases),
  muscleGroups: jsonColumn(Exercise.fields.muscleGroups),
}).pipe(Schema.decodeTo(Exercise))

export const PlanRow = wireRecord(Plan.fields).pipe(Schema.decodeTo(Plan))

export const PlanWeekRow = wireRecord(PlanWeek.fields).pipe(Schema.decodeTo(PlanWeek))

export const PlannedSessionRow = wireRecord(PlannedSession.fields).pipe(
  Schema.decodeTo(PlannedSession),
)

export const PlannedSetRow = Schema.Struct({
  ...wireRecord(PlannedSet.fields).fields,
  targetReps: jsonColumn(PlannedSet.fields.targetReps),
}).pipe(Schema.decodeTo(PlannedSet))

export const SessionRow = wireRecord(Session.fields).pipe(Schema.decodeTo(Session))

export const WorkoutSetRow = wireRecord(WorkoutSet.fields).pipe(Schema.decodeTo(WorkoutSet))

export const ProgramEnrollmentRow = Schema.Struct({
  ...wireRecord(ProgramEnrollment.fields).fields,
  swaps: jsonColumn(Swaps),
}).pipe(Schema.decodeTo(ProgramEnrollment))

export const ProgramDayCompletionRow = wireRecord(ProgramDayCompletion.fields).pipe(
  Schema.decodeTo(ProgramDayCompletion),
)

export const ImportedActivityRow = wireRecord(ImportedActivity.fields).pipe(
  Schema.decodeTo(ImportedActivity),
)

export const DailyHealthRow = wireRecord(DailyHealth.fields).pipe(Schema.decodeTo(DailyHealth))

export const FoodEntryRow = Schema.Struct({
  ...wireRecord(FoodEntry.fields).fields,
  items: jsonColumn(FoodItems),
}).pipe(Schema.decodeTo(FoodEntry))

export const UserProgramRow = Schema.Struct({
  ...wireRecord(UserProgram.fields).fields,
  days: jsonColumn(ProgramDays),
  schedule: jsonColumn(ProgramSchedule),
}).pipe(Schema.decodeTo(UserProgram))

/** SQL table per synced entity (DB §1). */
export const ROW_TABLE = {
  profile: "profile",
  exercise: "exercise",
  plan: "plan",
  planWeek: "plan_week",
  plannedSession: "planned_session",
  plannedSet: "planned_set",
  session: "workout_session",
  set: "workout_set",
  programEnrollment: "program_enrollment",
  programDayCompletion: "program_day_completion",
  importedActivity: "imported_activity",
  dailyHealth: "daily_health",
  foodEntry: "food_entry",
  program: "program",
} as const satisfies { readonly [T in SyncTable]: string }

/** The camelCase record keys of each table: the codec's columns, in field order. */
export const ROW_KEYS = {
  profile: Struct.keys(ProfileRow.from.fields),
  exercise: Struct.keys(ExerciseRow.from.fields),
  plan: Struct.keys(PlanRow.from.fields),
  planWeek: Struct.keys(PlanWeekRow.from.fields),
  plannedSession: Struct.keys(PlannedSessionRow.from.fields),
  plannedSet: Struct.keys(PlannedSetRow.from.fields),
  session: Struct.keys(SessionRow.from.fields),
  set: Struct.keys(WorkoutSetRow.from.fields),
  programEnrollment: Struct.keys(ProgramEnrollmentRow.from.fields),
  programDayCompletion: Struct.keys(ProgramDayCompletionRow.from.fields),
  importedActivity: Struct.keys(ImportedActivityRow.from.fields),
  dailyHealth: Struct.keys(DailyHealthRow.from.fields),
  foodEntry: Struct.keys(FoodEntryRow.from.fields),
  program: Struct.keys(UserProgramRow.from.fields),
} as const satisfies { readonly [T in SyncTable]: ReadonlyArray<string> }
