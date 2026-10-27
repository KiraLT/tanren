import { describe, expect, it } from "@effect/vitest"
import {
  IdGenerator,
  LogSessionInput,
  MCP_TOOLS,
  Profile,
  Session,
  type SyncTable,
  UpdateProfileInput,
  type UserId,
  WritePlanWeekInput,
} from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Layer, Option, Schema } from "effect"
import { TestClock } from "effect/testing"
import {
  ExerciseRepo,
  MemoryStore,
  PlanRepo,
  ProfileRepo,
  Repositories,
  type RowByTable,
  SessionRepo,
} from "../repos"
import { MemoryGarminImport } from "../repos/MemoryGarminImport"
import { MemoryIntegrations } from "../repos/MemoryIntegrations"
import { at, exercise, plan, session, userA, userB, week } from "../sync/fixtures"
import { logSession, updateProfile, writePlanWeek, writeTools } from "./writeTools"

const TestLayer = Layer.mergeAll(
  MemoryGarminImport.layer.pipe(Layer.provide(MemoryIntegrations.layer)),
  IdGenerator.layerTest,
).pipe(Layer.provideMerge(Layer.merge(Repositories.layerMemory, IdGenerator.layerTest)))

const NOW = at("2026-10-20T12:00:00.000Z")
const LATER = at("2026-10-21T12:00:00.000Z")
const setTime = (time: DateTime.Utc) => TestClock.setTime(DateTime.toEpochMillis(time))
// Fixture ids sit far above the ids IdGenerator.layerTest hands out (…001, …002, …).
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`
const SQUAT = id(1)
const BENCH = id(2)
const PLAN = id(0x100)
const OLD_PLAN = id(0x101)
const WEEK = id(0x110)

/** Inputs go through the wire schema, as `call` does, so the tests also pin the JSON shape. */
const planWeek = (raw: unknown) =>
  Schema.decodeUnknownEffect(WritePlanWeekInput)(raw).pipe(Effect.orDie)
const logInput = (raw: unknown) =>
  Schema.decodeUnknownEffect(LogSessionInput)(raw).pipe(Effect.orDie)
const profilePatch = (raw: unknown) =>
  Schema.decodeUnknownEffect(UpdateProfileInput)(raw).pipe(Effect.orDie)

const plannedSet = (exerciseId: string, order: number, reps = 5) => ({
  exerciseId,
  order,
  targetWeightKg: 100,
  targetReps: { _tag: "Exact", reps },
  targetRpe: null,
  restSeconds: 120,
  note: null,
})
const plannedSession = (order: number, name: string, sets: ReadonlyArray<unknown>) => ({
  order,
  name,
  scheduledDate: null,
  notes: null,
  sets,
})
const weekInput = (fields: Record<string, unknown>) => ({
  planId: null,
  weekStart: "2026-10-19",
  intent: "Volume",
  sessions: [
    plannedSession(0, "Lower A", [plannedSet(SQUAT, 0), plannedSet(SQUAT, 1)]),
    plannedSession(1, "Upper A", [plannedSet(BENCH, 0)]),
  ],
  ...fields,
})

const seed = Effect.gen(function* () {
  yield* setTime(NOW)
  yield* (yield* ExerciseRepo).put(userA, [
    exercise(1, { name: "Back Squat" }),
    exercise(2, { name: "Bench Press" }),
  ])
  yield* (yield* ExerciseRepo).put(userB, [exercise(9, { userId: userB, name: "Deadlift" })])
})
const seedActivePlan = Effect.gen(function* () {
  yield* seed
  yield* (yield* PlanRepo).putPlans(userA, [plan(0x101, "archived"), plan(0x100)])
})

/** Every stored row of a table, tombstones included. */
const stored = <T extends SyncTable>(table: T, userId: UserId = userA) =>
  Effect.gen(function* () {
    const rows = yield* (yield* MemoryStore).rows(table, userId)
    return Arr.map(rows, ({ row }): RowByTable[T] => row)
  })
/** Live planned-set ids of the active plan keyed `"<session order>:<set order>"`. */
const setIdsBySlot = Effect.gen(function* () {
  const current = Option.getOrThrow(yield* (yield* PlanRepo).currentPlan(userA))
  return Object.fromEntries(
    Arr.flatMap(current.sessions, (owner) =>
      Arr.map(
        Arr.filter(current.sets, (set) => set.plannedSessionId === owner.id),
        (set): readonly [string, string] => [`${owner.order}:${set.order}`, set.id],
      ),
    ),
  )
})
const live = <A extends { readonly deletedAt: Option.Option<unknown> }>(rows: ReadonlyArray<A>) =>
  Arr.filter(rows, (row) => Option.isNone(row.deletedAt))

describe("write_plan_week", () => {
  it.effect("creates the active plan from newPlan when none exists", () =>
    Effect.gen(function* () {
      yield* seed
      const input = yield* planWeek(weekInput({ newPlan: { name: "Block 1", goal: "Strength" } }))
      const result = yield* writePlanWeek.run(userA, input)
      expect(result.replaced).toBe(false)
      expect(result.sessions.map((s) => [s.order, s.name, s.sets])).toEqual([
        [0, "Lower A", 2],
        [1, "Upper A", 1],
      ])
      const current = Option.getOrThrow(yield* (yield* PlanRepo).currentPlan(userA))
      expect(current.plan).toMatchObject({
        id: result.planId,
        name: "Block 1",
        goal: "Strength",
        startDate: "2026-10-19",
        status: "active",
        userId: userA,
      })
      expect(current.weeks.map((w) => [w.id, w.intent])).toEqual([
        [result.planWeekId, Option.some("Volume")],
      ])
      expect(current.sessions.map((s) => s.id)).toEqual(
        result.sessions.map((s) => s.plannedSessionId),
      )
      expect(current.sets.length).toBe(3)
      expect(current.sets.every((s) => s.userId === userA)).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails ValidationError without newPlan when no plan is active, writing nothing", () =>
    Effect.gen(function* () {
      yield* seed
      const error = yield* Effect.flip(writePlanWeek.run(userA, yield* planWeek(weekInput({}))))
      expect(error).toMatchObject({
        _tag: "ValidationError",
        message: "no active plan; pass newPlan",
      })
      expect(yield* stored("plan")).toEqual([])
      expect(yield* stored("planWeek")).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("refuses a planId that is not the active plan", () =>
    Effect.gen(function* () {
      yield* seedActivePlan
      const error = yield* Effect.flip(
        writePlanWeek.run(userA, yield* planWeek(weekInput({ planId: OLD_PLAN }))),
      )
      expect(error).toMatchObject({
        _tag: "ValidationError",
        message: "planId is not the active plan",
      })
      expect(yield* stored("planWeek")).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("writes into the active plan (by planId or null) and ignores newPlan", () =>
    Effect.gen(function* () {
      yield* seedActivePlan
      const byId = yield* writePlanWeek.run(userA, yield* planWeek(weekInput({ planId: PLAN })))
      const byNull = yield* writePlanWeek.run(
        userA,
        yield* planWeek(
          weekInput({ weekStart: "2026-10-26", newPlan: { name: "Ignored", goal: "Ignored" } }),
        ),
      )
      expect([byId.planId, byNull.planId]).toEqual([PLAN, PLAN])
      expect(byNull.replaced).toBe(false)
      expect((yield* stored("plan")).length).toBe(2)
      const weeks = yield* (yield* PlanRepo).listWeeks(userA, byId.planId)
      expect(weeks.map((w) => w.weekStart)).toEqual(["2026-10-19", "2026-10-26"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("accepts a weekStart on any weekday (ADR-0007)", () =>
    Effect.gen(function* () {
      yield* seedActivePlan
      const result = yield* writePlanWeek.run(
        userA,
        yield* planWeek(weekInput({ weekStart: "2026-10-22" })), // a Thursday
      )
      const weeks = yield* (yield* PlanRepo).listWeeks(userA, result.planId)
      expect(weeks.map((w) => w.weekStart)).toEqual(["2026-10-22"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("re-sending a weekStart reuses the week, updates intent and reports replaced", () =>
    Effect.gen(function* () {
      yield* seedActivePlan
      yield* (yield* PlanRepo).putPlanWeeks(userA, [week(0x110, 0x100, "2026-10-19")])
      yield* setTime(LATER)
      const result = yield* writePlanWeek.run(
        userA,
        yield* planWeek(weekInput({ intent: "Deload" })),
      )
      expect(result).toMatchObject({ planWeekId: WEEK, replaced: true })
      const weeks = live(yield* stored("planWeek"))
      expect(weeks.map((w) => [w.id, w.intent, w.updatedAt])).toEqual([
        [WEEK, Option.some("Deload"), LATER],
      ])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("keeps planned-session ids by order and updates their fields", () =>
    Effect.gen(function* () {
      yield* seedActivePlan
      const first = yield* writePlanWeek.run(userA, yield* planWeek(weekInput({})))
      const second = yield* writePlanWeek.run(
        userA,
        yield* planWeek(
          weekInput({
            sessions: [
              plannedSession(1, "Upper B", [plannedSet(BENCH, 0)]),
              plannedSession(0, "Lower B", [plannedSet(SQUAT, 0)]),
            ],
          }),
        ),
      )
      const idByOrder = (r: typeof first) =>
        Object.fromEntries(r.sessions.map((s) => [s.order, s.plannedSessionId]))
      expect(idByOrder(second)).toEqual(idByOrder(first))
      const current = Option.getOrThrow(yield* (yield* PlanRepo).currentPlan(userA))
      expect(current.sessions.map((s) => [s.order, s.name])).toEqual([
        [0, "Lower B"],
        [1, "Upper B"],
      ])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("tombstones planned sessions whose order is not re-sent, with their sets", () =>
    Effect.gen(function* () {
      yield* seedActivePlan
      const first = yield* writePlanWeek.run(userA, yield* planWeek(weekInput({})))
      yield* setTime(LATER)
      yield* writePlanWeek.run(
        userA,
        yield* planWeek(weekInput({ sessions: [plannedSession(0, "Lower A", [])] })),
      )
      const upper = first.sessions[1]?.plannedSessionId
      const dropped = Arr.findFirst(yield* stored("plannedSession"), (s) => s.id === upper)
      expect(Option.map(dropped, (s) => s.deletedAt)).toEqual(Option.some(Option.some(LATER)))
      const current = Option.getOrThrow(yield* (yield* PlanRepo).currentPlan(userA))
      expect(current.sessions.map((s) => s.order)).toEqual([0])
      expect(current.sets).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("re-sending the same week keeps every planned-set id and tombstones none", () =>
    Effect.gen(function* () {
      yield* seedActivePlan
      yield* writePlanWeek.run(userA, yield* planWeek(weekInput({})))
      const before = yield* setIdsBySlot
      yield* setTime(LATER)
      yield* writePlanWeek.run(userA, yield* planWeek(weekInput({})))
      expect(yield* setIdsBySlot).toEqual(before)
      const all = yield* stored("plannedSet")
      expect([all.length, live(all).length]).toEqual([3, 3])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect(
    "keeps a set's id by order: changed reps update it, dropped orders tombstone, new orders insert",
    () =>
      Effect.gen(function* () {
        yield* seedActivePlan
        yield* writePlanWeek.run(userA, yield* planWeek(weekInput({})))
        const before = yield* setIdsBySlot
        yield* setTime(LATER)
        yield* writePlanWeek.run(
          userA,
          yield* planWeek(
            weekInput({
              sessions: [
                // Lower A: order 0 changes reps, order 1 is dropped.
                plannedSession(0, "Lower A", [plannedSet(SQUAT, 0, 3)]),
                // Upper A: order 0 unchanged, order 1 is new.
                plannedSession(1, "Upper A", [plannedSet(BENCH, 0), plannedSet(BENCH, 1, 8)]),
              ],
            }),
          ),
        )
        const after = yield* setIdsBySlot
        expect(after["0:0"]).toBe(before["0:0"])
        expect(after["1:0"]).toBe(before["1:0"])
        expect(after["0:1"]).toBeUndefined()
        expect(after["1:1"]).toBeDefined()
        expect(Object.values(before)).not.toContain(after["1:1"])
        const all = yield* stored("plannedSet")
        const changed = Arr.findFirst(all, (s) => s.id === before["0:0"])
        expect(Option.map(changed, (s) => [s.targetReps, s.updatedAt, s.createdAt])).toEqual(
          Option.some([{ _tag: "Exact", reps: 3 }, LATER, NOW]),
        )
        const dropped = Arr.findFirst(all, (s) => s.id === before["0:1"])
        expect(Option.map(dropped, (s) => s.deletedAt)).toEqual(Option.some(Option.some(LATER)))
        expect(all.length).toBe(4)
      }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("refuses duplicate session or set order before writing", () =>
    Effect.gen(function* () {
      yield* seedActivePlan
      const sessionDup = yield* Effect.flip(
        writePlanWeek.run(
          userA,
          yield* planWeek(
            weekInput({ sessions: [plannedSession(0, "A", []), plannedSession(0, "B", [])] }),
          ),
        ),
      )
      expect(sessionDup).toMatchObject({
        _tag: "ValidationError",
        message: "duplicate session order 0",
      })
      const setDup = yield* Effect.flip(
        writePlanWeek.run(
          userA,
          yield* planWeek(
            weekInput({
              sessions: [plannedSession(0, "A", [plannedSet(SQUAT, 2), plannedSet(BENCH, 2)])],
            }),
          ),
        ),
      )
      expect(setDup).toMatchObject({
        _tag: "ValidationError",
        issues: [{ path: ["sessions", 0, "sets"] }],
      })
      expect(yield* stored("planWeek")).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails NotFound for an unknown or foreign exercise", () =>
    Effect.gen(function* () {
      yield* seedActivePlan
      const foreign = id(9) // userB's Deadlift
      const error = yield* Effect.flip(
        writePlanWeek.run(
          userA,
          yield* planWeek(
            weekInput({ sessions: [plannedSession(0, "A", [plannedSet(foreign, 0)])] }),
          ),
        ),
      )
      expect(error).toMatchObject({ _tag: "NotFound", entity: "exercise", id: foreign })
      expect(yield* stored("planWeek")).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )
})

const logRaw = (fields: Record<string, unknown>) => ({
  startedAt: "2026-10-20T08:00:00.000Z",
  finishedAt: "2026-10-20T09:00:00.000Z",
  plannedSessionId: null,
  notes: null,
  sets: [
    { exerciseId: SQUAT, weightKg: 100, reps: 5, rpe: 8, note: null },
    {
      exerciseId: BENCH,
      weightKg: 60,
      reps: 8,
      rpe: null,
      note: null,
      loggedAt: "2026-10-20T08:30:00.000Z",
    },
  ],
  ...fields,
})

describe("log_session", () => {
  it.effect("creates a session: order = index, loggedAt defaults to startedAt", () =>
    Effect.gen(function* () {
      yield* seed
      const result = yield* logSession.run(userA, yield* logInput(logRaw({})))
      expect(result.session).toMatchObject({
        userId: userA,
        startedAt: at("2026-10-20T08:00:00.000Z"),
        createdAt: NOW,
        updatedAt: NOW,
      })
      expect(
        result.sets.map((s) => [s.order, s.exerciseId, s.loggedAt, s.plannedSetId, s.sessionId]),
      ).toEqual([
        [0, SQUAT, at("2026-10-20T08:00:00.000Z"), Option.none(), result.session.id],
        [1, BENCH, at("2026-10-20T08:30:00.000Z"), Option.none(), result.session.id],
      ])
      const sets = yield* (yield* SessionRepo).listSets(userA, result.session.id)
      expect(sets.map((s) => s.id)).toEqual(result.sets.map((s) => s.id))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("refuses a second session with the same startedAt without sessionId", () =>
    Effect.gen(function* () {
      yield* seed
      yield* logSession.run(userA, yield* logInput(logRaw({})))
      const error = yield* Effect.flip(logSession.run(userA, yield* logInput(logRaw({}))))
      expect(error).toMatchObject({
        _tag: "ValidationError",
        message:
          "a session already starts at 2026-10-20T08:00:00.000Z; pass sessionId to replace it",
      })
      const later = yield* logSession.run(
        userA,
        yield* logInput(logRaw({ startedAt: "2026-10-20T08:00:00.001Z" })),
      )
      expect(later.session.startedAt).toEqual(at("2026-10-20T08:00:00.001Z"))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("replaces the session and its sets when sessionId is given", () =>
    Effect.gen(function* () {
      yield* seed
      const first = yield* logSession.run(userA, yield* logInput(logRaw({})))
      yield* setTime(LATER)
      const second = yield* logSession.run(
        userA,
        yield* logInput(
          logRaw({
            sessionId: first.session.id,
            notes: "Felt strong",
            sets: [{ exerciseId: SQUAT, weightKg: 110, reps: 3, rpe: null, note: null }],
          }),
        ),
      )
      expect(second.session).toMatchObject({
        id: first.session.id,
        createdAt: NOW,
        updatedAt: LATER,
        notes: Option.some("Felt strong"),
      })
      const sets = yield* (yield* SessionRepo).listSets(userA, first.session.id)
      expect(sets.map((s) => [s.weightKg, s.reps])).toEqual([[110, 3]])
      const tombstoned = Arr.filter(yield* stored("set"), (s) => Option.isSome(s.deletedAt))
      expect(tombstoned.map((s) => s.id)).toEqual(
        expect.arrayContaining(first.sets.map((s) => s.id)),
      )
      expect(live(yield* stored("session")).length).toBe(1)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails NotFound for an unknown, foreign or deleted sessionId", () =>
    Effect.gen(function* () {
      yield* seed
      const sessions = yield* SessionRepo
      yield* sessions.putSessions(userB, [
        Session.make({ ...session(0x300, at("2026-10-19T08:00:00.000Z")), userId: userB }),
      ])
      yield* sessions.putSessions(userA, [session(0x301, at("2026-10-18T08:00:00.000Z"), true)])
      const ids = [id(0x2ff), id(0x300), id(0x301)]
      const errors = yield* Effect.forEach(ids, (sessionId) =>
        Effect.flatMap(logInput(logRaw({ sessionId })), (input) =>
          Effect.flip(logSession.run(userA, input)),
        ),
      )
      expect(
        errors.map((e) => [e._tag, "entity" in e ? e.entity : "", "id" in e ? e.id : ""]),
      ).toEqual(ids.map((sessionId) => ["NotFound", "session", sessionId]))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("checks plannedSessionId against the active plan", () =>
    Effect.gen(function* () {
      yield* seedActivePlan
      const unknown = id(0x400)
      const error = yield* Effect.flip(
        logSession.run(userA, yield* logInput(logRaw({ plannedSessionId: unknown }))),
      )
      expect(error).toMatchObject({ _tag: "NotFound", entity: "plannedSession", id: unknown })
      const week = yield* writePlanWeek.run(userA, yield* planWeek(weekInput({})))
      const plannedId = week.sessions[0]?.plannedSessionId
      const logged = yield* logSession.run(
        userA,
        yield* logInput(logRaw({ plannedSessionId: plannedId })),
      )
      expect(logged.session.plannedSessionId).toEqual(Option.fromNullishOr(plannedId))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails ValidationError when finishedAt is before startedAt", () =>
    Effect.gen(function* () {
      yield* seed
      const error = yield* Effect.flip(
        logSession.run(userA, yield* logInput(logRaw({ finishedAt: "2026-10-20T07:00:00.000Z" }))),
      )
      expect(error._tag).toBe("ValidationError")
      expect(yield* stored("session")).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails NotFound for an unknown exercise, writing nothing", () =>
    Effect.gen(function* () {
      yield* seed
      const unknown = id(0x500)
      const error = yield* Effect.flip(
        logSession.run(
          userA,
          yield* logInput(
            logRaw({
              sets: [{ exerciseId: unknown, weightKg: 1, reps: 1, rpe: null, note: null }],
            }),
          ),
        ),
      )
      expect(error).toMatchObject({ _tag: "NotFound", entity: "exercise", id: unknown })
      expect(yield* stored("session")).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("cross-user isolation", () => {
  /** userB's active plan and planned session, written through the tool as userB. */
  const seedUserB = Effect.gen(function* () {
    const result = yield* writePlanWeek.run(
      userB,
      yield* planWeek(
        weekInput({
          newPlan: { name: "B Block", goal: "Bulk" },
          sessions: [plannedSession(0, "B Day", [plannedSet(id(9), 0)])],
        }),
      ),
    )
    return {
      planId: result.planId,
      plannedSessionId: Option.getOrThrow(Arr.head(result.sessions)).plannedSessionId,
    }
  })

  it.effect(
    "log_session with another user's plannedSessionId fails NotFound, writing nothing",
    () =>
      Effect.gen(function* () {
        yield* seedActivePlan
        const foreign = yield* seedUserB
        const error = yield* Effect.flip(
          logSession.run(
            userA,
            yield* logInput(logRaw({ plannedSessionId: foreign.plannedSessionId })),
          ),
        )
        expect(error).toMatchObject({
          _tag: "NotFound",
          entity: "plannedSession",
          id: foreign.plannedSessionId,
        })
        expect(yield* stored("session", userA)).toEqual([])
        expect(yield* stored("session", userB)).toEqual([])
      }).pipe(Effect.provide(TestLayer)),
  )

  it.effect(
    "write_plan_week with another user's planId fails ValidationError, writing nothing",
    () =>
      Effect.gen(function* () {
        yield* seedActivePlan
        const foreign = yield* seedUserB
        const before = {
          a: [yield* stored("planWeek", userA), yield* stored("plannedSession", userA)],
          b: [yield* stored("planWeek", userB), yield* stored("plannedSession", userB)],
        }
        const error = yield* Effect.flip(
          writePlanWeek.run(userA, yield* planWeek(weekInput({ planId: foreign.planId }))),
        )
        expect(error).toMatchObject({
          _tag: "ValidationError",
          message: "planId is not the active plan",
        })
        expect(yield* stored("planWeek", userA)).toEqual(before.a[0])
        expect(yield* stored("plannedSession", userA)).toEqual(before.a[1])
        expect(yield* stored("planWeek", userB)).toEqual(before.b[0])
        expect(yield* stored("plannedSession", userB)).toEqual(before.b[1])
      }).pipe(Effect.provide(TestLayer)),
  )

  it.effect(
    "write_plan_week with another user's planId fails even when the caller has no plan",
    () =>
      Effect.gen(function* () {
        yield* seed
        const foreign = yield* seedUserB
        const error = yield* Effect.flip(
          writePlanWeek.run(
            userA,
            yield* planWeek(
              weekInput({ planId: foreign.planId, newPlan: { name: "Mine", goal: "G" } }),
            ),
          ),
        )
        expect(error).toMatchObject({ message: "planId is not the active plan" })
        expect(yield* stored("plan", userA)).toEqual([])
      }).pipe(Effect.provide(TestLayer)),
  )
})

describe("update_profile", () => {
  it.effect("refuses to create a profile without timezone", () =>
    Effect.gen(function* () {
      yield* setTime(NOW)
      const error = yield* Effect.flip(
        updateProfile.run(userA, yield* profilePatch({ availableDays: ["mon"] })),
      )
      expect(error).toMatchObject({
        _tag: "ValidationError",
        message: "no profile yet; timezone is required",
      })
      expect(yield* (yield* ProfileRepo).get(userA)).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("creates a profile with id = userId and empty defaults", () =>
    Effect.gen(function* () {
      yield* setTime(NOW)
      const profile = yield* updateProfile.run(
        userA,
        yield* profilePatch({ timezone: "Europe/Vilnius", availableDays: ["mon", "thu"] }),
      )
      expect(profile).toBeInstanceOf(Profile)
      expect(profile).toMatchObject({
        id: userA,
        userId: userA,
        timezone: "Europe/Vilnius",
        availableDays: ["mon", "thu"],
        goals: [],
        constraints: [],
        locations: [],
        activeLocationId: Option.none(),
        createdAt: NOW,
      })
      expect(yield* (yield* ProfileRepo).get(userA)).toEqual(Option.some(profile))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("rejects an activeLocationId that is not one of the locations", () =>
    Effect.gen(function* () {
      yield* setTime(NOW)
      const home = { id: "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c", name: "Home", equipment: [] }
      const error = yield* Effect.flip(
        updateProfile.run(
          userA,
          yield* profilePatch({
            timezone: "Europe/Vilnius",
            locations: [home],
            activeLocationId: "0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d",
          }),
        ),
      )
      expect(error).toMatchObject({ _tag: "ValidationError" })
      expect(JSON.stringify(error)).toContain("activeLocationId")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect(
    "rejects a patch that drops the active location without resetting activeLocationId",
    () =>
      Effect.gen(function* () {
        yield* setTime(NOW)
        const gym = { id: id(0x401), name: "Gym", equipment: [] }
        const home = { id: id(0x402), name: "Home", equipment: [] }
        yield* updateProfile.run(
          userA,
          yield* profilePatch({
            timezone: "Europe/Vilnius",
            locations: [gym, home],
            activeLocationId: gym.id,
          }),
        )
        const error = yield* Effect.flip(
          updateProfile.run(userA, yield* profilePatch({ locations: [home] })),
        )
        expect(error).toMatchObject({
          _tag: "ValidationError",
          issues: [{ path: ["activeLocationId"] }],
        })
        const cleared = yield* updateProfile.run(
          userA,
          yield* profilePatch({ locations: [home], activeLocationId: null }),
        )
        expect(cleared.activeLocationId).toEqual(Option.none())
      }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("merges a patch: absent keys unchanged, createdAt kept, updatedAt = now", () =>
    Effect.gen(function* () {
      yield* setTime(NOW)
      const gym = { id: id(0x403), name: "Gym", equipment: [] }
      yield* updateProfile.run(
        userA,
        yield* profilePatch({
          timezone: "Europe/Vilnius",
          constraints: ["no overhead"],
          locations: [gym],
          activeLocationId: gym.id,
        }),
      )
      yield* setTime(LATER)
      const merged = yield* updateProfile.run(
        userA,
        yield* profilePatch({ goals: [{ kind: "strength", note: null }] }),
      )
      expect(merged).toMatchObject({
        timezone: "Europe/Vilnius",
        constraints: ["no overhead"],
        goals: [{ kind: "strength", note: Option.none() }],
        locations: [gym],
        activeLocationId: Option.some(gym.id),
        createdAt: NOW,
        updatedAt: LATER,
      })
      const untouched = yield* updateProfile.run(userA, yield* profilePatch({}))
      expect(untouched).toMatchObject({
        locations: [gym],
        activeLocationId: Option.some(gym.id),
      })
      expect(yield* (yield* ProfileRepo).get(userA)).toEqual(Option.some(untouched))
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("writeTools", () => {
  it("lists the three write tools in MCP_TOOLS order, all kind write", () => {
    expect(writeTools.map((t) => [t.name, t.kind])).toEqual(
      MCP_TOOLS.slice(12, 15).map((name) => [name, "write"]),
    )
  })

  it.effect("call decodes raw JSON args and encodes the result", () =>
    Effect.gen(function* () {
      yield* seed
      const tool = Arr.findFirst(writeTools, (t) => t.name === "log_session")
      const encoded = yield* Option.getOrThrow(tool).call(userA, logRaw({}))
      expect(encoded).toMatchObject({
        session: { startedAt: "2026-10-20T08:00:00.000Z", plannedSessionId: null },
        sets: [{ order: 0, loggedAt: "2026-10-20T08:00:00.000Z" }, { order: 1 }],
      })
      const invalid = yield* Effect.flip(Option.getOrThrow(tool).call(userA, { sets: [] }))
      expect(invalid._tag).toBe("ValidationError")
    }).pipe(Effect.provide(TestLayer)),
  )
})
