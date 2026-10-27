import {
  buildDayTotals,
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
import { decodeRecords, LocalStore } from "./LocalStore"
import { PlanWeekRepo } from "./PlanWeekRepo"
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
}

/** Both read the device zone per call (`DateTime.CurrentTimeZone`), like `PlanWeekRepo.currentWeek`. */
export interface NutritionRepoShape {
  /** The local date's totals (device zone midnight to midnight) and its insights. */
  readonly day: (
    localDate: LocalDate,
  ) => Effect.Effect<NutritionDay, StoreError, DateTime.CurrentTimeZone>
  /** The week starting on `weekStart` (a Monday): review + the week's Garmin activities. */
  readonly week: (
    weekStart: LocalDate,
  ) => Effect.Effect<HealthWeek, StoreError, DateTime.CurrentTimeZone>
}

const HEALTH = `SELECT * FROM "daily_health" WHERE "deletedAt" IS NULL AND "date" >= ? AND "date" <= ?
  ORDER BY "updatedAt" DESC`
const PROFILE = `SELECT * FROM "profile" WHERE "id" = ? AND "deletedAt" IS NULL LIMIT 1`
const WORKOUTS = `SELECT COUNT(*) AS "n" FROM "workout_session" WHERE "deletedAt" IS NULL
  AND "finishedAt" IS NOT NULL AND "finishedAt" >= ? AND "finishedAt" < ?`
const ACTIVITIES = `SELECT * FROM "imported_activity" WHERE "deletedAt" IS NULL
  AND "startedAt" >= ? AND "startedAt" < ? ORDER BY "startedAt" DESC, "id" DESC`

const CountRow = Schema.Struct({ n: Schema.Number })

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
const rangeOf = (first: LocalDate, days: number, zone: DateTime.TimeZone) => ({
  from: midnight(first, zone),
  to: midnight(LocalDate.make(shiftDate(first, days)), zone),
})

const localDateIn = (instant: DateTime.DateTime, zone: DateTime.TimeZone): LocalDate =>
  LocalDate.make(DateTime.formatIsoDate(DateTime.setZone(instant, zone)))

export class NutritionRepo extends Context.Service<NutritionRepo, NutritionRepoShape>()(
  "@tanren/NutritionRepo",
) {
  /** Needs `LocalStore`, `CurrentUser` and `PlanWeekRepo`. ≤ 5 own SELECTs per call. */
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const store = yield* LocalStore
      const plans = yield* PlanWeekRepo
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
          return Arr.map(datesFrom(first, count), (date) =>
            buildDayTotals({
              date,
              entries: byDate[date] ?? [],
              health: healthOf(date),
              nutrition,
            }),
          )
        })

      const day = (localDate: LocalDate) =>
        Effect.gen(function* () {
          const zone = yield* DateTime.CurrentTimeZone
          const week = yield* daysFrom(LocalDate.make(shiftDate(localDate, -6)), 7, zone)
          const today = Arr.lastNonEmpty(week)
          const hour = DateTime.getPart(DateTime.setZone(yield* DateTime.now, zone), "hour")
          return { day: today, insights: insights({ today, week, hour }) }
        })

      /**
       * Insights for a week (design §5): judged on the current date with the hour now when the
       * week contains it, on Sunday at 23:00 for a past week, and none for a week still ahead.
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
                onNone: () => insights({ today: Arr.lastNonEmpty(days), week: days, hour: 23 }),
                onSome: (today) =>
                  insights({ today, week: days, hour: DateTime.getPart(now, "hour") }),
              },
            )

      const week = (weekStart: LocalDate) =>
        Effect.gen(function* () {
          const zone = yield* DateTime.CurrentTimeZone
          const days = yield* daysFrom(weekStart, 7, zone)
          const { from, to } = rangeOf(weekStart, 7, zone)
          const bounds = [DateTime.formatIso(from), DateTime.formatIso(to)]
          const workoutsDone = yield* store.all({ sql: WORKOUTS, params: bounds }).pipe(
            Effect.flatMap(decodeRecords(CountRow)),
            Effect.map((rows) =>
              Option.getOrElse(
                Option.map(Arr.head(rows), (row) => row.n),
                () => 0,
              ),
            ),
          )
          const activities = yield* store
            .all({ sql: ACTIVITIES, params: bounds })
            .pipe(Effect.flatMap(decodeRecords(ImportedActivityRow)))
          const current = yield* plans.currentWeek
          const workoutsPlanned = Option.match(
            Option.filter(current, (view) => view.week.weekStart === weekStart),
            {
              onNone: () => 0,
              onSome: (view) =>
                Arr.reduce(view.days, view.unscheduled.length, (n, d) => n + d.sessions.length),
            },
          )
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
          return { review, activities }
        })

      return NutritionRepo.of({ day, week })
    }),
  )
}
