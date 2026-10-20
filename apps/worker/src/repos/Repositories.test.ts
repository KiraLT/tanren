import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { at, exercise, plan, session, T0, userA, userB, week } from "../sync/fixtures"
import { ExerciseRepo, PlanRepo, Repositories, SessionRepo } from "."

describe("memory repositories", () => {
  it.effect("put fails Forbidden on a foreign userId", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        (yield* ExerciseRepo).put(userA, [exercise(1, { userId: userB })]),
      )
      expect(error._tag).toBe("Forbidden")
    }).pipe(Effect.provide(Repositories.layerMemory)),
  )

  it.effect("a row with another user's id is skipped; the owner's row is unchanged", () =>
    Effect.gen(function* () {
      const repo = yield* ExerciseRepo
      yield* repo.put(userA, [exercise(1)])
      yield* repo.put(userB, [exercise(1, { userId: userB, name: "Hijacked" })])
      const row = yield* repo.get(userA, exercise(1).id)
      expect(Option.map(row, (r) => r.name)).toEqual(Option.some("Exercise 1"))
      expect(yield* repo.get(userB, exercise(1).id)).toEqual(Option.none())
    }).pipe(Effect.provide(Repositories.layerMemory)),
  )

  it.effect("an upsert keeps the stored createdAt", () =>
    Effect.gen(function* () {
      const repo = yield* ExerciseRepo
      yield* repo.put(userA, [exercise(1)])
      yield* repo.put(userA, [
        exercise(1, { createdAt: at("2026-10-01T00:00:00.000Z"), name: "New" }),
      ])
      const row = yield* repo.get(userA, exercise(1).id)
      expect(Option.map(row, (r) => [r.name, r.createdAt])).toEqual(Option.some(["New", T0]))
    }).pipe(Effect.provide(Repositories.layerMemory)),
  )

  it.effect("listSessions is half-open, live only, ordered by startedAt", () =>
    Effect.gen(function* () {
      const repo = yield* SessionRepo
      const from = at("2026-10-01T00:00:00.000Z")
      const to = at("2026-10-08T00:00:00.000Z")
      yield* repo.putSessions(userA, [
        session(3, at("2026-10-05T00:00:00.000Z")),
        session(1, from),
        session(2, to),
        session(4, at("2026-10-03T00:00:00.000Z"), true),
      ])
      const rows = yield* repo.listSessions(userA, { from, to })
      expect(rows.map((r) => r.id)).toEqual([session(1, from).id, session(3, from).id])
    }).pipe(Effect.provide(Repositories.layerMemory)),
  )

  it.effect("a second live active plan or a duplicate week start fails with PersistenceError", () =>
    Effect.gen(function* () {
      const repo = yield* PlanRepo
      yield* repo.putPlans(userA, [plan(10)])
      const second = yield* Effect.flip(repo.putPlans(userA, [plan(11)]))
      expect(second._tag).toBe("PersistenceError")
      yield* repo.putPlanWeeks(userA, [week(20, 10)])
      const dup = yield* Effect.flip(repo.putPlanWeeks(userA, [week(21, 10)]))
      expect(dup._tag).toBe("PersistenceError")
      yield* repo.putPlanWeeks(userA, [week(22, 10, "2026-10-12")])
      const weeks = yield* repo.listWeeks(userA, plan(10).id)
      expect(weeks.map((w) => w.weekStart)).toEqual(["2026-10-12", "2026-10-19"])
    }).pipe(Effect.provide(Repositories.layerMemory)),
  )
})
