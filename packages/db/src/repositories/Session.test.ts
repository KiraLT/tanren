import { describe, expect, it } from "@effect/vitest"
import { ExerciseId, SessionId, UserId } from "@tanren/shared"
import { DateTime, Effect, Option } from "effect"
import { SqlClient } from "effect/sql"
import { exercise, session, TestLayer, t2, userA, userB, workoutSet } from "../testing/fixtures"
import { ExerciseRepo } from "./Exercise"
import { SessionRepo } from "./Session"

const ownerA = UserId.make(userA)
const ownerB = UserId.make(userB)
const id = (n: number) => `30000000-0000-4000-8000-${n.toString().padStart(12, "0")}`
const sessionIdOf = (n: number) => SessionId.make(id(n))
const time = (iso: string) => DateTime.makeUnsafe(iso)

describe("SessionRepo", () => {
  it.effect("returns a stored session to its owner and hides it from others", () =>
    Effect.gen(function* () {
      const repo = yield* SessionRepo
      const row = session({ id: id(1) })
      yield* repo.putSessions(ownerA, [row])
      expect(yield* repo.getSession(ownerA, row.id)).toEqual(Option.some(row))
      expect(yield* repo.getSession(ownerB, row.id)).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("lists live sessions started in [from, to), oldest first", () =>
    Effect.gen(function* () {
      const repo = yield* SessionRepo
      const user = "00000000-0000-4000-8000-0000000000e1"
      const owner = UserId.make(user)
      const u = { userId: user }
      const before = session({ id: id(10), startedAt: "2026-10-01T08:00:00.000Z", ...u })
      const first = session({ id: id(11), startedAt: "2026-10-05T08:00:00.000Z", ...u })
      const second = session({ id: id(12), startedAt: "2026-10-09T08:00:00.000Z", ...u })
      const gone = session({
        id: id(13),
        startedAt: "2026-10-07T08:00:00.000Z",
        deletedAt: t2,
        ...u,
      })
      const atEnd = session({ id: id(14), startedAt: "2026-10-10T00:00:00.000Z", ...u })
      yield* repo.putSessions(owner, [second, atEnd, gone, first, before])
      const listed = yield* repo.listSessions(owner, {
        from: time("2026-10-02T00:00:00.000Z"),
        to: time("2026-10-10T00:00:00.000Z"),
      })
      expect(listed.map((row) => row.id)).toEqual([first.id, second.id])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("never lists user A's sessions for user B", () =>
    Effect.gen(function* () {
      const repo = yield* SessionRepo
      yield* repo.putSessions(ownerA, [session({ id: id(15) })])
      const range = { from: time("2026-01-01T00:00:00.000Z"), to: time("2027-01-01T00:00:00.000Z") }
      expect(yield* repo.listSessions(ownerB, range)).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails with Forbidden when a row belongs to another user", () =>
    Effect.gen(function* () {
      const repo = yield* SessionRepo
      const foreign = session({ id: id(16), userId: userB })
      const error = yield* Effect.flip(repo.putSessions(ownerA, [foreign]))
      expect(error._tag).toBe("Forbidden")
      expect(yield* repo.getSession(ownerB, foreign.id)).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("lists the live sets of a session by (order, created_at, id)", () =>
    Effect.gen(function* () {
      const repo = yield* SessionRepo
      const exercises = yield* ExerciseRepo
      yield* exercises.put(ownerA, [exercise({ id: id(20), name: "Session test lift" })])
      yield* repo.putSessions(ownerA, [session({ id: id(21) }), session({ id: id(22) })])
      const set = (setId: number, sessionId: number, order: number, extra = {}) =>
        workoutSet({
          id: id(setId),
          sessionId: id(sessionId),
          exerciseId: id(20),
          order,
          ...extra,
        })
      yield* repo.putSets(ownerA, [
        set(30, 21, 1),
        set(31, 21, 0, { createdAt: t2 }),
        set(32, 21, 0),
        set(33, 21, 2, { deletedAt: t2 }),
        set(34, 22, 0),
      ])
      const sets = yield* repo.listSets(ownerA, sessionIdOf(21))
      expect(sets.map((row) => row.id)).toEqual([id(32), id(31), id(30)])
      expect(yield* repo.listSets(ownerB, sessionIdOf(21))).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("rejects a set of a missing session and rolls the whole batch back", () =>
    Effect.gen(function* () {
      const repo = yield* SessionRepo
      const exercises = yield* ExerciseRepo
      const sql = yield* SqlClient.SqlClient
      yield* exercises.put(ownerA, [exercise({ id: id(40), name: "Rollback lift" })])
      yield* repo.putSessions(ownerA, [session({ id: id(41) })])
      const seqOf = sql<{
        readonly seq: number
      }>`SELECT seq FROM sync_clock WHERE user_id = ${userA}`
      const before = yield* seqOf
      const ok = workoutSet({ id: id(42), sessionId: id(41), exerciseId: id(40) })
      const orphan = workoutSet({ id: id(43), sessionId: id(99), exerciseId: id(40) })
      const error = yield* Effect.flip(repo.putSets(ownerA, [ok, orphan]))
      expect(error._tag).toBe("PersistenceError")
      expect(yield* repo.listSets(ownerA, sessionIdOf(41))).toEqual([])
      expect(yield* seqOf).toEqual(before)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("rejects a set of a missing exercise", () =>
    Effect.gen(function* () {
      const repo = yield* SessionRepo
      yield* repo.putSessions(ownerA, [session({ id: id(50) })])
      const orphan = workoutSet({ id: id(51), sessionId: id(50), exerciseId: id(98) })
      const error = yield* Effect.flip(repo.putSets(ownerA, [orphan]))
      expect(error._tag).toBe("PersistenceError")
    }).pipe(Effect.provide(TestLayer)),
  )

  describe("set listings across sessions", () => {
    // Each test owns a fresh user and ids from its own block: the D1 is shared by the file.
    const scenario = (block: number) => {
      const user = id(block * 100)
      const owner = UserId.make(user)
      const exerciseOf = (n: number) => id(block * 100 + n)
      const sess = (n: number, startedAt: string, extra = {}) =>
        session({ id: id(block * 100 + 10 + n), userId: user, startedAt, ...extra })
      const set = (n: number, sessionN: number, exerciseN: number, order: number, extra = {}) =>
        workoutSet({
          id: id(block * 100 + 50 + n),
          userId: user,
          sessionId: id(block * 100 + 10 + sessionN),
          exerciseId: exerciseOf(exerciseN),
          order,
          ...extra,
        })
      const setId = (n: number) => id(block * 100 + 50 + n)
      const seedExercises = Effect.gen(function* () {
        const exercises = yield* ExerciseRepo
        yield* exercises.put(owner, [
          exercise({ id: exerciseOf(1), userId: user, name: `Lift one ${block}` }),
          exercise({ id: exerciseOf(2), userId: user, name: `Lift two ${block}` }),
        ])
      })
      return { owner, exerciseOf, sess, set, setId, seedExercises }
    }

    it.effect("lists the sets of live sessions in [from, to), oldest session first", () =>
      Effect.gen(function* () {
        const repo = yield* SessionRepo
        const { owner, sess, set, setId, seedExercises } = scenario(1)
        yield* seedExercises
        yield* repo.putSessions(owner, [
          sess(1, "2026-10-05T08:00:00.000Z"),
          sess(2, "2026-10-03T08:00:00.000Z"),
          sess(3, "2026-10-10T00:00:00.000Z"),
          sess(4, "2026-10-02T00:00:00.000Z"),
          sess(5, "2026-10-04T08:00:00.000Z", { deletedAt: t2 }),
          sess(6, "2026-10-01T23:59:59.000Z"),
        ])
        yield* repo.putSets(owner, [
          set(1, 1, 1, 1),
          set(2, 1, 2, 0),
          set(3, 2, 1, 0),
          set(4, 3, 1, 0),
          set(5, 4, 1, 0),
          set(6, 5, 1, 0),
          set(7, 6, 1, 0),
          set(8, 1, 1, 2, { deletedAt: t2 }),
        ])
        const listed = yield* repo.listSetsInRange(owner, {
          from: time("2026-10-02T00:00:00.000Z"),
          to: time("2026-10-10T00:00:00.000Z"),
        })
        expect(listed.map((row) => row.id)).toEqual([setId(5), setId(3), setId(2), setId(1)])
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect("shows no set to another user in a range", () =>
      Effect.gen(function* () {
        const repo = yield* SessionRepo
        const { owner, sess, set, seedExercises } = scenario(2)
        yield* seedExercises
        yield* repo.putSessions(owner, [sess(1, "2026-10-05T08:00:00.000Z")])
        yield* repo.putSets(owner, [set(1, 1, 1, 0)])
        const range = {
          from: time("2026-01-01T00:00:00.000Z"),
          to: time("2027-01-01T00:00:00.000Z"),
        }
        expect(yield* repo.listSetsInRange(owner, range)).toHaveLength(1)
        expect(yield* repo.listSetsInRange(ownerB, range)).toEqual([])
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect("lists one exercise's sets from the newest `limit` sessions, newest first", () =>
      Effect.gen(function* () {
        const repo = yield* SessionRepo
        const { owner, exerciseOf, sess, set, setId, seedExercises } = scenario(3)
        yield* seedExercises
        yield* repo.putSessions(owner, [
          sess(1, "2026-10-01T08:00:00.000Z"),
          sess(2, "2026-10-03T08:00:00.000Z"),
          sess(3, "2026-10-05T08:00:00.000Z"),
          sess(4, "2026-10-07T08:00:00.000Z"),
          sess(5, "2026-10-09T08:00:00.000Z", { deletedAt: t2 }),
        ])
        yield* repo.putSets(owner, [
          set(1, 1, 1, 0),
          set(2, 2, 1, 1),
          set(3, 2, 1, 0),
          set(4, 3, 1, 0),
          set(5, 3, 1, 1, { deletedAt: t2 }),
          set(6, 3, 2, 1),
          set(7, 4, 2, 0),
          set(8, 5, 1, 0),
        ])
        const two = yield* repo.listSetsForExercise(owner, ExerciseId.make(exerciseOf(1)), 2)
        expect(two.map((row) => row.id)).toEqual([setId(4), setId(3), setId(2)])
        const all = yield* repo.listSetsForExercise(owner, ExerciseId.make(exerciseOf(1)), 10)
        expect(all.map((row) => row.id)).toEqual([setId(4), setId(3), setId(2), setId(1)])
        const other = yield* repo.listSetsForExercise(owner, ExerciseId.make(exerciseOf(2)), 10)
        expect(other.map((row) => row.id)).toEqual([setId(7), setId(6)])
        expect(yield* repo.listSetsForExercise(ownerB, ExerciseId.make(exerciseOf(1)), 10)).toEqual(
          [],
        )
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect("lists the newest `limit` live sessions containing an exercise, newest first", () =>
      Effect.gen(function* () {
        const repo = yield* SessionRepo
        const { owner, exerciseOf, sess, set, seedExercises } = scenario(4)
        yield* seedExercises
        yield* repo.putSessions(owner, [
          sess(1, "2026-10-01T08:00:00.000Z"),
          sess(2, "2026-10-03T08:00:00.000Z"),
          sess(3, "2026-10-05T08:00:00.000Z"),
          sess(4, "2026-10-07T08:00:00.000Z"),
          sess(5, "2026-10-09T08:00:00.000Z", { deletedAt: t2 }),
        ])
        yield* repo.putSets(owner, [
          set(1, 1, 1, 0),
          set(2, 2, 1, 0),
          set(3, 3, 1, 0, { deletedAt: t2 }),
          set(4, 3, 2, 0),
          set(5, 4, 1, 0),
          set(6, 5, 1, 0),
        ])
        const exerciseId = ExerciseId.make(exerciseOf(1))
        const sessionOf = (n: number) => id(400 + 10 + n)
        const two = yield* repo.listSessionsForExercise(owner, exerciseId, 2)
        expect(two.map((row) => row.id)).toEqual([sessionOf(4), sessionOf(2)])
        const all = yield* repo.listSessionsForExercise(owner, exerciseId, 10)
        expect(all.map((row) => row.id)).toEqual([sessionOf(4), sessionOf(2), sessionOf(1)])
        expect(yield* repo.listSessionsForExercise(ownerB, exerciseId, 10)).toEqual([])
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  it.effect("keeps a set's session when an upsert changes it", () =>
    Effect.gen(function* () {
      const repo = yield* SessionRepo
      const exercises = yield* ExerciseRepo
      yield* exercises.put(ownerA, [exercise({ id: id(60), name: "Immutable lift" })])
      yield* repo.putSessions(ownerA, [session({ id: id(61) }), session({ id: id(62) })])
      yield* repo.putSets(ownerA, [
        workoutSet({ id: id(63), sessionId: id(61), exerciseId: id(60) }),
      ])
      yield* repo.putSets(ownerA, [
        workoutSet({ id: id(63), sessionId: id(62), exerciseId: id(60), reps: 8, updatedAt: t2 }),
      ])
      const sets = yield* repo.listSets(ownerA, sessionIdOf(61))
      expect(sets.map((row) => [row.id, row.sessionId, row.reps])).toEqual([[id(63), id(61), 8]])
      expect(yield* repo.listSets(ownerA, sessionIdOf(62))).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )
})
