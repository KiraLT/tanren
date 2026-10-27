import { Array as Arr, Option, pipe, Schema, Struct } from "effect"
import { Label, LocalDate, Note, ROW_COLUMNS, rowFields, Timestamp } from "./common"
import type { DailyHealth } from "./garmin"
import { FoodEntryId } from "./ids"
import { type ActivityLevel, NutritionGoal, type NutritionProfile } from "./user"

/** Food logging and daily balance (ADR-0025, nutrition.md §1, §4, §5). */

export const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
export type Count = typeof Count.Type

export const Kcal = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 }))
export type Kcal = typeof Kcal.Type

export const Grams = Schema.Number.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(5_000),
)
export type Grams = typeof Grams.Type

export const Meal = Schema.Literals(["breakfast", "lunch", "dinner", "snack", "supplement"])
export type Meal = typeof Meal.Type

export const FoodSource = Schema.Literals(["mcp", "manual", "quick_add"])
export type FoodSource = typeof FoodSource.Type

export const FoodItem = Schema.Struct({
  /** "Grilled chicken breast" */
  name: Label,
  /** "1 breast, ~180 g": free text, Claude's words. */
  portion: Label,
  grams: Schema.OptionFromNullOr(Grams),
  kcal: Kcal,
  proteinG: Grams,
  carbsG: Grams,
  fatG: Grams,
  fibreG: Schema.OptionFromNullOr(Grams),
  confidence: Schema.OptionFromNullOr(
    Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  ),
})
export type FoodItem = typeof FoodItem.Type

export const FoodItems = Schema.Array(FoodItem).check(Schema.isMinLength(1), Schema.isMaxLength(20))
export type FoodItems = typeof FoodItems.Type

export const Totals = Schema.Struct({ kcal: Kcal, proteinG: Grams, carbsG: Grams, fatG: Grams })
export type Totals = typeof Totals.Type

const roundTenth = (n: number): number => Math.round(n * 10) / 10

const sumTotals = (
  rows: ReadonlyArray<{
    readonly kcal: number
    readonly proteinG: number
    readonly carbsG: number
    readonly fatG: number
  }>,
): Totals =>
  pipe(
    rows,
    Arr.reduce({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }, (acc, row) => ({
      kcal: acc.kcal + row.kcal,
      proteinG: acc.proteinG + row.proteinG,
      carbsG: acc.carbsG + row.carbsG,
      fatG: acc.fatG + row.fatG,
    })),
    (sum) => ({
      kcal: Math.round(sum.kcal),
      proteinG: roundTenth(sum.proteinG),
      carbsG: roundTenth(sum.carbsG),
      fatG: roundTenth(sum.fatG),
    }),
  )

/** Sum of the items, rounded: kcal to int, grams to 0.1. A row's totals MUST equal it (SyncStore). */
export const totalsOf = (items: ReadonlyArray<FoodItem>): Totals => sumTotals(items)

export const FoodEntryFields = {
  /** When eaten (Claude passes it; default = now). */
  loggedAt: Timestamp,
  meal: Meal,
  source: FoodSource,
  items: FoodItems,
  /** Denormalised `totalsOf(items)`. */
  ...Totals.fields,
  note: Schema.OptionFromNullOr(Note),
}

/** One meal, snack or supplement. Synced both ways (the app quick-adds, Claude logs via MCP). */
export class FoodEntry extends Schema.Class<FoodEntry>("@tanren/shared/FoodEntry")({
  ...rowFields(FoodEntryId),
  ...FoodEntryFields,
}) {}
export type FoodEntryEncoded = (typeof FoodEntry)["Encoded"]

export const FoodEntryInsert = FoodEntry.mapFields(Struct.omit(ROW_COLUMNS))
export type FoodEntryInsert = typeof FoodEntryInsert.Type

/** Exact partial: absent key = unchanged. `items` and the totals change together (SyncStore check). */
export const FoodEntryPatch = Schema.Struct({
  loggedAt: Schema.optionalKey(Timestamp),
  meal: Schema.optionalKey(Meal),
  items: Schema.optionalKey(FoodItems),
  kcal: Schema.optionalKey(Kcal),
  proteinG: Schema.optionalKey(Grams),
  carbsG: Schema.optionalKey(Grams),
  fatG: Schema.optionalKey(Grams),
  note: Schema.optionalKey(Schema.OptionFromNullOr(Note)),
})
export type FoodEntryPatch = typeof FoodEntryPatch.Type

/** The day's eaten totals: live entries only (`deletedAt` None). */
export const dayTotals = (entries: ReadonlyArray<FoodEntry>): Totals =>
  sumTotals(Arr.filter(entries, (entry) => Option.isNone(entry.deletedAt)))

// Targets (nutrition.md §4)

const ACTIVITY_FACTOR: { readonly [L in ActivityLevel]: number } = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  extra: 1.9,
}

const GOAL_FACTOR: { readonly [G in NutritionGoal]: number } = {
  lose_weight: 0.8,
  maintain: 1,
  gain_muscle: 1.1,
}

const PROTEIN_G_PER_KG: { readonly [G in NutritionGoal]: number } = {
  lose_weight: 2.2,
  maintain: 1.6,
  gain_muscle: 1.8,
}

export const KCAL_FLOOR = 1200

/** Mifflin-St Jeor when height, birth year and sex are all known; else `22 · weight`. */
const bmrOf = (profile: NutritionProfile, today: LocalDate): number =>
  pipe(
    Option.all({ height: profile.heightCm, birthYear: profile.birthYear, sex: profile.sex }),
    Option.match({
      onNone: () => 22 * profile.bodyWeightKg,
      onSome: ({ height, birthYear, sex }) =>
        10 * profile.bodyWeightKg +
        6.25 * height -
        5 * (Number(today.slice(0, 4)) - birthYear) +
        (sex === "male" ? 5 : -161),
    }),
  )

/** Daily kcal (nearest 10, ≥ 1200) and protein (nearest 5 g); overrides win. Pure. */
export const nutritionTargets = (
  profile: NutritionProfile,
  today: LocalDate,
): { readonly kcal: number; readonly proteinG: number } => {
  const derivedKcal =
    bmrOf(profile, today) * ACTIVITY_FACTOR[profile.activityLevel] * GOAL_FACTOR[profile.goal]
  const kcal = Math.max(KCAL_FLOOR, Math.round(derivedKcal / 10) * 10)
  const proteinG = Math.round((profile.bodyWeightKg * PROTEIN_G_PER_KG[profile.goal]) / 5) * 5
  return {
    kcal: Option.getOrElse(profile.kcalTarget, () => kcal),
    proteinG: Option.getOrElse(profile.proteinTargetG, () => proteinG),
  }
}

// Day and week (nutrition.md §3; the MCP results in `mcp.ts` reuse these)

export const DayTargets = Schema.Struct({ kcal: Kcal, proteinG: Grams, goal: NutritionGoal })
export type DayTargets = typeof DayTargets.Type

export const DayTotals = Schema.Struct({
  date: LocalDate,
  eaten: Totals,
  /** Garmin daily total incl. BMR; partial until midnight. */
  burned: Schema.OptionFromNullOr(Kcal),
  activeBurned: Schema.OptionFromNullOr(Kcal),
  steps: Schema.OptionFromNullOr(Count),
  /** `daily_health.updatedAt`: "as of HH:MM" (ADR-0025 §1). */
  burnedAsOf: Schema.OptionFromNullOr(Timestamp),
  targets: Schema.OptionFromNullOr(DayTargets),
  /** budget = targets.kcal + (eatBackActive ? max(activeBurned, 0) : 0) */
  budgetKcal: Schema.OptionFromNullOr(Kcal),
  /** budget − eaten.kcal */
  kcalLeft: Schema.OptionFromNullOr(Schema.Int),
  proteinLeftG: Schema.OptionFromNullOr(Schema.Number),
  entries: Schema.Array(FoodEntry),
})
export type DayTotals = typeof DayTotals.Type

export interface DayTotalsInput {
  readonly date: LocalDate
  /** The day's entries; tombstones are dropped. */
  readonly entries: ReadonlyArray<FoodEntry>
  /** The day's Garmin row, if any. */
  readonly health: Option.Option<DailyHealth>
  /** The profile's nutrition goal; `None` = tracking off (no targets, nothing left). */
  readonly nutrition: Option.Option<NutritionProfile>
}

const KCAL_MAX = 10_000

/**
 * The full `DayTotals` for one local date (nutrition.md §3), shared by the Worker's MCP tools and
 * the app's `NutritionRepo` so both compute it the same way. Pure.
 * budget = target kcal + (eatBackActive ? max(activeCalories, 0) : 0); kcalLeft = budget − eaten.
 */
export const buildDayTotals = (input: DayTotalsInput): DayTotals => {
  const entries = Arr.filter(input.entries, (entry) => Option.isNone(entry.deletedAt))
  const eaten = dayTotals(entries)
  const activeBurned = Option.flatMap(input.health, (health) => health.activeCalories)
  const targets = Option.map(input.nutrition, (profile) => ({
    ...nutritionTargets(profile, input.date),
    goal: profile.goal,
  }))
  const budgetKcal = Option.map(input.nutrition, (profile) => {
    const target = nutritionTargets(profile, input.date).kcal
    const eatBack = profile.eatBackActive
      ? Math.max(
          Option.getOrElse(activeBurned, () => 0),
          0,
        )
      : 0
    return Math.min(KCAL_MAX, target + eatBack)
  })
  return {
    date: input.date,
    eaten,
    burned: Option.flatMap(input.health, (health) => health.totalCalories),
    activeBurned,
    steps: Option.flatMap(input.health, (health) => health.steps),
    burnedAsOf: Option.map(input.health, (health) => health.updatedAt),
    targets,
    budgetKcal,
    kcalLeft: Option.map(budgetKcal, (budget) => budget - eaten.kcal),
    proteinLeftG: Option.map(targets, (t) => roundTenth(t.proteinG - eaten.proteinG)),
    entries,
  }
}

const KCAL_BAND: { readonly [G in NutritionGoal]: readonly [number, number] } = {
  lose_weight: [-0.15, 0.05],
  gain_muscle: [-0.05, 0.15],
  maintain: [-0.1, 0.1],
}

const isLogged = (day: DayTotals): boolean => day.entries.length > 0

/** Logged and eaten kcal within the goal's band of the kcal target (§3 "On target"). */
export const onKcalTarget = (day: DayTotals): boolean =>
  isLogged(day) &&
  Option.match(day.targets, {
    onNone: () => false,
    onSome: (targets) => {
      const [low, high] = KCAL_BAND[targets.goal]
      const ratio = (day.eaten.kcal - targets.kcal) / targets.kcal
      return ratio >= low && ratio <= high
    },
  })

/** Logged and eaten protein ≥ the protein target. */
export const onProteinTarget = (day: DayTotals): boolean =>
  isLogged(day) &&
  Option.match(day.targets, {
    onNone: () => false,
    onSome: (targets) => day.eaten.proteinG >= targets.proteinG,
  })

export interface WeekSummary {
  readonly eatenKcal: number
  readonly burnedKcal: Option.Option<number>
  readonly daysWithBurn: number
  /** Σ(eaten − burned) over the days with a burn value. */
  readonly netKcal: Option.Option<number>
  /** Mean protein over the logged days (0 when none). */
  readonly proteinAvgG: number
  readonly daysOnKcalTarget: number
  readonly daysOnProteinTarget: number
  readonly daysLogged: number
}

/** The `WeekReview` aggregates over the given days (pure). */
export const weekSummary = (days: ReadonlyArray<DayTotals>): WeekSummary => {
  const logged = Arr.filter(days, isLogged)
  const withBurn = Arr.getSomes(
    Arr.map(days, (day) => Option.map(day.burned, (burned) => ({ eaten: day.eaten.kcal, burned }))),
  )
  const sum = (ns: ReadonlyArray<number>): number => Arr.reduce(ns, 0, (a, b) => a + b)
  const hasBurn = withBurn.length > 0
  return {
    eatenKcal: sum(Arr.map(days, (day) => day.eaten.kcal)),
    burnedKcal: hasBurn ? Option.some(sum(Arr.map(withBurn, (d) => d.burned))) : Option.none(),
    daysWithBurn: withBurn.length,
    netKcal: hasBurn
      ? Option.some(sum(Arr.map(withBurn, (d) => d.eaten - d.burned)))
      : Option.none(),
    proteinAvgG:
      logged.length === 0
        ? 0
        : roundTenth(sum(Arr.map(logged, (day) => day.eaten.proteinG)) / logged.length),
    daysOnKcalTarget: Arr.filter(days, onKcalTarget).length,
    daysOnProteinTarget: Arr.filter(days, onProteinTarget).length,
    daysLogged: logged.length,
  }
}

// Insights (nutrition.md §5)

export const InsightRule = Schema.Literals([
  "protein_short",
  "protein_hit",
  "kcal_over",
  "kcal_under_lose",
  "kcal_under_gain",
  "nothing_logged",
  "week_streak",
  "week_protein_low",
])
export type InsightRule = typeof InsightRule.Type

export const Insight = Schema.Struct({ rule: InsightRule, text: Label })
export type Insight = typeof Insight.Type

export interface InsightInput {
  /** Today's totals. */
  readonly today: DayTotals
  /** The 7 days ending today (today included). */
  readonly week: ReadonlyArray<DayTotals>
  /** Local hour of "now" in the profile zone, 0–23. */
  readonly hour: number
}

/** `1420` → "1,420": rounded, comma thousands grouping (the app's `grouped()`; Lead 14:56). */
export const formatInt = (n: number): string =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")

const insight = (rule: InsightRule, text: string): Insight => ({ rule, text })

const when = (cond: boolean, make: () => Insight): Option.Option<Insight> =>
  cond ? Option.some(make()) : Option.none()

/** ≤ 3 insights, first match per group, in group order kcal, protein, logging, week. Pure. */
export const insights = (input: InsightInput): ReadonlyArray<Insight> => {
  const { today, week, hour } = input
  const logging = when(hour >= 12 && today.entries.length === 0, () =>
    insight("nothing_logged", "Nothing logged yet — send Claude a photo of your next meal"),
  )
  const groups: ReadonlyArray<Option.Option<Insight>> = Option.match(today.targets, {
    onNone: () => [logging],
    onSome: (targets) => {
      const kcalLeft = Option.getOrElse(today.kcalLeft, () => 0)
      const proteinLeft = Option.getOrElse(today.proteinLeftG, () => 0)
      const summary = weekSummary(week)
      const kcal = Option.firstSomeOf([
        when(Option.isSome(today.kcalLeft) && kcalLeft < -100, () =>
          insight("kcal_over", `${formatInt(-kcalLeft)} kcal over target today`),
        ),
        when(targets.goal === "lose_weight" && hour >= 20 && kcalLeft > 300, () =>
          insight(
            "kcal_under_lose",
            `${formatInt(kcalLeft)} kcal under — on track for the deficit`,
          ),
        ),
        when(targets.goal === "gain_muscle" && hour >= 20 && kcalLeft > 300, () =>
          insight(
            "kcal_under_gain",
            `${formatInt(kcalLeft)} kcal to go — add a meal to hit the surplus`,
          ),
        ),
      ])
      const protein = Option.firstSomeOf([
        when(Option.isSome(today.proteinLeftG) && proteinLeft >= 30 && hour >= 15, () =>
          insight(
            "protein_short",
            // Exact grams (Lead 17:00): the /health card shows "78 / 155 g" beside it.
            `Protein ${formatInt(Math.round(proteinLeft))} g short — a shake covers it`,
          ),
        ),
        when(Option.isSome(today.proteinLeftG) && proteinLeft <= 0, () =>
          insight("protein_hit", "Protein target hit"),
        ),
      ])
      const weekly = Option.firstSomeOf([
        when(summary.daysOnKcalTarget >= 5, () =>
          insight("week_streak", `${summary.daysOnKcalTarget} of 7 days on target this week`),
        ),
        when(summary.daysLogged >= 3 && summary.proteinAvgG < 0.8 * targets.proteinG, () =>
          insight(
            "week_protein_low",
            `Protein averaged ${formatInt(summary.proteinAvgG)} g of ${formatInt(targets.proteinG)} g: plan a protein source per meal`,
          ),
        ),
      ])
      return [kcal, protein, logging, weekly]
    },
  })
  return Arr.take(Arr.getSomes(groups), 3)
}
