import { describe, expect, it } from "@effect/vitest"
import { PlanId, UserId } from "@tanren/shared"
import { Effect, Option } from "effect"
import { SqlClient } from "effect/sql"
import {
  exercise,
  plan,
  plannedSession,
  plannedSet,
  planWeek,
  TestLayer,
  t2,
  userA,
  userB,
} from "../testing/fixtures"
import { ExerciseRepo } from "./Exercise"
import { PlanRepo } from "./Plan"

const ownerA = UserId.make(userA)
const ownerB = UserId.make(userB)
/** At most one live active plan per user: tests that need an active plan use their own user. */
const userN = (n: number) =>
  `00000000-0000-4000-8000-${(0xc000 + n).toString(16).padStart(12, "0")}`
const id = (n: number) => `20000000-0000-4000-8000-${n.toString().padStart(12, "0")}`
const planIdOf = (n: number) => PlanId.make(id(n))

describe("PlanRepo", () => {
  it.effect("returns a stored plan to its owner and hides it from others", () =>
    Effect.gen(function* () {
      const repo = yield* PlanRepo
      const row = plan({ id: id(1), status: "archived" })
      yield* repo.putPlans(ownerA, [row])
      expect(yield* repo.getPlan(ownerA, row.id)).toEqual(Option.some(row))
      expect(yield* repo.getPlan(ownerB, row.id)).toEqual(Option.none())
      expect(yield* repo.listPlans(ownerB, { includeDeleted: true })).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("lists plans by creation time and hides tombstones unless asked", () =>
    Effect.gen(function* () {
      const repo = yield* PlanRepo
      const user = userN(1)
      const owner = UserId.make(user)
      const late = plan({ id: id(2), userId: user, status: "archived", createdAt: t2 })
      const early = plan({ id: id(3), userId: user, status: "archived" })
      const gone = plan({ id: id(4), userId: user, status: "archived", deletedAt: t2 })
      yield* repo.putPlans(owner, [late, early, gone])
      const live = yield* repo.listPlans(owner, { includeDeleted: false })
      expect(live.map((row) => row.id)).toEqual([early.id, late.id])
      const all = yield* repo.listPlans(owner, { includeDeleted: true })
      expect(all.map((row) => row.id)).toEqual([early.id, gone.id, late.id])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails with Forbidden when a row belongs to another user", () =>
    Effect.gen(function* () {
      const repo = yield* PlanRepo
      const foreign = plan({ id: id(5), userId: userB, status: "archived" })
      const error = yield* Effect.flip(repo.putPlans(ownerA, [foreign]))
      expect(error._tag).toBe("Forbidden")
      expect(yield* repo.getPlan(ownerB, foreign.id)).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("rejects a second live active plan for the same user", () =>
    Effect.gen(function* () {
      const repo = yield* PlanRepo
      const user = userN(2)
      const owner = UserId.make(user)
      const first = plan({ id: id(10), userId: user })
      const second = plan({ id: id(11), userId: user, name: "Another" })
      yield* repo.putPlans(owner, [first])
      const error = yield* Effect.flip(repo.putPlans(owner, [second]))
      expect(error._tag).toBe("PersistenceError")
      expect(yield* repo.getPlan(owner, second.id)).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("allows an archived or soft-deleted plan next to the active one", () =>
    Effect.gen(function* () {
      const repo = yield* PlanRepo
      const user = userN(3)
      const owner = UserId.make(user)
      const rows = [
        plan({ id: id(12), userId: user }),
        plan({ id: id(13), userId: user, status: "archived" }),
        plan({ id: id(14), userId: user, deletedAt: t2, updatedAt: t2 }),
      ]
      yield* repo.putPlans(owner, rows)
      expect(yield* repo.listPlans(owner, { includeDeleted: true })).toEqual(rows)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("rejects a second live week of the same plan starting on the same day", () =>
    Effect.gen(function* () {
      const repo = yield* PlanRepo
      yield* repo.putPlans(ownerA, [plan({ id: id(20), status: "archived" })])
      const first = planWeek({ id: id(21), planId: id(20) })
      const clash = planWeek({ id: id(22), planId: id(20) })
      const error = yield* Effect.flip(repo.putPlanWeeks(ownerA, [first, clash]))
      expect(error._tag).toBe("PersistenceError")
      expect(yield* repo.listWeeks(ownerA, planIdOf(20))).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("allows the same week start in another plan or after a soft delete", () =>
    Effect.gen(function* () {
      const repo = yield* PlanRepo
      yield* repo.putPlans(ownerA, [
        plan({ id: id(23), status: "archived" }),
        plan({ id: id(24), status: "archived" }),
      ])
      const gone = planWeek({ id: id(25), planId: id(23), deletedAt: t2, updatedAt: t2 })
      const live = planWeek({ id: id(26), planId: id(23) })
      const other = planWeek({ id: id(27), planId: id(24) })
      yield* repo.putPlanWeeks(ownerA, [gone, live, other])
      const weeks = yield* repo.listWeeks(ownerA, planIdOf(23))
      expect(weeks.map((row) => row.id)).toEqual([live.id])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("rejects a week of a missing plan and rolls the whole batch back", () =>
    Effect.gen(function* () {
      const repo = yield* PlanRepo
      const sql = yield* SqlClient.SqlClient
      yield* repo.putPlans(ownerA, [plan({ id: id(30), status: "archived" })])
      const seqOf = sql<{
        readonly seq: number
      }>`SELECT seq FROM sync_clock WHERE user_id = ${userA}`
      const before = yield* seqOf
      const ok = planWeek({ id: id(31), planId: id(30) })
      const orphan = planWeek({ id: id(32), planId: id(99), weekStart: "2026-10-26" })
      const error = yield* Effect.flip(repo.putPlanWeeks(ownerA, [ok, orphan]))
      expect(error._tag).toBe("PersistenceError")
      expect(yield* repo.listWeeks(ownerA, planIdOf(30))).toEqual([])
      expect(yield* seqOf).toEqual(before)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("rejects a planned session or set whose parent is missing", () =>
    Effect.gen(function* () {
      const plans = yield* PlanRepo
      const exercises = yield* ExerciseRepo
      yield* exercises.put(ownerA, [exercise({ id: id(40), name: "Plan test lift" })])
      const orphanSession = plannedSession({ id: id(41), planWeekId: id(98) })
      const sessionError = yield* Effect.flip(plans.putPlannedSessions(ownerA, [orphanSession]))
      expect(sessionError._tag).toBe("PersistenceError")
      const orphanSet = plannedSet({ id: id(42), plannedSessionId: id(97), exerciseId: id(40) })
      const setError = yield* Effect.flip(plans.putPlannedSets(ownerA, [orphanSet]))
      expect(setError._tag).toBe("PersistenceError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("keeps a row's parent id when an upsert changes it", () =>
    Effect.gen(function* () {
      const repo = yield* PlanRepo
      yield* repo.putPlans(ownerA, [
        plan({ id: id(50), status: "archived" }),
        plan({ id: id(51), status: "archived" }),
      ])
      yield* repo.putPlanWeeks(ownerA, [planWeek({ id: id(52), planId: id(50) })])
      yield* repo.putPlanWeeks(ownerA, [
        planWeek({ id: id(52), planId: id(51), intent: "Deload", updatedAt: t2 }),
      ])
      const weeks = yield* repo.listWeeks(ownerA, planIdOf(50))
      expect(weeks.map((row) => [row.id, row.planId, Option.getOrNull(row.intent)])).toEqual([
        [id(52), id(50), "Deload"],
      ])
      expect(yield* repo.listWeeks(ownerA, planIdOf(51))).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("assembles the current plan: weeks, sessions and sets in canonical order", () =>
    Effect.gen(function* () {
      const repo = yield* PlanRepo
      const exercises = yield* ExerciseRepo
      const user = userN(4)
      const owner = UserId.make(user)
      const u = { userId: user }
      yield* exercises.put(owner, [exercise({ id: id(60), ...u })])
      yield* repo.putPlans(owner, [
        plan({ id: id(61), ...u, status: "archived" }),
        plan({ id: id(62), ...u }),
      ])
      yield* repo.putPlanWeeks(owner, [
        planWeek({ id: id(70), planId: id(62), weekStart: "2026-10-26", ...u }),
        planWeek({ id: id(71), planId: id(62), weekStart: "2026-10-19", ...u }),
        planWeek({ id: id(81), planId: id(61), weekStart: "2026-10-12", ...u }),
      ])
      yield* repo.putPlannedSessions(owner, [
        plannedSession({ id: id(72), planWeekId: id(70), order: 0, name: "Week 2 A", ...u }),
        plannedSession({ id: id(73), planWeekId: id(71), order: 1, name: "Week 1 B", ...u }),
        plannedSession({ id: id(74), planWeekId: id(71), order: 0, name: "Week 1 A", ...u }),
        plannedSession({
          id: id(75),
          planWeekId: id(71),
          order: 2,
          name: "Gone",
          deletedAt: t2,
          ...u,
        }),
        plannedSession({ id: id(82), planWeekId: id(81), order: 0, name: "Archived", ...u }),
      ])
      const set = (setId: number, sessionId: number, order: number, createdAt?: string) =>
        plannedSet({
          id: id(setId),
          plannedSessionId: id(sessionId),
          exerciseId: id(60),
          order,
          ...(createdAt === undefined ? {} : { createdAt }),
          ...u,
        })
      yield* repo.putPlannedSets(owner, [
        set(76, 73, 0),
        set(77, 74, 1),
        set(78, 74, 0, t2),
        set(79, 74, 0),
        set(80, 72, 0),
        set(83, 82, 0),
      ])
      const found = yield* repo.currentPlan(owner)
      expect(Option.map(found, (current) => current.plan.id)).toEqual(Option.some(id(62)))
      const current = Option.getOrUndefined(found)
      expect(current?.weeks.map((row) => row.id)).toEqual([id(71), id(70)])
      expect(current?.sessions.map((row) => row.name)).toEqual(["Week 1 A", "Week 1 B", "Week 2 A"])
      // Week 1 A: order 0 (older row first, then the newer), then order 1; then Week 1 B; then week 2.
      expect(current?.sets.map((row) => row.id)).toEqual([id(79), id(78), id(77), id(76), id(80)])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("has no current plan for a user without a live active plan", () =>
    Effect.gen(function* () {
      const repo = yield* PlanRepo
      const user = userN(5)
      const owner = UserId.make(user)
      yield* repo.putPlans(owner, [
        plan({ id: id(90), userId: user, status: "archived" }),
        plan({ id: id(91), userId: user, deletedAt: t2 }),
      ])
      expect(yield* repo.currentPlan(owner)).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("never shows user A's active plan as user B's current plan", () =>
    Effect.gen(function* () {
      const repo = yield* PlanRepo
      const user = userN(6)
      yield* repo.putPlans(UserId.make(user), [plan({ id: id(92), userId: user })])
      expect(yield* repo.currentPlan(ownerB)).toEqual(Option.none())
      expect(Option.isSome(yield* repo.currentPlan(UserId.make(user)))).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )
})
