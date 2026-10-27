import { describe, expect, it } from "@effect/vitest"
import { IdGenerator, LocalDate, SyncChange } from "@tanren/shared"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import { TestClock } from "effect/testing"
import { LOCAL_USER_ID } from "../store/localUser"
import { seedIfEmpty } from "../store/seed"
import { CurrentUser } from "./CurrentUser"
import { LocalStore } from "./LocalStore"
import { addDays, PlanWeekRepo, type PlanWeekView, weekdayOf } from "./PlanWeekRepo"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"

const TestLayer = PlanWeekRepo.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      LocalStore.layerNoDeps.pipe(
        Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
      ),
      IdGenerator.layerTest,
      CurrentUser.layerTest(Option.none()),
      DateTime.layerCurrentZoneNamed("Europe/Vilnius").pipe(Layer.orDie),
    ),
  ),
)

/** 08:00 UTC = 11:00 in Vilnius on `date`. */
const at = (date: string) => DateTime.toEpochMillis(DateTime.makeUnsafe(`${date}T08:00:00.000Z`))

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const STAMP = "2026-10-13T08:00:00.000Z"
const row = (id: string, deletedAt: string | null = null) => ({
  id,
  userId: LOCAL_USER_ID,
  createdAt: STAMP,
  updatedAt: STAMP,
  deletedAt,
})

const PLAN = uid(1)
const WEEK = uid(2)
const SQUAT = uid(10)
const BENCH = uid(11)
const S_DONE = uid(20)
const S_MISSED = uid(21)
const S_TODAY = uid(22)
const S_LATER_B = uid(23)
const S_LATER_A = uid(24)
const S_ANY = uid(25)
const S_DELETED = uid(26)

const plannedSet = (id: number, session: string, exerciseId: string, order: number) => ({
  table: "plannedSet",
  row: {
    ...row(uid(id)),
    plannedSessionId: session,
    exerciseId,
    order,
    targetWeightKg: 100,
    targetReps: { _tag: "Exact", reps: 5 },
    targetRpe: null,
    restSeconds: 180,
    note: null,
  },
})

const plannedSession = (
  id: string,
  name: string,
  scheduledDate: string | null,
  order: number,
  deletedAt: string | null = null,
) => ({
  table: "plannedSession",
  row: { ...row(id, deletedAt), planWeekId: WEEK, order, name, scheduledDate, notes: null },
})

const workoutSession = (id: number, plannedSessionId: string, deletedAt: string | null) => ({
  table: "session",
  row: {
    ...row(uid(id), deletedAt),
    startedAt: STAMP,
    finishedAt: null,
    plannedSessionId,
    notes: null,
  },
})

/** A Wednesday-start week (ADR-0007): 2026-10-14 … 2026-10-20. */
const wednesdayWeek = (plan: { readonly deletedAt?: string; readonly status?: string } = {}) => [
  ...[
    [SQUAT, "Back Squat"],
    [BENCH, "Bench Press"],
  ].map(([id = "", name]) => ({
    table: "exercise",
    row: { ...row(id), name, aliases: [], muscleGroups: ["quads"], notes: null },
  })),
  {
    table: "plan",
    row: {
      ...row(PLAN, plan.deletedAt ?? null),
      name: "Block 1",
      goal: "Strength",
      startDate: "2026-10-14",
      status: plan.status ?? "active",
    },
  },
  { table: "planWeek", row: { ...row(WEEK), planId: PLAN, weekStart: "2026-10-14", intent: null } },
  plannedSession(S_DONE, "Lower A", "2026-10-14", 0),
  plannedSession(S_MISSED, "Upper A", "2026-10-15", 0),
  plannedSession(S_TODAY, "Lower B", "2026-10-16", 0),
  plannedSession(S_LATER_B, "Upper B2", "2026-10-18", 1),
  plannedSession(S_LATER_A, "Upper B1", "2026-10-18", 0),
  plannedSession(S_ANY, "Conditioning", null, 0),
  plannedSession(S_DELETED, "Dropped", "2026-10-17", 0, STAMP),
  // Superset on today's session: squat, bench, squat; a tombstoned set is ignored.
  plannedSet(30, S_TODAY, SQUAT, 0),
  plannedSet(31, S_TODAY, BENCH, 1),
  plannedSet(32, S_TODAY, SQUAT, 2),
  {
    ...plannedSet(33, S_TODAY, BENCH, 3),
    row: { ...plannedSet(33, S_TODAY, BENCH, 3).row, deletedAt: STAMP },
  },
  plannedSet(34, S_DONE, SQUAT, 0),
  workoutSession(40, S_DONE, null),
  // A tombstoned workout session does not make "Upper A" done.
  workoutSession(41, S_MISSED, STAMP),
]

const write = (wire: ReadonlyArray<unknown>) =>
  Schema.decodeUnknownEffect(Schema.Array(SyncChange))(wire).pipe(
    Effect.orDie,
    Effect.flatMap((changes) => LocalStore.use((store) => store.write(changes, { dirty: false }))),
  )

const currentWeekAt = (date: string) =>
  TestClock.setTime(at(date)).pipe(Effect.andThen(PlanWeekRepo.use((repo) => repo.currentWeek)))

const expectSome = (view: Option.Option<PlanWeekView>) =>
  Option.match(view, {
    onNone: () => Effect.die("expected a current week"),
    onSome: Effect.succeed,
  })

const summary = (view: PlanWeekView) =>
  view.days.map((day) => ({
    date: day.date,
    weekday: day.weekday,
    sessions: day.sessions.map((s) => `${s.plannedSession.name}:${s.status}`),
  }))

describe("LocalDate helpers", () => {
  it("adds days across month and year ends", () => {
    expect(addDays(LocalDate.make("2026-10-31"), 1)).toBe("2026-11-01")
    expect(addDays(LocalDate.make("2026-12-28"), 6)).toBe("2027-01-03")
    expect(addDays(LocalDate.make("2026-03-01"), -1)).toBe("2026-02-28")
    // Across the EU DST change (2026-10-25): calendar days, not 24 h blocks.
    expect(addDays(LocalDate.make("2026-10-24"), 2)).toBe("2026-10-26")
  })

  it("names the weekday", () => {
    expect(weekdayOf(LocalDate.make("2026-10-14"))).toBe("wed")
    expect(weekdayOf(LocalDate.make("2026-10-18"))).toBe("sun")
    expect(weekdayOf(LocalDate.make("2026-10-19"))).toBe("mon")
  })
})

describe("PlanWeekRepo.currentWeek", () => {
  it.effect("is None when there is no plan", () =>
    Effect.gen(function* () {
      expect(Option.isNone(yield* currentWeekAt("2026-10-16"))).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("reads the step-6 demo seed: Monday week, today's session with its blocks", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(at("2026-10-20"))
      yield* seedIfEmpty
      const view = yield* expectSome(yield* currentWeekAt("2026-10-20"))
      expect(view.days).toHaveLength(7)
      expect(view.days[0]?.date).toBe("2026-10-19")
      expect(view.days[0]?.weekday).toBe("mon")
      const today = view.days[1]?.sessions[0]
      expect(today?.plannedSession.name).toBe("Full body A")
      expect(today?.status).toBe("today")
      expect(today?.blocks.map((b) => [b.exercise.name, b.sets.length])).toEqual([
        ["Back Squat", 3],
        ["Bench Press", 3],
        ["Barbell Row", 3],
        ["Overhead Press", 2],
      ])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("lays out a Wednesday-start week with done / missed / today / upcoming", () =>
    Effect.gen(function* () {
      yield* write(wednesdayWeek())
      const view = yield* expectSome(yield* currentWeekAt("2026-10-16"))
      expect(view.plan.name).toBe("Block 1")
      expect(view.days[0]?.date).toBe(view.week.weekStart)
      expect(summary(view)).toEqual([
        { date: "2026-10-14", weekday: "wed", sessions: ["Lower A:done"] },
        { date: "2026-10-15", weekday: "thu", sessions: ["Upper A:missed"] },
        { date: "2026-10-16", weekday: "fri", sessions: ["Lower B:today"] },
        { date: "2026-10-17", weekday: "sat", sessions: [] },
        {
          date: "2026-10-18",
          weekday: "sun",
          sessions: ["Upper B1:upcoming", "Upper B2:upcoming"],
        },
        { date: "2026-10-19", weekday: "mon", sessions: [] },
        { date: "2026-10-20", weekday: "tue", sessions: [] },
      ])
      expect(view.unscheduled.map((s) => `${s.plannedSession.name}:${s.status}`)).toEqual([
        "Conditioning:upcoming",
      ])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("groups planned sets into exercise blocks by first appearance (DM §11.2)", () =>
    Effect.gen(function* () {
      yield* write(wednesdayWeek())
      const view = yield* expectSome(yield* currentWeekAt("2026-10-16"))
      const blocks = view.days[2]?.sessions[0]?.blocks ?? []
      expect(blocks.map((b) => [b.exercise.name, b.sets.map((s) => s.order)])).toEqual([
        ["Back Squat", [0, 2]],
        ["Bench Press", [1]],
      ])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("covers weekStart through weekStart + 6 and nothing outside", () =>
    Effect.gen(function* () {
      yield* write(wednesdayWeek())
      expect(Option.isNone(yield* currentWeekAt("2026-10-13"))).toBe(true)
      expect(Option.isSome(yield* currentWeekAt("2026-10-14"))).toBe(true)
      const lastDay = yield* expectSome(yield* currentWeekAt("2026-10-20"))
      expect(lastDay.days[1]?.sessions[0]?.status).toBe("missed")
      expect(Option.isNone(yield* currentWeekAt("2026-10-21"))).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("ignores a tombstoned plan", () =>
    Effect.gen(function* () {
      yield* write(wednesdayWeek({ deletedAt: STAMP }))
      expect(Option.isNone(yield* currentWeekAt("2026-10-16"))).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("ignores an archived plan", () =>
    Effect.gen(function* () {
      yield* write(wednesdayWeek({ status: "archived" }))
      expect(Option.isNone(yield* currentWeekAt("2026-10-16"))).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )
})

const workoutSet = (
  id: number,
  sessionId: string,
  weightKg: number,
  reps: number,
  deletedAt: string | null = null,
) => ({
  table: "set",
  row: {
    ...row(uid(id), deletedAt),
    sessionId,
    exerciseId: SQUAT,
    order: 0,
    weightKg,
    reps,
    rpe: null,
    note: null,
    plannedSetId: null,
    loggedAt: STAMP,
  },
})

const loggedOf = (view: PlanWeekView) =>
  Object.fromEntries(
    [...view.days.flatMap((day) => day.sessions), ...view.unscheduled].map((s) => [
      s.plannedSession.name,
      s.logged,
    ]),
  )

describe("PlanWeekRepo logged totals", () => {
  it.effect(
    "sums live sets of live linked sessions: 2 x 100 x 5 + bodyweight 10 = 3 sets, 1000 kg",
    () =>
      Effect.gen(function* () {
        yield* write([
          ...wednesdayWeek(),
          workoutSet(50, uid(40), 100, 5),
          workoutSet(51, uid(40), 100, 5),
          workoutSet(52, uid(40), 0, 10),
          // A soft-deleted set, and a set of the tombstoned workout session, do not count.
          workoutSet(53, uid(40), 200, 5, STAMP),
          workoutSet(54, uid(41), 60, 8),
        ])
        const view = yield* expectSome(yield* currentWeekAt("2026-10-16"))
        expect(loggedOf(view)).toEqual({
          "Lower A": { sets: 3, volumeKg: 1000 },
          "Upper A": { sets: 0, volumeKg: 0 },
          "Lower B": { sets: 0, volumeKg: 0 },
          "Upper B1": { sets: 0, volumeKg: 0 },
          "Upper B2": { sets: 0, volumeKg: 0 },
          Conditioning: { sets: 0, volumeKg: 0 },
        })
      }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("is 0 sets and 0 kg for every session of a week with nothing logged", () =>
    Effect.gen(function* () {
      yield* write(wednesdayWeek())
      const view = yield* expectSome(yield* currentWeekAt("2026-10-16"))
      expect(Object.values(loggedOf(view)).every((l) => l.sets === 0 && l.volumeKg === 0)).toBe(
        true,
      )
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("PlanWeekRepo year boundary", () => {
  it.effect("a Sunday weekStart in December covers 6 days into January, 7th day is outside", () =>
    Effect.gen(function* () {
      yield* write([
        {
          table: "plan",
          row: {
            ...row(PLAN),
            name: "Block 2",
            goal: "Strength",
            startDate: "2026-12-27",
            status: "active",
          },
        },
        {
          table: "planWeek",
          row: { ...row(WEEK), planId: PLAN, weekStart: "2026-12-27", intent: null },
        },
        plannedSession(S_TODAY, "New Year", "2027-01-02", 0),
      ])
      const view = yield* expectSome(yield* currentWeekAt("2027-01-02"))
      expect(view.days.map((d) => `${d.date}:${d.weekday}`)).toEqual([
        "2026-12-27:sun",
        "2026-12-28:mon",
        "2026-12-29:tue",
        "2026-12-30:wed",
        "2026-12-31:thu",
        "2027-01-01:fri",
        "2027-01-02:sat",
      ])
      expect(view.days[6]?.sessions.map((s) => s.status)).toEqual(["today"])
      expect(Option.isNone(yield* currentWeekAt("2027-01-03"))).toBe(true)
      expect(Option.isSome(yield* currentWeekAt("2026-12-27"))).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )
})
