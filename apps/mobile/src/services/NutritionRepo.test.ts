import { describe, expect, it } from "@effect/vitest"
import { IdGenerator, LocalDate, type NutritionProfile, SyncChange } from "@tanren/shared"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import { TestClock } from "effect/testing"
import { LOCAL_USER_ID } from "../store/localUser"
import { CurrentUser } from "./CurrentUser"
import { FoodEntryRepo } from "./FoodEntryRepo"
import { LocalStore } from "./LocalStore"
import { NutritionRepo } from "./NutritionRepo"
import { PlanWeekRepo } from "./PlanWeekRepo"
import { ProfileRepo } from "./ProfileRepo"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"

/** Europe/Vilnius is UTC+2 on these dates (DST ended 2026-10-25). */
const TestLayer = Layer.mergeAll(
  NutritionRepo.layer.pipe(Layer.provide(PlanWeekRepo.layer)),
  FoodEntryRepo.layer,
  ProfileRepo.layer,
).pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      LocalStore.layerNoDeps.pipe(
        Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
      ),
      CurrentUser.layerTest(Option.none()),
      IdGenerator.layerTest,
      DateTime.layerCurrentZoneNamed("Europe/Vilnius").pipe(Layer.orDie),
    ),
  ),
)

const DATE = LocalDate.make("2026-10-27")

/** 85 kg / 180 cm / born 1990, male, moderate, gain → 3,070 kcal and 155 g (N-F0 pin). */
const nutrition = (eatBackActive: boolean): NutritionProfile => ({
  goal: "gain_muscle",
  bodyWeightKg: 85,
  heightCm: Option.some(180),
  birthYear: Option.some(1990),
  sex: Option.some("male"),
  activityLevel: "moderate",
  eatBackActive,
  kcalTarget: Option.none(),
  proteinTargetG: Option.none(),
})

const setNutrition = (profile: Option.Option<NutritionProfile>) =>
  ProfileRepo.use((repo) => repo.save({ nutrition: profile }))

const eat = (loggedAt: string, kcal: number, proteinG: number) =>
  FoodEntryRepo.use((repo) =>
    repo.insert({
      loggedAt: DateTime.makeUnsafe(loggedAt),
      meal: "snack",
      source: "manual",
      items: [
        {
          name: "Food",
          portion: "1 serving",
          grams: Option.none(),
          kcal,
          proteinG,
          carbsG: 0,
          fatG: 0,
          fibreG: Option.none(),
          confidence: Option.none(),
        },
      ],
      note: Option.none(),
    }),
  )

const health = (
  n: number,
  date: string,
  values: { readonly total: number | null; readonly active: number | null },
  deletedAt: string | null = null,
) =>
  Schema.decodeUnknownEffect(Schema.Array(SyncChange))([
    {
      table: "dailyHealth",
      row: {
        id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        userId: LOCAL_USER_ID,
        createdAt: "2026-10-27T06:00:00.000Z",
        updatedAt: "2026-10-27T06:00:00.000Z",
        deletedAt,
        provider: "garmin",
        date,
        totalCalories: values.total,
        activeCalories: values.active,
        steps: 8000,
        restingHeartRate: 52,
      },
    },
  ]).pipe(
    Effect.orDie,
    Effect.flatMap((changes) => LocalStore.use((store) => store.write(changes, { dirty: false }))),
  )

const day = (date: LocalDate) => NutritionRepo.use((repo) => repo.day(date))

/** 14:00 local: `nothing_logged` applies (hour ≥ 12), the evening rules do not. */
const atTwoPm = TestClock.setTime(Date.UTC(2026, 9, 27, 12))

describe("NutritionRepo.day", () => {
  it.effect("sums the day's two entries and keeps them in loggedAt order", () =>
    Effect.gen(function* () {
      yield* atTwoPm
      yield* setNutrition(Option.some(nutrition(false)))
      const lunch = yield* eat("2026-10-27T10:00:00.000Z", 700, 40)
      const breakfast = yield* eat("2026-10-27T06:00:00.000Z", 500, 30)
      const { day: totals } = yield* day(DATE)
      expect(totals.entries.map((entry) => entry.id)).toEqual([breakfast.id, lunch.id])
      expect([totals.eaten.kcal, totals.eaten.proteinG]).toEqual([1200, 70])
      expect(totals.targets).toEqual(
        Option.some({ kcal: 3070, proteinG: 155, goal: "gain_muscle" }),
      )
      expect(totals.proteinLeftG).toEqual(Option.some(85))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("has no burn without a daily_health row but still a kcalLeft", () =>
    Effect.gen(function* () {
      yield* atTwoPm
      yield* setNutrition(Option.some(nutrition(false)))
      yield* eat("2026-10-27T10:00:00.000Z", 700, 40)
      const { day: totals } = yield* day(DATE)
      expect([totals.burned, totals.activeBurned, totals.steps, totals.burnedAsOf]).toEqual([
        Option.none(),
        Option.none(),
        Option.none(),
        Option.none(),
      ])
      expect(totals.kcalLeft).toEqual(Option.some(2370))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("ignores activeBurned with eat-back off", () =>
    Effect.gen(function* () {
      yield* atTwoPm
      yield* setNutrition(Option.some(nutrition(false)))
      yield* health(1, "2026-10-27", { total: 2600, active: 400 })
      const { day: totals } = yield* day(DATE)
      expect([totals.burned, totals.activeBurned]).toEqual([Option.some(2600), Option.some(400)])
      expect(totals.budgetKcal).toEqual(Option.some(3070))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("adds activeBurned to the budget with eat-back on", () =>
    Effect.gen(function* () {
      yield* atTwoPm
      yield* setNutrition(Option.some(nutrition(true)))
      yield* health(1, "2026-10-27", { total: 2600, active: 400 })
      const { day: totals } = yield* day(DATE)
      expect([totals.budgetKcal, totals.kcalLeft]).toEqual([Option.some(3470), Option.some(3470)])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("adds 0 with eat-back on when the day has no active calories", () =>
    Effect.gen(function* () {
      yield* atTwoPm
      yield* setNutrition(Option.some(nutrition(true)))
      yield* health(1, "2026-10-27", { total: 2600, active: null })
      const { day: totals } = yield* day(DATE)
      expect(totals.budgetKcal).toEqual(Option.some(3070))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("has no targets, budget or kcalLeft without a nutrition profile", () =>
    Effect.gen(function* () {
      yield* atTwoPm
      yield* setNutrition(Option.none())
      const result = yield* day(DATE)
      expect([result.day.targets, result.day.budgetKcal, result.day.kcalLeft]).toEqual([
        Option.none(),
        Option.none(),
        Option.none(),
      ])
      expect(result.insights.map((insight) => insight.rule)).toEqual(["nothing_logged"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("puts an entry at 23:30 local on that local date, not the next", () =>
    Effect.gen(function* () {
      yield* atTwoPm
      // 23:30 in Vilnius on the 27th is 21:30 UTC; 00:30 on the 28th is 22:30 UTC.
      const late = yield* eat("2026-10-27T21:30:00.000Z", 300, 10)
      const nextDay = yield* eat("2026-10-27T22:30:00.000Z", 200, 5)
      const today = yield* day(DATE)
      const tomorrow = yield* day(LocalDate.make("2026-10-28"))
      expect(today.day.entries.map((entry) => entry.id)).toEqual([late.id])
      expect(tomorrow.day.entries.map((entry) => entry.id)).toEqual([nextDay.id])
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("NutritionRepo.week", () => {
  it.effect("reviews seven days, counts logged days and nets kcal only over days with burn", () =>
    Effect.gen(function* () {
      yield* atTwoPm
      yield* setNutrition(Option.some(nutrition(false)))
      yield* eat("2026-10-26T08:00:00.000Z", 1800, 100)
      yield* eat("2026-10-28T08:00:00.000Z", 2100, 120)
      yield* health(1, "2026-10-26", { total: 2500, active: 300 })
      yield* health(2, "2026-10-28", { total: null, active: null })
      const { review, activities } = yield* NutritionRepo.use((repo) =>
        repo.week(LocalDate.make("2026-10-26")),
      )
      expect(review.days.map((d) => d.date)).toEqual([
        "2026-10-26",
        "2026-10-27",
        "2026-10-28",
        "2026-10-29",
        "2026-10-30",
        "2026-10-31",
        "2026-11-01",
      ])
      expect({
        daysLogged: review.daysLogged,
        eatenKcal: review.eatenKcal,
        daysWithBurn: review.daysWithBurn,
        burnedKcal: review.burnedKcal,
        netKcal: review.netKcal,
        proteinAvgG: review.proteinAvgG,
        workoutsDone: review.workoutsDone,
        workoutsPlanned: review.workoutsPlanned,
      }).toEqual({
        daysLogged: 2,
        eatenKcal: 3900,
        daysWithBurn: 1,
        burnedKcal: Option.some(2500),
        netKcal: Option.some(-700),
        proteinAvgG: 110,
        workoutsDone: 0,
        workoutsPlanned: 0,
      })
      expect(activities).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("returns the week's daily_health rows, one per date, Monday first", () =>
    Effect.gen(function* () {
      yield* atTwoPm
      yield* health(1, "2026-10-28", { total: 2500, active: 300 })
      yield* health(2, "2026-10-26", { total: null, active: null })
      yield* health(3, "2026-11-02", { total: 2000, active: 100 })
      const { health: rows } = yield* NutritionRepo.use((repo) =>
        repo.week(LocalDate.make("2026-10-26")),
      )
      expect(rows.map((row) => row.date)).toEqual(["2026-10-26", "2026-10-28"])
    }).pipe(Effect.provide(TestLayer)),
  )
})

const syncRow = (n: number, deletedAt: string | null = null) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  userId: LOCAL_USER_ID,
  createdAt: "2026-10-27T06:00:00.000Z",
  updatedAt: "2026-10-27T06:00:00.000Z",
  deletedAt,
})

const activity = (n: number, startedAt: string, deletedAt: string | null = null) => ({
  table: "importedActivity",
  row: {
    ...syncRow(n, deletedAt),
    provider: "garmin",
    externalId: `g-${n}`,
    sport: "running",
    title: "Run",
    startedAt,
    durationSeconds: 1800,
    distanceMeters: 5000,
    calories: 300,
    avgHeartRate: null,
    maxHeartRate: null,
  },
})

const workout = (
  n: number,
  startedAt: string,
  finishedAt: string | null,
  deletedAt: string | null = null,
) => ({
  table: "session",
  row: { ...syncRow(n, deletedAt), startedAt, finishedAt, plannedSessionId: null, notes: null },
})

const writeWire = (wire: ReadonlyArray<unknown>) =>
  Schema.decodeUnknownEffect(Schema.Array(SyncChange))(wire).pipe(
    Effect.orDie,
    Effect.flatMap((changes) => LocalStore.use((store) => store.write(changes, { dirty: false }))),
  )

describe("NutritionRepo.week activities and workouts", () => {
  it.effect("lists the week's live activities newest first and counts finished workouts", () =>
    Effect.gen(function* () {
      yield* atTwoPm
      yield* writeWire([
        activity(11, "2026-10-26T06:00:00.000Z"),
        activity(12, "2026-10-29T06:00:00.000Z"),
        activity(13, "2026-10-28T06:00:00.000Z", "2026-10-28T07:00:00.000Z"),
        activity(14, "2026-11-02T06:00:00.000Z"),
        workout(21, "2026-10-27T08:00:00.000Z", "2026-10-27T09:00:00.000Z"),
        workout(22, "2026-10-28T08:00:00.000Z", null),
        workout(23, "2026-10-25T08:00:00.000Z", "2026-10-25T09:00:00.000Z"),
      ])
      const { review, activities } = yield* NutritionRepo.use((repo) =>
        repo.week(LocalDate.make("2026-10-26")),
      )
      expect(activities.map((a) => a.externalId)).toEqual(["g-12", "g-11"])
      expect(review.workoutsDone).toBe(1)
    }).pipe(Effect.provide(TestLayer)),
  )
})

const healthTomb = (n: number, date: string) => ({
  table: "dailyHealth",
  row: {
    ...syncRow(n, "2026-10-27T07:00:00.000Z"),
    provider: "garmin",
    date,
    totalCalories: 9000,
    activeCalories: 5000,
    steps: 1,
    restingHeartRate: 40,
  },
})

describe("NutritionRepo tombstones", () => {
  it.effect("leaves deleted food, health and workout rows out of the totals", () =>
    Effect.gen(function* () {
      yield* atTwoPm
      yield* setNutrition(Option.some(nutrition(true)))
      const gone = yield* eat("2026-10-27T08:00:00.000Z", 900, 50)
      yield* FoodEntryRepo.use((repo) => repo.softDelete(gone.id))
      yield* writeWire([
        healthTomb(31, "2026-10-27"),
        workout(
          32,
          "2026-10-27T08:00:00.000Z",
          "2026-10-27T09:00:00.000Z",
          "2026-10-27T10:00:00.000Z",
        ),
      ])
      const { day: totals } = yield* day(DATE)
      expect([totals.entries.length, totals.eaten.kcal, totals.burned, totals.budgetKcal]).toEqual([
        0,
        0,
        Option.none(),
        Option.some(3070),
      ])
      const { review } = yield* NutritionRepo.use((repo) => repo.week(LocalDate.make("2026-10-26")))
      expect([review.daysLogged, review.daysWithBurn, review.workoutsDone]).toEqual([0, 0, 0])
    }).pipe(Effect.provide(TestLayer)),
  )
})

/** An active plan whose week starts on Monday 2026-10-26: 2 dated + 1 unscheduled live sessions. */
const PLAN_ID = 41
const WEEK_ID = 42
const planned = (n: number, scheduledDate: string | null, deletedAt: string | null = null) => ({
  table: "plannedSession",
  row: {
    ...syncRow(n, deletedAt),
    planWeekId: syncRow(WEEK_ID).id,
    order: 0,
    name: `Session ${n}`,
    scheduledDate,
    notes: null,
  },
})
const mondayPlan = [
  {
    table: "plan",
    row: {
      ...syncRow(PLAN_ID),
      name: "Block",
      goal: "Strength",
      startDate: "2026-10-26",
      status: "active",
    },
  },
  {
    table: "planWeek",
    row: {
      ...syncRow(WEEK_ID),
      planId: syncRow(PLAN_ID).id,
      weekStart: "2026-10-26",
      intent: null,
    },
  },
  planned(43, "2026-10-26"),
  planned(44, "2026-10-29"),
  planned(45, null),
  planned(46, "2026-10-30", "2026-10-27T07:00:00.000Z"),
]

describe("NutritionRepo.week plan and insights", () => {
  it.effect("counts the current plan week's dated and unscheduled live sessions", () =>
    Effect.gen(function* () {
      yield* atTwoPm
      yield* writeWire(mondayPlan)
      const { review } = yield* NutritionRepo.use((repo) => repo.week(LocalDate.make("2026-10-26")))
      expect(review.workoutsPlanned).toBe(3)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("plans nothing and judges nothing for a week entirely after today", () =>
    Effect.gen(function* () {
      yield* atTwoPm
      yield* setNutrition(Option.some(nutrition(false)))
      yield* writeWire(mondayPlan)
      const current = yield* NutritionRepo.use((repo) => repo.week(LocalDate.make("2026-10-26")))
      const ahead = yield* NutritionRepo.use((repo) => repo.week(LocalDate.make("2026-11-02")))
      expect(current.review.insights.map((insight) => insight.rule)).toEqual(["nothing_logged"])
      expect([ahead.review.insights, ahead.review.workoutsPlanned]).toEqual([[], 0])
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("NutritionRepo.hasDailyHealth", () => {
  const hasDailyHealth = NutritionRepo.use((repo) => repo.hasDailyHealth)

  it.effect("is false on a store with no daily_health row", () =>
    Effect.gen(function* () {
      expect(yield* hasDailyHealth).toBe(false)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("is true once any live daily_health row exists, whatever its date", () =>
    Effect.gen(function* () {
      yield* health(901, "2026-09-01", { total: 2100, active: 300 })
      expect(yield* hasDailyHealth).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("ignores a tombstoned daily_health row (tracker disconnected)", () =>
    Effect.gen(function* () {
      yield* health(902, "2026-09-01", { total: 2100, active: 300 }, "2026-10-01T00:00:00.000Z")
      expect(yield* hasDailyHealth).toBe(false)
    }).pipe(Effect.provide(TestLayer)),
  )
})
