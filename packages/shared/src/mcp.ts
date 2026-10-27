/**
 * The MCP tool contract (docs/design/mcp.md §3). Inputs are what Claude sends; outputs are the
 * JSON `Encoded` form of these schemas (`Option` → `null`, `DateTime` → ISO string). The step-5
 * write tools and OAuth props follow docs/design/oauth.md §4–§5.
 */
import { Schema, Struct } from "effect"
import { CatalogEquipment, CatalogExercise, CatalogId, ExerciseKind, Slug } from "./catalog"
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
import { ImportedActivity, ImportedSport } from "./garmin"
import {
  ExerciseId,
  FoodEntryId,
  LocationId,
  PlanId,
  PlannedSessionId,
  PlanWeekId,
  ProgramEnrollmentId,
  SessionId,
  UserId,
} from "./ids"
import { Count, DayTotals, FoodEntry, FoodItems, Grams, Insight, Meal } from "./nutrition"
import { PlannedSessionFields, PlannedSet } from "./plan"
import {
  EnrollmentStatus,
  MinutesRange,
  ProgramSchedule,
  ProgramSource,
  ProgramSummary,
  Swaps,
  UserProgramPatch,
} from "./program"
import { DayNumber, Program, ProgramId } from "./programs/Program"
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
/**
 * Activities imported from integrations (Garmin) whose `startedAt` is in the period. `distanceMeters`
 * and `calories` sum the rows that carry them; `bySport` is by `count` descending, then sport.
 */
export const ImportedSummary = Schema.Struct({
  count: Schema.Int,
  durationSeconds: Schema.Int,
  distanceMeters: Schema.Number,
  calories: Schema.Int,
  bySport: Schema.Array(Schema.Struct({ sport: ImportedSport, count: Schema.Int })),
})
export type ImportedSummary = typeof ImportedSummary.Type
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
  imported: ImportedSummary,
})
export type Overview = typeof Overview.Type

// list_activities(period)
/** `period` defaults to "30d". */
export const ListActivitiesInput = Schema.Struct({ period: Schema.optionalKey(Period) })
export type ListActivitiesInput = typeof ListActivitiesInput.Type
/** Newest first, at most 200. */
export const ListActivitiesResult = Schema.Struct({
  activities: Schema.Array(ImportedActivity),
})
export type ListActivitiesResult = typeof ListActivitiesResult.Type

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

// get_profile (docs/design/equipment.md §5): no input; `None` (`null`) until a profile exists
export const GetProfileInput = Schema.Struct({})
export type GetProfileInput = typeof GetProfileInput.Type
export const GetProfileResult = Schema.OptionFromNullOr(Profile)
export type GetProfileResult = typeof GetProfileResult.Type

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

// Nutrition (docs/design/nutrition.md §3). Day boundaries use `profile.timezone`.

// log_food
export const LogFoodInput = Schema.Struct({
  /** Default now. */
  loggedAt: Schema.optionalKey(Timestamp),
  meal: Meal,
  items: FoodItems,
  note: Schema.optionalKey(Note),
})
export type LogFoodInput = typeof LogFoodInput.Type
export const LogFoodResult = Schema.Struct({ entry: FoodEntry, day: DayTotals })
export type LogFoodResult = typeof LogFoodResult.Type

// get_nutrition_day
export const GetNutritionDayInput = Schema.Struct({
  /** Default today in the profile zone. */
  date: Schema.optionalKey(LocalDate),
})
export type GetNutritionDayInput = typeof GetNutritionDayInput.Type
export const GetNutritionDayResult = DayTotals
export type GetNutritionDayResult = typeof GetNutritionDayResult.Type

// delete_food_entry
export const DeleteFoodEntryInput = Schema.Struct({ id: FoodEntryId })
export type DeleteFoodEntryInput = typeof DeleteFoodEntryInput.Type
export const DeleteFoodEntryResult = Schema.Struct({ deleted: Schema.Boolean })
export type DeleteFoodEntryResult = typeof DeleteFoodEntryResult.Type

// get_week_review
export const GetWeekReviewInput = Schema.Struct({
  /** Any weekday; default this week's Monday (profile zone). */
  weekStart: Schema.optionalKey(LocalDate),
})
export type GetWeekReviewInput = typeof GetWeekReviewInput.Type
export const WeekReview = Schema.Struct({
  weekStart: LocalDate,
  days: Schema.Array(DayTotals).check(Schema.isMinLength(7), Schema.isMaxLength(7)),
  eatenKcal: Count,
  burnedKcal: Schema.OptionFromNullOr(Count),
  daysWithBurn: Count,
  /** Σ(eaten − burned) over `daysWithBurn`. */
  netKcal: Schema.OptionFromNullOr(Schema.Int),
  proteinAvgG: Grams,
  daysOnKcalTarget: Count,
  daysOnProteinTarget: Count,
  daysLogged: Count,
  /** Sessions started in the local Mon–Sun with `finishedAt` set. */
  workoutsDone: Count,
  /** Planned sessions of the active plan's week. */
  workoutsPlanned: Count,
  insights: Schema.Array(Insight),
})
export type WeekReview = typeof WeekReview.Type
export const GetWeekReviewResult = WeekReview
export type GetWeekReviewResult = typeof GetWeekReviewResult.Type

// OAuth (docs/design/oauth.md §4)
export const MCP_SCOPES = ["tanren:read", "tanren:write"] as const
export const McpScope = Schema.Literals(MCP_SCOPES)
export type McpScope = typeof McpScope.Type
/** The grant props the OAuth provider stores encrypted and hands back as `ctx.props`. */
export const OAuthProps = Schema.Struct({ userId: UserId, scopes: Schema.Array(McpScope) })
export type OAuthProps = typeof OAuthProps.Type

// search_exercises (docs/design/v2-catalog.md §6): the static catalog; 0 D1 statements, 1 (the
// profile) when `availableAt` is set (equipment.md §5)
/**
 * Every key optional; `query` matches names and aliases; `limit` defaults to 20. `availableAt`
 * keeps entries the location's equipment covers: `"active"` = the profile's active location (no
 * active location = no filter), a `LocationId` not in the profile is `NotFound`.
 */
export const SearchExercisesInput = Schema.Struct({
  query: Schema.optionalKey(Label),
  muscle: Schema.optionalKey(MuscleGroup),
  equipment: Schema.optionalKey(CatalogEquipment),
  kind: Schema.optionalKey(ExerciseKind),
  availableAt: Schema.optionalKey(Schema.Union([LocationId, Schema.Literal("active")])),
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

// Programs (programs-mcp.md §3, ADR-0026). Tool names join `MCP_TOOLS` with the tools (P-S2).

const Int = Schema.Number.check(Schema.isInt())
const IntBetween = (minimum: number, maximum: number) =>
  Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum, maximum }))

export const ListProgramsInput = Schema.Struct({})
export type ListProgramsInput = typeof ListProgramsInput.Type
/** Built-ins first, then the user's rows by title. */
export const ProgramList = Schema.Struct({ programs: Schema.Array(ProgramSummary) })
export type ProgramList = typeof ProgramList.Type

export const EnrollmentSummary = Schema.Struct({
  enrollmentId: ProgramEnrollmentId,
  programId: ProgramId,
  title: Label,
  status: EnrollmentStatus,
  startedOn: LocalDate,
  currentDay: Int,
  totalDays: Int,
  completedDays: Int,
  lastCompletedAt: Schema.OptionFromNullOr(Timestamp),
  swaps: Swaps,
})
export type EnrollmentSummary = typeof EnrollmentSummary.Type

export const GetProgramInput = Schema.Struct({ programId: ProgramId })
export type GetProgramInput = typeof GetProgramInput.Type
export const ProgramDetail = Schema.Struct({
  program: Program,
  source: ProgramSource,
  version: Int,
  schedule: Schema.OptionFromNullOr(ProgramSchedule),
  enrollments: Schema.Array(EnrollmentSummary),
})
export type ProgramDetail = typeof ProgramDetail.Type

export const ProgramItemInput = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("timed"),
    catalogId: CatalogId,
    seconds: IntBetween(10, 600),
    restSeconds: IntBetween(0, 300),
  }),
  Schema.Struct({
    kind: Schema.Literal("reps"),
    catalogId: CatalogId,
    reps: IntBetween(1, 100),
    restSeconds: IntBetween(0, 300),
    /** Straight sets with `restSeconds` between them; absent = 1 (`RepsItem.sets`). */
    sets: Schema.optionalKey(IntBetween(1, 10)),
  }),
])
export type ProgramItemInput = typeof ProgramItemInput.Type

/** `dayNumber` is the day's position in `days`. */
export const ProgramDayInput = Schema.Struct({
  title: Label,
  rounds: IntBetween(1, 5),
  items: Schema.Array(ProgramItemInput).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
  restBetweenRoundsSeconds: IntBetween(0, 300),
})
export type ProgramDayInput = typeof ProgramDayInput.Type

const ProgramDaysInput = Schema.Array(ProgramDayInput).check(
  Schema.isMinLength(1),
  Schema.isMaxLength(84),
)

export const WriteProgramInput = Schema.Struct({
  slug: Slug,
  title: Label,
  summary: Note,
  description: Schema.optionalKey(Text),
  schedule: ProgramSchedule,
  days: ProgramDaysInput,
})
export type WriteProgramInput = typeof WriteProgramInput.Type
export const WriteProgramResult = Schema.Struct({
  programId: ProgramId,
  /** `false` = replaced by slug, same id. */
  created: Schema.Boolean,
  version: Int,
  days: Int,
  minutesPerDay: MinutesRange,
  warnings: Schema.Array(Schema.String),
})
export type WriteProgramResult = typeof WriteProgramResult.Type

/** `{}` besides `programId` is a `ValidationError "empty patch"` (handler). */
export const UpdateProgramInput = Schema.Struct({
  programId: ProgramId,
  ...UserProgramPatch.fields,
  days: Schema.optionalKey(ProgramDaysInput),
})
export type UpdateProgramInput = typeof UpdateProgramInput.Type
export const UpdateProgramResult = WriteProgramResult
export type UpdateProgramResult = typeof UpdateProgramResult.Type

export const DeleteProgramInput = Schema.Struct({
  programId: ProgramId,
  force: Schema.optionalKey(Schema.Boolean),
})
export type DeleteProgramInput = typeof DeleteProgramInput.Type
export const DeleteProgramResult = Schema.Struct({
  deleted: Schema.Boolean,
  abandonedEnrollments: Int,
})
export type DeleteProgramResult = typeof DeleteProgramResult.Type

export const EnrollProgramInput = Schema.Struct({
  programId: ProgramId,
  startedOn: Schema.optionalKey(LocalDate),
})
export type EnrollProgramInput = typeof EnrollProgramInput.Type
export const EnrollProgramResult = Schema.Struct({
  enrollment: EnrollmentSummary,
  alreadyActive: Schema.Boolean,
})
export type EnrollProgramResult = typeof EnrollProgramResult.Type

export const GetProgramProgressInput = Schema.Struct({ programId: Schema.optionalKey(ProgramId) })
export type GetProgramProgressInput = typeof GetProgramProgressInput.Type
/** `completions` only when `programId` was given, else `[]`. */
export const ProgramProgress = Schema.Struct({
  enrollments: Schema.Array(EnrollmentSummary),
  completions: Schema.Array(
    Schema.Struct({
      enrollmentId: ProgramEnrollmentId,
      dayNumber: DayNumber,
      completedAt: Timestamp,
      durationSeconds: Int,
    }),
  ),
})
export type ProgramProgress = typeof ProgramProgress.Type

export const SetEnrollmentStatusInput = Schema.Struct({
  enrollmentId: ProgramEnrollmentId,
  status: Schema.Literals(["active", "paused", "abandoned"]),
})
export type SetEnrollmentStatusInput = typeof SetEnrollmentStatusInput.Type
export const SetEnrollmentStatusResult = Schema.Struct({ enrollment: EnrollmentSummary })
export type SetEnrollmentStatusResult = typeof SetEnrollmentStatusResult.Type

/** `to: null` reverts `from` to the original exercise. */
export const SwapExerciseInput = Schema.Struct({
  enrollmentId: ProgramEnrollmentId,
  from: CatalogId,
  to: Schema.OptionFromNullOr(CatalogId),
})
export type SwapExerciseInput = typeof SwapExerciseInput.Type
export const SwapExerciseResult = Schema.Struct({
  swaps: Swaps,
  candidates: Schema.Array(CatalogId),
})
export type SwapExerciseResult = typeof SwapExerciseResult.Type

/** The twelve read tools come first and stay contiguous (`slice(0, 12)`), then the write tools. */
export const MCP_TOOLS = [
  "get_overview",
  "get_exercise_history",
  "list_sessions",
  "get_current_plan",
  "search_exercises",
  "get_profile",
  "list_activities",
  "get_nutrition_day",
  "get_week_review",
  "list_programs",
  "get_program",
  "get_program_progress",
  "write_plan_week",
  "log_session",
  "update_profile",
  "log_food",
  "delete_food_entry",
  "write_program",
  "update_program",
  "delete_program",
  "enroll_program",
  "set_enrollment_status",
  "swap_exercise",
] as const
export const McpToolName = Schema.Literals(MCP_TOOLS)
export type McpToolName = typeof McpToolName.Type
