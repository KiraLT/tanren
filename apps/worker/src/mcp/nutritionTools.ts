import { FoodEntryRepo, GarminImportRepo } from "@tanren/db"
import {
  buildDayTotals,
  type DailyHealth,
  type DayTotals,
  DeleteFoodEntryInput,
  DeleteFoodEntryResult,
  FoodEntry,
  FoodEntryId,
  GetNutritionDayInput,
  GetNutritionDayResult,
  GetWeekReviewInput,
  GetWeekReviewResult,
  insights,
  type LocalDate,
  LogFoodInput,
  LogFoodResult,
  newId,
  type Profile,
  totalsOf,
  type UserId,
  ValidationError,
  weekSummary,
} from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Option } from "effect"
import { PlanRepo, ProfileRepo, SessionRepo } from "../repos"
import { addDays, dayRange, localDayOf, localHourOf, weekOf } from "../time/localDate"
import { liveProfile, zoneOfProfile } from "../time/profileZone"
import { type AnyTool, eraseTool, type Tool } from "./tools"

// The MCP nutrition tools (docs/design/nutrition.md §3, ADR-0025). The tool layer only gathers
// inputs (profile, entries per local day, Garmin day rows, sessions, plan); every number comes
// from the shared `buildDayTotals` / `weekSummary` / `insights`, exactly as the app computes it.

/** MCP annotations of the nutrition write tools (nutrition.md §3); `server.ts` reads them. */
export const nutritionWriteAnnotations = {
  log_food: { readOnlyHint: false, idempotentHint: false, destructiveHint: false },
  delete_food_entry: { readOnlyHint: false, idempotentHint: true, destructiveHint: true },
} as const

interface NutritionContext {
  readonly timezone: string
  readonly nutrition: Profile["nutrition"]
}

/** The caller's live profile zone and nutrition goal; no profile → UTC and no targets. */
const contextOf = Effect.fn("nutritionContext")(function* (userId: UserId) {
  const stored = yield* (yield* ProfileRepo).get(userId)
  return {
    timezone: zoneOfProfile(stored),
    nutrition: Option.flatMap(liveProfile(stored), (profile) => profile.nutrition),
  } satisfies NutritionContext
})

const healthOn = (rows: ReadonlyArray<DailyHealth>, date: LocalDate): Option.Option<DailyHealth> =>
  Arr.findFirst(rows, (row) => row.date === date)

/** One local day: its entries (1 statement), its Garmin row (1 statement), the shared totals. */
const loadDay = Effect.fn("loadDay")(function* (
  userId: UserId,
  date: LocalDate,
  context: NutritionContext,
) {
  const range = yield* dayRange(date, context.timezone)
  const entries = yield* (yield* FoodEntryRepo).listRange(userId, range)
  const health = yield* (yield* GarminImportRepo).listDays(userId, date, date)
  return buildDayTotals({
    date,
    entries,
    health: healthOn(health, date),
    nutrition: context.nutrition,
  })
})

export const logFood: Tool<typeof LogFoodInput, typeof LogFoodResult> = {
  name: "log_food",
  kind: "write",
  description:
    "Log one meal, snack or supplement as a list of food items with calories and macros. Use this when " +
    "the user describes or photographs food. Estimate from the photo or description. For each item first state " +
    "the portion in household units and grams in `portion` (plate ≈ 26 cm, fist ≈ 1 cup, palm ≈ 100 g cooked " +
    "meat, thumb ≈ 1 tbsp; e.g. '1 bowl, ~300 g'), then derive kcal, proteinG, carbsG, fatG from that portion. " +
    "Add a separate cooking-fat item (oil, butter, sauce) when food looks fried, roasted, dressed or sauced. " +
    "Prefer a slightly high estimate for fat-rich dishes: photo estimates run 250–350 kcal low per meal, mostly " +
    "hidden fat. Set `confidence` 0–1 per item (0.9 packaged/labelled, 0.6 typical home plate, 0.3 unclear). " +
    "Never ask the user for weights or labels — pick the most likely portion; precision is not needed. `meal` from the time " +
    "of day if not stated (05–10 breakfast, 11–14 lunch, 17–21 dinner, else snack; shakes/creatine/vitamins = " +
    "supplement). `loggedAt` defaults to now; pass the time if the user ate earlier. Returns the entry and the " +
    "day's totals vs targets: tell the user kcal and protein left in one line.",
  input: LogFoodInput,
  output: LogFoodResult,
  run: Effect.fn("log_food")(function* (userId: UserId, input: LogFoodInput) {
    const now = yield* DateTime.now
    const id = yield* newId(FoodEntryId)
    const entry = yield* FoodEntry.makeEffect({
      id,
      userId,
      createdAt: now,
      updatedAt: now,
      deletedAt: Option.none(),
      loggedAt: input.loggedAt ?? now,
      meal: input.meal,
      source: "mcp",
      items: input.items,
      ...totalsOf(input.items),
      note: Option.fromNullishOr(input.note),
    }).pipe(Effect.mapError(ValidationError.fromIssue))
    yield* (yield* FoodEntryRepo).put(userId, [entry])
    const context = yield* contextOf(userId)
    const date = yield* localDayOf(entry.loggedAt, context.timezone)
    const day = yield* loadDay(userId, date, context)
    return { entry, day }
  }),
}

export const getNutritionDay: Tool<typeof GetNutritionDayInput, typeof GetNutritionDayResult> = {
  name: "get_nutrition_day",
  kind: "read",
  description:
    "Calories eaten (sum of logged food), burned (Garmin daily total incl. BMR, null when no " +
    "Garmin data yet; today's value is partial until midnight. " +
    "`burnedAsOf` is the time of the last Garmin pull; " +
    "`budgetKcal` already includes the eat-back adjustment when the profile enables it.), " +
    "steps, targets from the profile's nutrition goal, " +
    "and what is left, for one local date (default today in the profile timezone). Lists the entries so you can " +
    "correct or delete one (delete_food_entry).",
  input: GetNutritionDayInput,
  output: GetNutritionDayResult,
  run: Effect.fn("get_nutrition_day")(function* (userId: UserId, input: GetNutritionDayInput) {
    const context = yield* contextOf(userId)
    const date = input.date ?? (yield* localDayOf(yield* DateTime.now, context.timezone))
    return yield* loadDay(userId, date, context)
  }),
}

/** Finished sessions started in `[from, to)` and the active plan's planned sessions that week. */
const workoutsOf = Effect.fn("workoutsOf")(function* (
  userId: UserId,
  monday: LocalDate,
  range: { readonly from: DateTime.Utc; readonly to: DateTime.Utc },
) {
  const sessions = yield* (yield* SessionRepo).listSessions(userId, range)
  const current = yield* (yield* PlanRepo).currentPlan(userId)
  const weekBefore = yield* addDays(monday, -7)
  const planned = Option.match(current, {
    onNone: () => 0,
    onSome: (plan) => {
      // The plan week whose 7 days contain the Monday: weekStart in (monday − 7, monday]
      // (`LocalDate` strings order like dates).
      const week = Arr.findFirst(
        plan.weeks,
        (candidate) => candidate.weekStart <= monday && candidate.weekStart > weekBefore,
      )
      return Option.match(week, {
        onNone: () => 0,
        onSome: (w) => Arr.filter(plan.sessions, (s) => s.planWeekId === w.id).length,
      })
    },
  })
  return {
    workoutsDone: Arr.filter(sessions, (session) => Option.isSome(session.finishedAt)).length,
    workoutsPlanned: planned,
  }
})

export const getWeekReview: Tool<typeof GetWeekReviewInput, typeof GetWeekReviewResult> = {
  name: "get_week_review",
  kind: "read",
  description:
    "Mon–Sun review for the week containing weekStart (default this week): per-day totals, " +
    "eaten vs burned, net balance over the days Garmin covered, protein average, days on target, workouts done vs " +
    "planned, and rule-based insights. Use it to answer 'how did my week go' and to suggest next week's changes.",
  input: GetWeekReviewInput,
  output: GetWeekReviewResult,
  run: Effect.fn("get_week_review")(function* (userId: UserId, input: GetWeekReviewInput) {
    const context = yield* contextOf(userId)
    const now = yield* DateTime.now
    const today = yield* localDayOf(now, context.timezone)
    const dates = yield* weekOf(input.weekStart ?? today)
    const monday = dates[0] ?? today
    const sunday = dates[6] ?? today
    const from = (yield* dayRange(monday, context.timezone)).from
    const to = (yield* dayRange(sunday, context.timezone)).to
    const entries = yield* (yield* FoodEntryRepo).listRange(userId, { from, to })
    const health = yield* (yield* GarminImportRepo).listDays(userId, monday, sunday)
    const entryDays = yield* Effect.forEach(entries, (entry) =>
      Effect.map(localDayOf(entry.loggedAt, context.timezone), (date) => ({ date, entry })),
    )
    const days: ReadonlyArray<DayTotals> = Arr.map(dates, (date) =>
      buildDayTotals({
        date,
        entries: Arr.map(
          Arr.filter(entryDays, (e) => e.date === date),
          (e) => e.entry,
        ),
        health: healthOn(health, date),
        nutrition: context.nutrition,
      }),
    )
    const workouts = yield* workoutsOf(userId, monday, { from, to })
    // The current week: insights about today at the local hour; a past or future week is read as
    // of its Sunday night.
    const current = Arr.findFirst(days, (day) => day.date === today)
    const focus = Option.orElse(current, () => Arr.last(days))
    const hour = Option.isSome(current) ? localHourOf(now, context.timezone) : 23
    return {
      weekStart: monday,
      days,
      ...weekSummary(days),
      workoutsDone: workouts.workoutsDone,
      workoutsPlanned: workouts.workoutsPlanned,
      insights: Option.match(focus, {
        onNone: () => [],
        onSome: (day) => insights({ today: day, week: days, hour }),
      }),
    }
  }),
}

export const deleteFoodEntry: Tool<typeof DeleteFoodEntryInput, typeof DeleteFoodEntryResult> = {
  name: "delete_food_entry",
  kind: "write",
  description:
    "Soft-deletes one food entry by id (from log_food or get_nutrition_day). Not undoable.",
  input: DeleteFoodEntryInput,
  output: DeleteFoodEntryResult,
  run: Effect.fn("delete_food_entry")(function* (userId: UserId, input: DeleteFoodEntryInput) {
    return { deleted: yield* (yield* FoodEntryRepo).softDelete(userId, input.id) }
  }),
}

/** The nutrition read tools, in `MCP_TOOLS` order. */
export const nutritionReadTools: ReadonlyArray<AnyTool> = [
  eraseTool(getNutritionDay),
  eraseTool(getWeekReview),
]

/** The nutrition write tools, in `MCP_TOOLS` order. */
export const nutritionWriteTools: ReadonlyArray<AnyTool> = [
  eraseTool(logFood),
  eraseTool(deleteFoodEntry),
]
