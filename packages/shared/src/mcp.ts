/**
 * The MCP tool contract (docs/design/mcp.md §3). Inputs are what Claude sends; outputs are the
 * JSON `Encoded` form of these schemas (`Option` → `null`, `DateTime` → ISO string). The step-5
 * write tools and OAuth props follow docs/design/oauth.md §4–§5.
 */
import { Schema, Struct } from "effect"
import { CatalogEquipment, CatalogExercise, ExerciseKind } from "./catalog"
import {
  Label,
  LocalDate,
  Note,
  OrderIndex,
  PageLimit,
  Reps,
  ROW_COLUMNS,
  Rpe,
  Text,
  Timestamp,
  WeightKg,
} from "./common"
import { CurrentPlan } from "./currentPlan"
import { Exercise, MuscleGroup } from "./exercise"
import { ExerciseId, PlanId, PlannedSessionId, PlanWeekId, SessionId, UserId } from "./ids"
import { PlannedSessionFields, PlannedSet } from "./plan"
import { Session, WorkoutSet } from "./session"
import { Profile, ProfilePatch } from "./user"

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

// get_current_plan: no input, output is the active plan (`Option`; `null` on the wire)
export const GetCurrentPlanInput = Schema.Struct({})
export type GetCurrentPlanInput = typeof GetCurrentPlanInput.Type
export const CurrentPlanResult = Schema.OptionFromNullOr(CurrentPlan)
export type CurrentPlanResult = typeof CurrentPlanResult.Type

// Step 5 write tools.
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
// write_plan_week (docs/design/oauth.md §5)
export const WritePlanWeekInput = Schema.Struct({
  /** `None` = the active plan. */
  planId: Schema.OptionFromNullOr(PlanId),
  /** Used only when no active plan exists. */
  newPlan: Schema.optionalKey(Schema.Struct({ name: Label, goal: Text })),
  weekStart: LocalDate,
  /** `PlanWeek.intent` (was `notes` in step 4). */
  intent: Schema.OptionFromNullOr(Text),
  sessions: Schema.Array(PlannedSessionSpec),
})
export type WritePlanWeekInput = typeof WritePlanWeekInput.Type
export const WritePlanWeekResult = Schema.Struct({
  planId: PlanId,
  planWeekId: PlanWeekId,
  /** `true` when a live week with this `weekStart` already existed. */
  replaced: Schema.Boolean,
  sessions: Schema.Array(
    Schema.Struct({
      plannedSessionId: PlannedSessionId,
      order: OrderIndex,
      name: Label,
      sets: Schema.Int,
    }),
  ),
})
export type WritePlanWeekResult = typeof WritePlanWeekResult.Type

// log_session
export const LogSessionInput = Schema.Struct({
  /** Replace that session (idempotent retry); omit = create. */
  sessionId: Schema.optionalKey(SessionId),
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
      /** Defaults to `startedAt`. */
      loggedAt: Schema.optionalKey(Timestamp),
    }),
  ),
})
export type LogSessionInput = typeof LogSessionInput.Type
export const LogSessionResult = SessionWithSets
export type LogSessionResult = typeof LogSessionResult.Type

// update_profile
export const UpdateProfileInput = ProfilePatch
export type UpdateProfileInput = typeof UpdateProfileInput.Type
export const UpdateProfileResult = Profile
export type UpdateProfileResult = typeof UpdateProfileResult.Type

// OAuth (docs/design/oauth.md §4)
export const MCP_SCOPES = ["tanren:read", "tanren:write"] as const
export const McpScope = Schema.Literals(MCP_SCOPES)
export type McpScope = typeof McpScope.Type
/** The grant props the OAuth provider stores encrypted and hands back as `ctx.props`. */
export const OAuthProps = Schema.Struct({ userId: UserId, scopes: Schema.Array(McpScope) })
export type OAuthProps = typeof OAuthProps.Type

// search_exercises (docs/design/v2-catalog.md §6): the static catalog, no database
/** Every key optional; `query` matches names and aliases; `limit` defaults to 20. */
export const SearchExercisesInput = Schema.Struct({
  query: Schema.optionalKey(Label),
  muscle: Schema.optionalKey(MuscleGroup),
  equipment: Schema.optionalKey(CatalogEquipment),
  kind: Schema.optionalKey(ExerciseKind),
  limit: Schema.optionalKey(PageLimit),
})
export type SearchExercisesInput = typeof SearchExercisesInput.Type
/** The catalog fields Claude needs to pick an exercise (no instructions or illustration). */
export const CatalogMatch = CatalogExercise.mapFields(
  Struct.pick([
    "catalogId",
    "name",
    "aliases",
    "kind",
    "primaryMuscles",
    "secondaryMuscles",
    "equipment",
    "movement",
  ]),
)
export type CatalogMatch = typeof CatalogMatch.Type
/** Best match first; `total` counts every match before `limit` cut the list. */
export const SearchExercisesResult = Schema.Struct({
  results: Schema.Array(CatalogMatch),
  total: Schema.Number,
})
export type SearchExercisesResult = typeof SearchExercisesResult.Type

/** The read tools come first and stay contiguous (`slice(0, 5)`), then the write tools. */
export const MCP_TOOLS = [
  "get_overview",
  "get_exercise_history",
  "list_sessions",
  "get_current_plan",
  "search_exercises",
  "write_plan_week",
  "log_session",
  "update_profile",
] as const
export const McpToolName = Schema.Literals(MCP_TOOLS)
export type McpToolName = typeof McpToolName.Type
