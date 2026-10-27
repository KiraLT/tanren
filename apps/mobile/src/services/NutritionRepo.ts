import {
  buildDayTotals,
  closedWeekInsights,
  type DailyHealth,
  DailyHealthRow,
  type DayTotals,
  type FoodEntry,
  type ImportedActivity,
  ImportedActivityRow,
  type Insight,
  insights,
  LocalDate,
  ProfileRow,
  type WeekReview,
  weekSummary,
} from "@tanren/shared"
import { Array as Arr, Context, DateTime, Effect, Layer, Option, pipe, Schema } from "effect"
import { CurrentUser, ownerId } from "./CurrentUser"
import { liveFoodEntries } from "./FoodEntryRepo"
import { decodeRecords, LocalStore, type LocalStoreShape } from "./LocalStore"
import { shiftDate } from "./progressMath"
import type { StoreError } from "./SqlDriver"

/** One local day for the Today strip and `/health` (nutrition.md §3, §5). */
export interface NutritionDay {
  readonly day: DayTotals
  /** ≤ 3, in the shared builder's group order (kcal, protein, logging, week). */
  readonly insights: ReadonlyArray<Insight>
}

/** One Mon–Sun week for `/health`. */
export interface HealthWeek {
  readonly review: WeekReview
  /** Live imported activities started in the week, `startedAt` desc. */
  readonly activities: ReadonlyArray<ImportedActivity>
  /** The week's live `daily_health` rows, one per date (newest `updatedAt` wins), Monday first. */
  readonly health: ReadonlyArray<DailyHealth>
}

/** Both read the device zone per call (`DateTime.CurrentTimeZone`). */
export interface NutritionRepoShape {
  /** The local date's totals (device zone midnight to midnight) and its insights. */
  readonly day: (
    localDate: LocalDate,
  ) => Effect.Effect<NutritionDay, StoreError, DateTime.CurrentTimeZone>
  /** The week starting on `weekStart` (a Monday): review + the week's Garmin activities. */
  readonly week: (
    weekStart: LocalDate,
  ) => Effect.Effect<HealthWeek, StoreError, DateTime.CurrentTimeZone>
  /**
   * True when any live `daily_health` row exists: only a connected tracker writes them, so it
   * stands in for "tracker connected" while the server status is loading or offline (PWA-2).
   */
  readonly hasDailyHealth: Effect.Effect<boolean, StoreError>
}

const HEALTH = `SELECT * FROM "daily_health" WHERE "deletedAt" IS NULL AND "date" >= ? AND "date" <= ?
  ORDER BY "updatedAt" DESC`
const PROFILE = `SELECT * FROM "profile" WHERE "id" = ? AND "deletedAt" IS NULL LIMIT 1`
/** The MCP rule (`get_week_review`): sessions started in the week with `finishedAt` set. */
const WORKOUTS = `SELECT COUNT(*) AS "n" FROM "workout_session" WHERE "deletedAt" IS NULL
  AND "finishedAt" IS NOT NULL AND "startedAt" >= ? AND "startedAt" < ?`
/**
 * Live planned sessions of the active plan's week whose 7 days contain the Monday: `weekStart` in
 * `(monday − 7, monday]`, the Worker's `get_week_review` rule (plan weeks start on any weekday).
 */
const PLANNED = `SELECT COUNT(*) AS "n" FROM "planned_session" WHERE "deletedAt" IS NULL
  AND "planWeekId" = (SELECT pw."id" FROM "plan_week" pw JOIN "plan" p ON p."id" = pw."planId"
    WHERE p."status" = 'active' AND p."deletedAt" IS NULL AND pw."deletedAt" IS NULL
      AND pw."weekStart" <= ? AND pw."weekStart" > ?
    ORDER BY pw."weekStart" DESC, pw."id" LIMIT 1)`
const ACTIVITIES = `SELECT * FROM "imported_activity" WHERE "deletedAt" IS NULL
  AND "startedAt" >= ? AND "startedAt" < ? ORDER BY "startedAt" DESC, "id" DESC`

const ANY_HEALTH = `SELECT 1 AS "n" FROM "daily_health" WHERE "deletedAt" IS NULL LIMIT 1`

const CountRow = Schema.Struct({ n: Schema.Number })

/** The `n` of a `COUNT(*) AS "n"` statement (0 when no row comes back). */
export const countOf = (
  store: LocalStoreShape,
  sql: string,
  params: ReadonlyArray<string>,
): Effect.Effect<number, StoreError> =>
  store.all({ sql, params }).pipe(
    Effect.flatMap(decodeRecords(CountRow)),
    Effect.map((rows) =>
      Option.getOrElse(
        Option.map(Arr.head(rows), (row) => row.n),
        () => 0,
      ),
    ),
  )

const datesFrom = (first: LocalDate, count: number): Arr.NonEmptyReadonlyArray<LocalDate> =>
  Arr.map(Arr.range(0, count - 1), (offset) => LocalDate.make(shiftDate(first, offset)))

/** Local midnight of `date` in `zone`, as an instant; DST gaps resolve to the earlier offset. */
const midnight = (date: LocalDate, zone: DateTime.TimeZone): DateTime.Utc => {
  const wall = DateTime.makeUnsafe(`${date}T00:00:00.000Z`)
  return pipe(
    DateTime.makeZoned(wall, { timeZone: zone, adjustForTimeZone: true }),
    Option.map(DateTime.toUtc),
    Option.getOrElse(() => wall),
  )
}

/** `[local midnight of first, local midnight of first + days)` as instants. */
export const rangeOf = (first: LocalDate, days: number, zone: DateTime.TimeZone) => ({
  from: midnight(first, zone),
  to: midnight(LocalDate.make(shiftDate(first, days)), zone),
})

const localDateIn = (instant: DateTime.DateTime, zone: DateTime.TimeZone): LocalDate =>
  LocalDate.make(DateTime.formatIsoDate(DateTime.setZone(instant, zone)))

export class NutritionRepo extends Context.Service<NutritionRepo, NutritionRepoShape>()(
  "@tanren/NutritionRepo",
) {
  /** Needs `LocalStore` and `CurrentUser`. ≤ 6 SELECTs per call. */
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const store = yield* LocalStore
      const count = (sql: string, params: ReadonlyArray<string>) => countOf(store, sql, params)
      const owner = ownerId(yield* CurrentUser)

      /** `DayTotals` for `count` consecutive dates from `first`: 3 SELECTs. */
      const daysFrom = (first: LocalDate, count: number, zone: DateTime.TimeZone) =>
        Effect.gen(function* () {
          const entries = yield* liveFoodEntries(store, rangeOf(first, count, zone))
          const health = yield* store
            .all({ sql: HEALTH, params: [first, LocalDate.make(shiftDate(first, count - 1))] })
            .pipe(Effect.flatMap(decodeRecords(DailyHealthRow)))
          const userId = yield* owner
          const profile = yield* store
            .all({ sql: PROFILE, params: [userId] })
            .pipe(Effect.flatMap(decodeRecords(ProfileRow)), Effect.map(Arr.head))
          const nutrition = Option.flatMap(profile, (row) => row.nutrition)
          const byDate = Arr.groupBy(entries, (entry: FoodEntry) =>
            localDateIn(entry.loggedAt, zone),
          )
          // Rows come newest `updatedAt` first, so the first per date wins.
          const healthOf = (date: LocalDate): Option.Option<DailyHealth> =>
            Arr.findFirst(health, (row) => row.date === date)
          const dates = datesFrom(first, count)
          return {
            days: Arr.map(dates, (date) =>
              buildDayTotals({
                date,
                entries: byDate[date] ?? [],
                health: healthOf(date),
                nutrition,
              }),
            ),
            health: Arr.getSomes(Arr.map(dates, healthOf)),
          }
        })

      const day = (localDate: LocalDate) =>
        Effect.gen(function* () {
          const zone = yield* DateTime.CurrentTimeZone
          const { days: week } = yield* daysFrom(LocalDate.make(shiftDate(localDate, -6)), 7, zone)
          const today = Arr.lastNonEmpty(week)
          const hour = DateTime.getPart(DateTime.setZone(yield* DateTime.now, zone), "hour")
          return { day: today, insights: insights({ today, week, hour }) }
        })

      /**
       * Insights for a week (design §5): judged on the current date with the hour now when the
       * week contains it, only the `week_*` rules for a past week (its days are over, NAV-F1),
       * and none for a week still ahead.
       */
      const weekInsights = (
        days: Arr.NonEmptyReadonlyArray<DayTotals>,
        now: DateTime.Zoned,
        todayDate: LocalDate,
      ): ReadonlyArray<Insight> =>
        Arr.headNonEmpty(days).date > todayDate
          ? []
          : Option.match(
              Arr.findFirst(days, (d) => d.date === todayDate),
              {
                onNone: () => closedWeekInsights(days),
                onSome: (today) =>
                  insights({ today, week: days, hour: DateTime.getPart(now, "hour") }),
              },
            )

      const week = (weekStart: LocalDate) =>
        Effect.gen(function* () {
          const zone = yield* DateTime.CurrentTimeZone
          const { days, health } = yield* daysFrom(weekStart, 7, zone)
          const { from, to } = rangeOf(weekStart, 7, zone)
          const bounds = [DateTime.formatIso(from), DateTime.formatIso(to)]
          const workoutsDone = yield* count(WORKOUTS, bounds)
          const activities = yield* store
            .all({ sql: ACTIVITIES, params: bounds })
            .pipe(Effect.flatMap(decodeRecords(ImportedActivityRow)))
          const workoutsPlanned = yield* count(PLANNED, [
            weekStart,
            LocalDate.make(shiftDate(weekStart, -7)),
          ])
          const now = DateTime.setZone(yield* DateTime.now, zone)
          const summary = weekSummary(days)
          const review: WeekReview = {
            weekStart,
            days,
            eatenKcal: summary.eatenKcal,
            burnedKcal: summary.burnedKcal,
            daysWithBurn: summary.daysWithBurn,
            netKcal: summary.netKcal,
            proteinAvgG: summary.proteinAvgG,
            daysOnKcalTarget: summary.daysOnKcalTarget,
            daysOnProteinTarget: summary.daysOnProteinTarget,
            daysLogged: summary.daysLogged,
            workoutsDone,
            workoutsPlanned,
            insights: weekInsights(days, now, localDateIn(now, zone)),
          }
          return { review, activities, health }
        })

      const hasDailyHealth = store
        .all({ sql: ANY_HEALTH, params: [] })
        .pipe(Effect.map(Arr.isReadonlyArrayNonEmpty))

      return NutritionRepo.of({ day, week, hasDailyHealth })
    }),
  )
}
