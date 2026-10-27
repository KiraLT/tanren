import { describe, expect, it } from "@effect/vitest"
import { FoodEntryRepo, GarminImportRepo } from "@tanren/db"
import {
  DailyHealth,
  DailyHealthId,
  FoodEntryId,
  IdGenerator,
  LocalDate,
  LogFoodInput,
  type NutritionProfile,
  OrderIndex,
  PlannedSession,
  PlannedSessionId,
  Profile,
  Session,
  TimeZone,
  UpdateProfileInput,
  type UserId,
} from "@tanren/shared"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import { TestClock } from "effect/testing"
import { PlanRepo, ProfileRepo, Repositories, SessionRepo } from "../repos"
import { at, plan, session, userA, week } from "../sync/fixtures"
import { deleteFoodEntry, getNutritionDay, getWeekReview, logFood } from "./nutritionTools"
import { updateProfile } from "./writeTools"

// Thursday 2026-10-29, 12:00 in Vilnius (EET, UTC+2).
const NOW = at("2026-10-29T10:00:00.000Z")
const ZONE = "Europe/Vilnius"
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`
const day = (s: string) => LocalDate.make(s)

/** 85 kg / 180 cm / 1990 / male / moderate / gain → 3,070 kcal, 155 g (N-F0 pin). */
const GAIN: NutritionProfile = {
  goal: "gain_muscle",
  bodyWeightKg: 85,
  heightCm: Option.some(180),
  birthYear: Option.some(1990),
  sex: Option.some("male"),
  activityLevel: "moderate",
  eatBackActive: false,
  kcalTarget: Option.none(),
  proteinTargetG: Option.none(),
}

const profileWith = (nutrition: Option.Option<NutritionProfile>, userId: UserId = userA) =>
  Profile.make({
    id: userId,
    userId,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: Option.none(),
    goals: [],
    constraints: [],
    availableDays: [],
    locations: [],
    activeLocationId: Option.none(),
    timezone: TimeZone.make(ZONE),
    nutrition,
  })

const health = (date: string, fields: { total: number; active: number }) =>
  DailyHealth.make({
    id: DailyHealthId.make(id(0x900 + Number(date.slice(8, 10)))),
    userId: userA,
    createdAt: NOW,
    updatedAt: at("2026-10-29T09:15:00.000Z"),
    deletedAt: Option.none(),
    provider: "garmin",
    date: day(date),
    totalCalories: Option.some(fields.total),
    activeCalories: Option.some(fields.active),
    steps: Option.some(9000),
    restingHeartRate: Option.none(),
  })

/** A read-only `GarminImportRepo` over fixed day rows (the tools only call `listDays`). */
const garminWith = (rows: ReadonlyArray<DailyHealth>) =>
  Layer.succeed(
    GarminImportRepo,
    GarminImportRepo.of({
      upsertActivities: () => Effect.die("unused"),
      upsertDays: () => Effect.die("unused"),
      softDeleteAll: () => Effect.die("unused"),
      counts: () => Effect.die("unused"),
      listActivities: () => Effect.die("unused"),
      listDays: (_userId, from, to) =>
        Effect.succeed(rows.filter((row) => row.date >= from && row.date <= to)),
    }),
  )

const layerWith = (rows: ReadonlyArray<DailyHealth> = []) =>
  Layer.mergeAll(Repositories.layerMemory, IdGenerator.layerTest, garminWith(rows))

const meal = (kcal: number, proteinG: number, loggedAt?: string) =>
  Schema.decodeUnknownSync(LogFoodInput)({
    ...(loggedAt === undefined ? {} : { loggedAt }),
    meal: "lunch",
    items: [
      {
        name: "Chicken rice bowl",
        portion: "1 bowl, ~400 g",
        grams: 400,
        kcal,
        proteinG,
        carbsG: 60,
        fatG: 12,
        fibreG: null,
        confidence: 0.6,
      },
    ],
  })

const setup = (nutrition: Option.Option<NutritionProfile>) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(DateTime.toEpochMillis(NOW))
    yield* (yield* ProfileRepo).put(userA, [profileWith(nutrition)])
  })

describe("log_food", () => {
  it.effect("stores an mcp entry with totalsOf(items) and returns the day's totals", () =>
    Effect.gen(function* () {
      yield* setup(Option.some(GAIN))
      const { entry, day: totals } = yield* logFood.run(userA, meal(650, 45))
      expect([entry.source, entry.kcal, entry.proteinG, entry.carbsG, entry.fatG]).toEqual([
        "mcp",
        650,
        45,
        60,
        12,
      ])
      expect(entry.loggedAt).toEqual(NOW)
      expect(totals.date).toBe("2026-10-29")
      expect(totals.eaten.kcal).toBe(650)
      expect(totals.entries.map((e) => e.id)).toEqual([entry.id])
      expect(totals.budgetKcal).toEqual(Option.some(3070))
      expect(totals.kcalLeft).toEqual(Option.some(3070 - 650))
      expect(totals.proteinLeftG).toEqual(Option.some(155 - 45))
    }).pipe(Effect.provide(layerWith())),
  )

  it.effect("an entry at 23:30 local lands on that local day, not the UTC one", () =>
    Effect.gen(function* () {
      yield* setup(Option.some(GAIN))
      // 23:30 in Vilnius on the 28th is 21:30Z on the 28th; 00:30 local on the 29th is 22:30Z on the 28th.
      const late = yield* logFood.run(userA, meal(300, 20, "2026-10-28T21:30:00.000Z"))
      const early = yield* logFood.run(userA, meal(200, 10, "2026-10-28T22:30:00.000Z"))
      expect(late.day.date).toBe("2026-10-28")
      expect(late.day.eaten.kcal).toBe(300)
      expect(early.day.date).toBe("2026-10-29")
      expect(early.day.eaten.kcal).toBe(200)
    }).pipe(Effect.provide(layerWith())),
  )
})

describe("get_nutrition_day", () => {
  it.effect("no Garmin row: burned is None and kcalLeft is still Some", () =>
    Effect.gen(function* () {
      yield* setup(Option.some(GAIN))
      yield* logFood.run(userA, meal(500, 30))
      const totals = yield* getNutritionDay.run(userA, {})
      expect([totals.burned, totals.activeBurned, totals.burnedAsOf]).toEqual([
        Option.none(),
        Option.none(),
        Option.none(),
      ])
      expect(totals.kcalLeft).toEqual(Option.some(2570))
    }).pipe(Effect.provide(layerWith())),
  )

  it.effect("Garmin totalCalories is information only: it never changes budgetKcal", () =>
    Effect.gen(function* () {
      yield* setup(Option.some(GAIN))
      const totals = yield* getNutritionDay.run(userA, { date: day("2026-10-29") })
      expect(totals.burned).toEqual(Option.some(2900))
      expect(totals.burnedAsOf).toEqual(Option.some(at("2026-10-29T09:15:00.000Z")))
      expect(totals.budgetKcal).toEqual(Option.some(3070))
    }).pipe(Effect.provide(layerWith([health("2026-10-29", { total: 2900, active: 400 })]))),
  )

  it.effect("eatBackActive adds the active calories to the budget", () =>
    Effect.gen(function* () {
      yield* setup(Option.some({ ...GAIN, eatBackActive: true }))
      const totals = yield* getNutritionDay.run(userA, {})
      expect(totals.budgetKcal).toEqual(Option.some(3070 + 400))
      expect(totals.kcalLeft).toEqual(Option.some(3470))
    }).pipe(Effect.provide(layerWith([health("2026-10-29", { total: 2900, active: 400 })]))),
  )

  it.effect("eatBackActive with zero active calories adds nothing (floored at 0)", () =>
    Effect.gen(function* () {
      yield* setup(Option.some({ ...GAIN, eatBackActive: true }))
      const totals = yield* getNutritionDay.run(userA, {})
      expect(totals.budgetKcal).toEqual(Option.some(3070))
    }).pipe(Effect.provide(layerWith([health("2026-10-29", { total: 2100, active: 0 })]))),
  )

  it.effect("no nutrition goal: targets, budgetKcal and kcalLeft are None", () =>
    Effect.gen(function* () {
      yield* setup(Option.none())
      yield* logFood.run(userA, meal(500, 30))
      const totals = yield* getNutritionDay.run(userA, {})
      expect(totals.eaten.kcal).toBe(500)
      expect([totals.targets, totals.budgetKcal, totals.kcalLeft, totals.proteinLeftG]).toEqual([
        Option.none(),
        Option.none(),
        Option.none(),
        Option.none(),
      ])
    }).pipe(Effect.provide(layerWith())),
  )

  it.effect("no profile: the day is the UTC day and there are no targets", () =>
    Effect.gen(function* () {
      // 23:00Z on the 29th is already the 30th in Vilnius, but without a profile the zone is UTC.
      yield* TestClock.setTime(DateTime.toEpochMillis(at("2026-10-29T23:00:00.000Z")))
      const totals = yield* getNutritionDay.run(userA, {})
      expect(totals.date).toBe("2026-10-29")
      expect(totals.targets).toEqual(Option.none())
    }).pipe(Effect.provide(layerWith())),
  )
})

describe("get_week_review", () => {
  const plannedSession = (n: number) =>
    PlannedSession.make({
      id: PlannedSessionId.make(id(0x500 + n)),
      userId: userA,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: Option.none(),
      planWeekId: week(0x401, 0x400, "2026-10-26").id,
      order: OrderIndex.make(n),
      name: `Day ${n}`,
      scheduledDate: Option.none(),
      notes: Option.none(),
    })
  const finished = (n: number, startedAt: string, done: boolean) =>
    Session.make({
      ...session(n, at(startedAt)),
      finishedAt: done ? Option.some(DateTime.add(at(startedAt), { hours: 1 })) : Option.none(),
    })

  it.effect("a Thursday weekStart reviews Mon–Sun with workouts done vs planned", () =>
    Effect.gen(function* () {
      yield* setup(Option.some(GAIN))
      const plans = yield* PlanRepo
      yield* plans.putPlans(userA, [plan(0x400)])
      yield* plans.putPlanWeeks(userA, [week(0x401, 0x400, "2026-10-26")])
      yield* plans.putPlannedSessions(userA, [
        plannedSession(0),
        plannedSession(1),
        plannedSession(2),
      ])
      yield* (yield* SessionRepo).putSessions(userA, [
        finished(0x601, "2026-10-26T07:00:00.000Z", true),
        finished(0x602, "2026-10-28T07:00:00.000Z", true),
        finished(0x603, "2026-10-29T07:00:00.000Z", false), // not finished
        finished(0x604, "2026-10-25T07:00:00.000Z", true), // previous week
      ])
      yield* logFood.run(userA, meal(3000, 160, "2026-10-26T12:00:00.000Z"))
      yield* logFood.run(userA, meal(2000, 100, "2026-10-27T12:00:00.000Z"))
      const review = yield* getWeekReview.run(userA, { weekStart: day("2026-10-29") })
      expect(review.weekStart).toBe("2026-10-26")
      expect(review.days.map((d) => d.date)).toEqual([
        "2026-10-26",
        "2026-10-27",
        "2026-10-28",
        "2026-10-29",
        "2026-10-30",
        "2026-10-31",
        "2026-11-01",
      ])
      expect([review.workoutsDone, review.workoutsPlanned]).toEqual([2, 3])
      expect([review.eatenKcal, review.daysLogged, review.proteinAvgG]).toEqual([5000, 2, 130])
      expect([review.daysOnKcalTarget, review.daysOnProteinTarget]).toEqual([1, 1])
      expect(review.burnedKcal).toEqual(Option.some(2900))
      expect([review.daysWithBurn, review.netKcal]).toEqual([1, Option.some(-2900)])
    }).pipe(Effect.provide(layerWith([health("2026-10-29", { total: 2900, active: 400 })]))),
  )

  it.effect("defaults to this week and plans 0 without an active plan", () =>
    Effect.gen(function* () {
      yield* setup(Option.some(GAIN))
      const review = yield* getWeekReview.run(userA, {})
      expect(review.weekStart).toBe("2026-10-26")
      expect([review.workoutsDone, review.workoutsPlanned]).toEqual([0, 0])
      // 12:00 local today, nothing logged: the shared `insights` fire `nothing_logged`.
      expect(review.insights.map((i) => i.rule)).toContain("nothing_logged")
    }).pipe(Effect.provide(layerWith())),
  )
})

describe("delete_food_entry", () => {
  it.effect("deletes once; a second delete (or an unknown id) is deleted false", () =>
    Effect.gen(function* () {
      yield* setup(Option.some(GAIN))
      const { entry } = yield* logFood.run(userA, meal(500, 30))
      expect(yield* deleteFoodEntry.run(userA, { id: entry.id })).toEqual({ deleted: true })
      expect(yield* deleteFoodEntry.run(userA, { id: entry.id })).toEqual({ deleted: false })
      expect(yield* deleteFoodEntry.run(userA, { id: FoodEntryId.make(id(0xdead)) })).toEqual({
        deleted: false,
      })
      expect(
        yield* (yield* FoodEntryRepo).listRange(userA, {
          from: at("2026-10-28T00:00:00.000Z"),
          to: at("2026-10-30T00:00:00.000Z"),
        }),
      ).toEqual([])
    }).pipe(Effect.provide(layerWith())),
  )
})

describe("update_profile nutrition", () => {
  const minimal = { goal: "lose_weight", bodyWeightKg: 80, activityLevel: "light" }

  it.effect("accepts nutrition with only goal, bodyWeightKg and activityLevel", () =>
    Effect.gen(function* () {
      yield* setup(Option.none())
      const input = yield* Schema.decodeUnknownEffect(UpdateProfileInput)({ nutrition: minimal })
      yield* updateProfile.run(userA, input)
    }).pipe(Effect.provide(layerWith())),
  )

  it.effect("sets nutrition, keeps it on an unrelated patch, and null clears it", () =>
    Effect.gen(function* () {
      yield* setup(Option.none())
      const decode = Schema.decodeUnknownSync(UpdateProfileInput)
      const set = yield* updateProfile.run(
        userA,
        decode({
          nutrition: {
            ...minimal,
            heightCm: null,
            birthYear: null,
            sex: null,
            kcalTarget: null,
            proteinTargetG: null,
          },
        }),
      )
      expect(Option.map(set.nutrition, (n) => [n.goal, n.bodyWeightKg, n.eatBackActive])).toEqual(
        Option.some(["lose_weight", 80, false]),
      )
      const kept = yield* updateProfile.run(userA, decode({ constraints: ["left knee"] }))
      expect(Option.isSome(kept.nutrition)).toBe(true)
      const cleared = yield* updateProfile.run(userA, decode({ nutrition: null }))
      expect(cleared.nutrition).toEqual(Option.none())
      const stored = yield* (yield* ProfileRepo).get(userA)
      expect(Option.flatMap(stored, (p) => p.nutrition)).toEqual(Option.none())
    }).pipe(Effect.provide(layerWith())),
  )
})
