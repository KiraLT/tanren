import { Schema, Struct } from "effect"
import {
  Label,
  LocalDate,
  Note,
  OrderIndex,
  Reps,
  RestSeconds,
  ROW_COLUMNS,
  Rpe,
  rowFields,
  Text,
  WeightKg,
} from "./common"
import { ExerciseId, PlanId, PlannedSessionId, PlannedSetId, PlanWeekId } from "./ids"

export const PlanStatus = Schema.Literals(["active", "archived"])
export type PlanStatus = typeof PlanStatus.Type

/** Reps prescribed for a planned set: one number, or a range with `min < max`. */
export const RepTarget = Schema.Union([
  Schema.TaggedStruct("Exact", { reps: Reps }),
  Schema.TaggedStruct("Range", { min: Reps, max: Reps }).check(
    Schema.makeFilter(
      (range: { readonly min: number; readonly max: number }) =>
        range.min < range.max || { path: ["max"], issue: "must be greater than min" },
    ),
  ),
])
export type RepTarget = typeof RepTarget.Type
export type RepTargetEncoded = (typeof RepTarget)["Encoded"]

// Plan

export const PlanFields = {
  name: Label,
  goal: Text,
  startDate: LocalDate,
  status: PlanStatus,
}
export class Plan extends Schema.Class<Plan>("@tanren/shared/Plan")({
  ...rowFields(PlanId),
  ...PlanFields,
}) {}
export type PlanEncoded = (typeof Plan)["Encoded"]
export const PlanInsert = Plan.mapFields(Struct.omit(ROW_COLUMNS))
export type PlanInsert = typeof PlanInsert.Type
/**
 * Exact partial: absent key = unchanged. Unknown and immutable keys are ignored at schema level
 * (stripped on decode); the worker boundary decides whether to reject them.
 */
export const PlanPatch = Plan.mapFields(Struct.omit(ROW_COLUMNS)).mapFields(
  Struct.map(Schema.optionalKey),
)
export type PlanPatch = typeof PlanPatch.Type

// PlanWeek

export const PlanWeekFields = {
  planId: PlanId,
  weekStart: LocalDate,
  intent: Schema.OptionFromNullOr(Text),
}
export class PlanWeek extends Schema.Class<PlanWeek>("@tanren/shared/PlanWeek")({
  ...rowFields(PlanWeekId),
  ...PlanWeekFields,
}) {}
export type PlanWeekEncoded = (typeof PlanWeek)["Encoded"]
export const PlanWeekInsert = PlanWeek.mapFields(Struct.omit(ROW_COLUMNS))
export type PlanWeekInsert = typeof PlanWeekInsert.Type
/**
 * Exact partial: absent key = unchanged. Unknown and immutable keys are ignored at schema level
 * (stripped on decode); the worker boundary decides whether to reject them.
 */
export const PlanWeekPatch = PlanWeek.mapFields(Struct.omit([...ROW_COLUMNS, "planId"])).mapFields(
  Struct.map(Schema.optionalKey),
)
export type PlanWeekPatch = typeof PlanWeekPatch.Type

// PlannedSession

export const PlannedSessionFields = {
  planWeekId: PlanWeekId,
  order: OrderIndex,
  name: Label,
  scheduledDate: Schema.OptionFromNullOr(LocalDate),
  notes: Schema.OptionFromNullOr(Text),
}
export class PlannedSession extends Schema.Class<PlannedSession>("@tanren/shared/PlannedSession")({
  ...rowFields(PlannedSessionId),
  ...PlannedSessionFields,
}) {}
export type PlannedSessionEncoded = (typeof PlannedSession)["Encoded"]
export const PlannedSessionInsert = PlannedSession.mapFields(Struct.omit(ROW_COLUMNS))
export type PlannedSessionInsert = typeof PlannedSessionInsert.Type
/**
 * Exact partial: absent key = unchanged. Unknown and immutable keys are ignored at schema level
 * (stripped on decode); the worker boundary decides whether to reject them.
 */
export const PlannedSessionPatch = PlannedSession.mapFields(
  Struct.omit([...ROW_COLUMNS, "planWeekId"]),
).mapFields(Struct.map(Schema.optionalKey))
export type PlannedSessionPatch = typeof PlannedSessionPatch.Type

// PlannedSet

export const PlannedSetFields = {
  plannedSessionId: PlannedSessionId,
  exerciseId: ExerciseId,
  order: OrderIndex,
  targetWeightKg: Schema.OptionFromNullOr(WeightKg),
  targetReps: RepTarget,
  targetRpe: Schema.OptionFromNullOr(Rpe),
  restSeconds: Schema.OptionFromNullOr(RestSeconds),
  note: Schema.OptionFromNullOr(Note),
}
export class PlannedSet extends Schema.Class<PlannedSet>("@tanren/shared/PlannedSet")({
  ...rowFields(PlannedSetId),
  ...PlannedSetFields,
}) {}
export type PlannedSetEncoded = (typeof PlannedSet)["Encoded"]
export const PlannedSetInsert = PlannedSet.mapFields(Struct.omit(ROW_COLUMNS))
export type PlannedSetInsert = typeof PlannedSetInsert.Type
/**
 * Exact partial: absent key = unchanged. Unknown and immutable keys are ignored at schema level
 * (stripped on decode); the worker boundary decides whether to reject them.
 */
export const PlannedSetPatch = PlannedSet.mapFields(
  Struct.omit([...ROW_COLUMNS, "plannedSessionId"]),
).mapFields(Struct.map(Schema.optionalKey))
export type PlannedSetPatch = typeof PlannedSetPatch.Type
