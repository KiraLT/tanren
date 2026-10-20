import { DateTime, Option, Schema, Struct } from "effect"
import {
  Note,
  OrderIndex,
  Reps,
  ROW_COLUMNS,
  Rpe,
  rowFields,
  Text,
  Timestamp,
  WeightKg,
} from "./common"
import { ExerciseId, PlannedSessionId, PlannedSetId, SessionId, SetId } from "./ids"

/** `finishedAt`, when present, is not before `startedAt`; the issue points at `finishedAt`. */
const sessionTimeOrder = Schema.makeFilter(
  (session: {
    readonly startedAt: DateTime.Utc
    readonly finishedAt: Option.Option<DateTime.Utc>
  }) =>
    Option.match(session.finishedAt, {
      onNone: () => true,
      onSome: (finishedAt) =>
        DateTime.Order(finishedAt, session.startedAt) >= 0 || {
          path: ["finishedAt"],
          issue: "must not be before startedAt",
        },
    }),
)

// Session

export const SessionFields = {
  startedAt: Timestamp,
  finishedAt: Schema.OptionFromNullOr(Timestamp),
  plannedSessionId: Schema.OptionFromNullOr(PlannedSessionId),
  notes: Schema.OptionFromNullOr(Text),
}
export class Session extends Schema.Class<Session>("@tanren/shared/Session")(
  Schema.Struct({ ...rowFields(SessionId), ...SessionFields }).check(sessionTimeOrder),
) {}
export type SessionEncoded = (typeof Session)["Encoded"]
/** `mapFields` drops struct-level checks, so the time-order filter is attached again. */
export const SessionInsert = Session.mapFields(Struct.omit(ROW_COLUMNS)).check(sessionTimeOrder)
export type SessionInsert = typeof SessionInsert.Type
/**
 * Exact partial: absent key = unchanged. Unknown and immutable keys are ignored at schema level
 * (stripped on decode); the worker boundary decides whether to reject them. Cannot carry
 * `sessionTimeOrder`: the server validates after merging the patch.
 */
export const SessionPatch = Session.mapFields(Struct.omit(ROW_COLUMNS)).mapFields(
  Struct.map(Schema.optionalKey),
)
export type SessionPatch = typeof SessionPatch.Type

// WorkoutSet (never `Set`: it shadows the global)

export const WorkoutSetFields = {
  sessionId: SessionId,
  exerciseId: ExerciseId,
  order: OrderIndex,
  weightKg: WeightKg,
  reps: Reps,
  rpe: Schema.OptionFromNullOr(Rpe),
  note: Schema.OptionFromNullOr(Note),
  plannedSetId: Schema.OptionFromNullOr(PlannedSetId),
  loggedAt: Timestamp,
}
export class WorkoutSet extends Schema.Class<WorkoutSet>("@tanren/shared/WorkoutSet")({
  ...rowFields(SetId),
  ...WorkoutSetFields,
}) {}
export type WorkoutSetEncoded = (typeof WorkoutSet)["Encoded"]
export const WorkoutSetInsert = WorkoutSet.mapFields(Struct.omit(ROW_COLUMNS))
export type WorkoutSetInsert = typeof WorkoutSetInsert.Type
/**
 * Exact partial: absent key = unchanged. Unknown and immutable keys are ignored at schema level
 * (stripped on decode); the worker boundary decides whether to reject them.
 */
export const WorkoutSetPatch = WorkoutSet.mapFields(
  Struct.omit([...ROW_COLUMNS, "sessionId"]),
).mapFields(Struct.map(Schema.optionalKey))
export type WorkoutSetPatch = typeof WorkoutSetPatch.Type
