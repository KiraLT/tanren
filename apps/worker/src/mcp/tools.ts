import {
  CurrentPlanResult,
  type Exercise,
  ExerciseHistory,
  type ExerciseSummary,
  GetCurrentPlanInput,
  GetExerciseHistoryInput,
  GetOverviewInput,
  ListSessionsInput,
  type McpToolName,
  NotFound,
  Overview,
  type Period,
  SessionList,
  type UserId,
  ValidationError,
  type WorkoutSet,
} from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Number as Num, Option, Order, pipe, Schema } from "effect"
import {
  ExerciseRepo,
  type PersistenceError,
  PlanRepo,
  type ProfileRepo,
  SessionRepo,
} from "../repos"

// The MCP read tools (docs/design/mcp.md §4) as plain Effect programs over the repository ports.
// No MCP SDK here: `server.ts` registers `readTools` and runs `call`.

export type ToolDeps = ExerciseRepo | PlanRepo | SessionRepo | ProfileRepo
export type ToolError = NotFound | ValidationError | PersistenceError

export interface ReadTool<I extends Schema.Top, O extends Schema.Top> {
  readonly name: McpToolName
  readonly description: string
  readonly input: I
  readonly output: O
  readonly run: (userId: UserId, input: I["Type"]) => Effect.Effect<O["Type"], ToolError, ToolDeps>
}

/** A schema that decodes and encodes without services (every MCP contract schema). */
export type ToolSchema = Schema.Top & {
  readonly DecodingServices: never
  readonly EncodingServices: never
}

/**
 * A `ReadTool` with its schema types erased, so `server.ts` can iterate `readTools`. `call` is the
 * whole boundary: it decodes the raw JSON `args` with `input` (failure → `ValidationError`), runs
 * the tool, and encodes the result with `output` into its JSON form (`Option` → null, `DateTime`
 * → ISO string), ready for `structuredContent`. Register `input` as a JSON Schema so the SDK hands
 * over raw args; a Standard Schema would hand over already-decoded values and `call` would decode
 * twice.
 */
export interface AnyReadTool {
  readonly name: McpToolName
  readonly description: string
  readonly input: ToolSchema
  readonly output: ToolSchema
  readonly call: (userId: UserId, args: unknown) => Effect.Effect<unknown, ToolError, ToolDeps>
}

export const eraseReadTool = <I extends ToolSchema, O extends ToolSchema>(
  tool: ReadTool<I, O>,
): AnyReadTool => ({
  name: tool.name,
  description: tool.description,
  input: tool.input,
  output: tool.output,
  call: (userId, args) =>
    Schema.decodeUnknownEffect(tool.input)(args).pipe(
      Effect.mapError(ValidationError.fromSchemaError),
      Effect.flatMap((input) => tool.run(userId, input)),
      // Our own output failing its schema is a bug in the tool, not a caller error.
      Effect.flatMap((output) =>
        Schema.encodeUnknownEffect(tool.output)(output).pipe(Effect.orDie),
      ),
    ),
})

const PERIOD_DAYS: { readonly [P in Period]: number } = { "7d": 7, "30d": 30, "90d": 90 }
export const DEFAULT_PERIOD: Period = "30d"
export const DEFAULT_HISTORY_LIMIT = 20
/** `PageLimit`'s maximum; `listSetsForExercise` does not check `limit` itself. */
export const MAX_HISTORY_LIMIT = 500

const volumeOf = (sets: ReadonlyArray<WorkoutSet>): number =>
  Arr.reduce(sets, 0, (total, set) => total + set.weightKg * set.reps)

const byWeightThenReps: Order.Order<WorkoutSet> = Order.combine(
  Order.mapInput(Order.Number, (set: WorkoutSet) => set.weightKg),
  Order.mapInput(Order.Number, (set: WorkoutSet) => set.reps),
)

const byVolumeDescThenName: Order.Order<ExerciseSummary> = Order.combine(
  Order.flip(Order.mapInput(Order.Number, (summary: ExerciseSummary) => summary.volumeKg)),
  Order.mapInput(Order.String, (summary: ExerciseSummary) => summary.name),
)

const summarize = (
  exercise: Exercise,
  sets: ReadonlyArray<WorkoutSet>,
): Option.Option<ExerciseSummary> => {
  const own = Arr.filter(sets, (set) => set.exerciseId === exercise.id)
  if (!Arr.isReadonlyArrayNonEmpty(own)) {
    return Option.none()
  }
  const best = Arr.max(own, byWeightThenReps)
  return Option.some({
    exerciseId: exercise.id,
    name: exercise.name,
    muscleGroups: exercise.muscleGroups,
    sessions: Arr.dedupe(Arr.map(own, (set) => set.sessionId)).length,
    sets: own.length,
    volumeKg: volumeOf(own),
    best: Option.some({ weightKg: best.weightKg, reps: best.reps, loggedAt: best.loggedAt }),
    lastLoggedAt: Option.some(
      Arr.max(
        Arr.map(own, (set) => set.loggedAt),
        DateTime.Order,
      ),
    ),
  })
}

/**
 * `{ planId, name, weeks }` of the active plan in 2 statements (`currentPlan` costs 4: it also
 * loads planned sessions and sets). Same rule as `PlanRepo.currentPlan`: the first live plan with
 * status "active" in `(createdAt, id)` order, which is `listPlans`' order.
 */
const activePlanSummary = Effect.fn("activePlanSummary")(function* (userId: UserId) {
  const planRepo = yield* PlanRepo
  const plans = yield* planRepo.listPlans(userId, { includeDeleted: false })
  const active = Arr.findFirst(plans, (plan) => plan.status === "active")
  if (Option.isNone(active)) {
    return Option.none<Option.Option.Value<Overview["currentPlan"]>>()
  }
  const weeks = yield* planRepo.listWeeks(userId, active.value.id)
  return Option.some({ planId: active.value.id, name: active.value.name, weeks: weeks.length })
})

export const getOverview: ReadTool<typeof GetOverviewInput, typeof Overview> = {
  name: "get_overview",
  description:
    "Training summary for the last 7, 30 or 90 days (period, default 30d) ending now: session, " +
    "set and volume totals, then one entry per exercise trained (volume = sum of weightKg x reps, " +
    "best = heaviest set, then most reps), heaviest volume first, plus the active plan. Weights " +
    "are kg; timestamps are ISO-8601 UTC; range is half-open [from, to). Use the exerciseId " +
    "values with get_exercise_history.",
  input: GetOverviewInput,
  output: Overview,
  run: Effect.fn("get_overview")(function* (userId: UserId, input: GetOverviewInput) {
    const period = input.period ?? DEFAULT_PERIOD
    const to = yield* DateTime.now
    const from = DateTime.subtract(to, { days: PERIOD_DAYS[period] })
    const range = { from, to }
    const sessionRepo = yield* SessionRepo
    const sessions = yield* sessionRepo.listSessions(userId, range)
    const sets = yield* sessionRepo.listSetsInRange(userId, range)
    // Tombstoned exercises too: a set logged in range still names its exercise.
    const exercises = yield* (yield* ExerciseRepo).list(userId, { includeDeleted: true })
    const plan = yield* activePlanSummary(userId)
    return {
      period,
      range,
      sessions: sessions.length,
      sets: sets.length,
      volumeKg: volumeOf(sets),
      exercises: pipe(
        exercises,
        Arr.map((exercise) => summarize(exercise, sets)),
        Arr.getSomes,
        Arr.sort(byVolumeDescThenName),
      ),
      currentPlan: plan,
    }
  }),
}

export const getExerciseHistory: ReadTool<typeof GetExerciseHistoryInput, typeof ExerciseHistory> =
  {
    name: "get_exercise_history",
    description:
      "One exercise and its logged sets, grouped by session, newest session first, for the last " +
      "`limit` sessions that contain it (default 20, max 500). Weights are kg; timestamps are " +
      "ISO-8601 UTC. exerciseId comes from get_overview or get_current_plan.",
    input: GetExerciseHistoryInput,
    output: ExerciseHistory,
    run: Effect.fn("get_exercise_history")(function* (
      userId: UserId,
      input: GetExerciseHistoryInput,
    ) {
      // Repo scoping makes a foreign id and an unknown one look the same: both are NotFound.
      const exercise = yield* (yield* ExerciseRepo).get(userId, input.exerciseId)
      if (Option.isNone(exercise)) {
        return yield* new NotFound({ entity: "exercise", id: input.exerciseId })
      }
      const limit = Num.clamp(Math.trunc(input.limit ?? DEFAULT_HISTORY_LIMIT), {
        minimum: 1,
        maximum: MAX_HISTORY_LIMIT,
      })
      const sessionRepo = yield* SessionRepo
      // Two statements over the same newest-`limit` sessions, newest first (never a `getSession`
      // per entry: D1 Free allows 50 statements per invocation and `limit` goes up to 500).
      const sessions = yield* sessionRepo.listSessionsForExercise(userId, input.exerciseId, limit)
      const sets = yield* sessionRepo.listSetsForExercise(userId, input.exerciseId, limit)
      const entries = Arr.map(sessions, (session) => ({
        session,
        sets: Arr.filter(sets, (set) => set.sessionId === session.id),
      }))
      return { exercise: exercise.value, entries }
    }),
  }

export const listSessions: ReadTool<typeof ListSessionsInput, typeof SessionList> = {
  name: "list_sessions",
  description:
    "Logged sessions whose start time is in the half-open range [from, to) (ISO-8601 UTC), " +
    "oldest first. With includeSets: true each session carries its sets (weights in kg), " +
    "otherwise sets is [].",
  input: ListSessionsInput,
  output: SessionList,
  run: Effect.fn("list_sessions")(function* (userId: UserId, input: ListSessionsInput) {
    if (DateTime.Order(input.to, input.from) < 0) {
      return yield* new ValidationError({
        message: "`to` must not be before `from`",
        issues: [{ path: ["to"], message: "must not be before from" }],
      })
    }
    const range = { from: input.from, to: input.to }
    const sessionRepo = yield* SessionRepo
    const sessions = yield* sessionRepo.listSessions(userId, range)
    const sets: ReadonlyArray<WorkoutSet> =
      input.includeSets === true ? yield* sessionRepo.listSetsInRange(userId, range) : []
    return {
      range,
      sessions: Arr.map(sessions, (session) => ({
        session,
        sets: Arr.filter(sets, (set) => set.sessionId === session.id),
      })),
    }
  }),
}

export const getCurrentPlan: ReadTool<typeof GetCurrentPlanInput, typeof CurrentPlanResult> = {
  name: "get_current_plan",
  description:
    "The active training plan with its weeks, planned sessions and planned sets (target weights " +
    "in kg, dates YYYY-MM-DD, timestamps ISO-8601 UTC), or null when there is no active plan.",
  input: GetCurrentPlanInput,
  output: CurrentPlanResult,
  run: Effect.fn("get_current_plan")(function* (userId: UserId, _input: GetCurrentPlanInput) {
    // The contract's output is `CurrentPlan | null` (the JSON shape), so `Option` ends here.
    return Option.getOrNull(yield* (yield* PlanRepo).currentPlan(userId))
  }),
}

/** The step-4 tools, in `MCP_TOOLS` order. */
export const readTools: ReadonlyArray<AnyReadTool> = [
  eraseReadTool(getOverview),
  eraseReadTool(getExerciseHistory),
  eraseReadTool(listSessions),
  eraseReadTool(getCurrentPlan),
]
