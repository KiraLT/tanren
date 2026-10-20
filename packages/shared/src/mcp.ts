/**
 * The MCP tool contract (docs/design/mcp.md §3). Inputs are what Claude sends; outputs are the
 * JSON `Encoded` form of these schemas (`Option` → `null`, `DateTime` → ISO string). The step-5
 * write inputs are typed here but not registered until step 5.
 */
import { Schema, Struct } from "effect"
import {
  Label,
  LocalDate,
  Note,
  PageLimit,
  Reps,
  ROW_COLUMNS,
  Rpe,
  Timestamp,
  WeightKg,
} from "./common"
import { CurrentPlan } from "./currentPlan"
import { Exercise, MuscleGroup } from "./exercise"
import { ExerciseId, PlanId, PlannedSessionId } from "./ids"
import { PlannedSessionFields, PlannedSet } from "./plan"
import { Session, WorkoutSet } from "./session"
import { ProfilePatch } from "./user"

export const Period = Schema.Literals(["7d", "30d", "90d"])
export type Period = typeof Period.Type

/** Half-open `[from, to)`. */
export const DateRange = Schema.Struct({ from: Timestamp, to: Timestamp })
export type DateRange = typeof DateRange.Type

// get_overview(period)
/** `period` defaults to "30d". */
export const GetOverviewInput = Schema.Struct({ period: Schema.optionalKey(Period) })
export type GetOverviewInput = typeof GetOverviewInput.Type
export const ExerciseSummary = Schema.Struct({
  exerciseId: ExerciseId,
  name: Label,
  muscleGroups: Schema.Array(MuscleGroup),
  sessions: Schema.Int,
  sets: Schema.Int,
  /** Σ weightKg · reps over live sets. */
  volumeKg: Schema.Number,
  /** Max weight, then reps. */
  best: Schema.OptionFromNullOr(
    Schema.Struct({ weightKg: WeightKg, reps: Reps, loggedAt: Timestamp }),
  ),
  lastLoggedAt: Schema.OptionFromNullOr(Timestamp),
})
export type ExerciseSummary = typeof ExerciseSummary.Type
export const Overview = Schema.Struct({
  period: Period,
  range: DateRange,
  sessions: Schema.Int,
  sets: Schema.Int,
  volumeKg: Schema.Number,
  /** By `volumeKg` descending, then name. */
  exercises: Schema.Array(ExerciseSummary),
  currentPlan: Schema.OptionFromNullOr(
    Schema.Struct({ planId: PlanId, name: Label, weeks: Schema.Int }),
  ),
})
export type Overview = typeof Overview.Type

// get_exercise_history(exerciseId)
/** `limit` defaults to 20 sessions. */
export const GetExerciseHistoryInput = Schema.Struct({
  exerciseId: ExerciseId,
  limit: Schema.optionalKey(PageLimit),
})
export type GetExerciseHistoryInput = typeof GetExerciseHistoryInput.Type
/** Live sets of this exercise in the session, by `(order, createdAt, id)`. */
export const HistoryEntry = Schema.Struct({ session: Session, sets: Schema.Array(WorkoutSet) })
export type HistoryEntry = typeof HistoryEntry.Type
/** Newest session first. */
export const ExerciseHistory = Schema.Struct({
  exercise: Exercise,
  entries: Schema.Array(HistoryEntry),
})
export type ExerciseHistory = typeof ExerciseHistory.Type

// list_sessions
/** `includeSets` defaults to false. */
export const ListSessionsInput = Schema.Struct({
  from: Timestamp,
  to: Timestamp,
  includeSets: Schema.optionalKey(Schema.Boolean),
})
export type ListSessionsInput = typeof ListSessionsInput.Type
/** `sets` is `[]` when `includeSets` is false. */
export const SessionWithSets = Schema.Struct({ session: Session, sets: Schema.Array(WorkoutSet) })
export type SessionWithSets = typeof SessionWithSets.Type
/** Oldest first (repo order). */
export const SessionList = Schema.Struct({
  range: DateRange,
  sessions: Schema.Array(SessionWithSets),
})
export type SessionList = typeof SessionList.Type

// get_current_plan: no input, output is the active plan or null
export const GetCurrentPlanInput = Schema.Struct({})
export type GetCurrentPlanInput = typeof GetCurrentPlanInput.Type
export const CurrentPlanResult = Schema.NullOr(CurrentPlan)
export type CurrentPlanResult = typeof CurrentPlanResult.Type

// Step 5 inputs: typed now, no handler and no registration until step 5.
/** `{ exerciseId, order, targetWeightKg, targetReps, targetRpe, restSeconds, note }`. */
export const PlannedSetSpec = PlannedSet.mapFields(
  Struct.omit([...ROW_COLUMNS, "plannedSessionId"]),
)
export type PlannedSetSpec = typeof PlannedSetSpec.Type
/** `{ name, order, scheduledDate, notes, sets }`. */
export const PlannedSessionSpec = Schema.Struct({
  ...Struct.omit(PlannedSessionFields, ["planWeekId"]),
  sets: Schema.Array(PlannedSetSpec),
})
export type PlannedSessionSpec = typeof PlannedSessionSpec.Type
export const WritePlanWeekInput = Schema.Struct({
  /** `None` = the active plan, created if absent. */
  planId: Schema.OptionFromNullOr(PlanId),
  weekStart: LocalDate,
  notes: Schema.OptionFromNullOr(Note),
  sessions: Schema.Array(PlannedSessionSpec),
})
export type WritePlanWeekInput = typeof WritePlanWeekInput.Type
export const LogSessionInput = Schema.Struct({
  startedAt: Timestamp,
  finishedAt: Schema.OptionFromNullOr(Timestamp),
  plannedSessionId: Schema.OptionFromNullOr(PlannedSessionId),
  notes: Schema.OptionFromNullOr(Note),
  sets: Schema.Array(
    Schema.Struct({
      exerciseId: ExerciseId,
      weightKg: WeightKg,
      reps: Reps,
      rpe: Schema.OptionFromNullOr(Rpe),
      note: Schema.OptionFromNullOr(Note),
    }),
  ),
})
export type LogSessionInput = typeof LogSessionInput.Type
export const UpdateProfileInput = ProfilePatch
export type UpdateProfileInput = typeof UpdateProfileInput.Type

export const MCP_TOOLS = [
  "get_overview",
  "get_exercise_history",
  "list_sessions",
  "get_current_plan",
  "write_plan_week",
  "log_session",
  "update_profile",
] as const
export const McpToolName = Schema.Literals(MCP_TOOLS)
export type McpToolName = typeof McpToolName.Type
