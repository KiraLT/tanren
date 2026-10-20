import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Effect, Option } from "effect"
import { SqlClient } from "effect/sql"
import { exercise, TestLayer, t2, userA, userB } from "../testing/fixtures"
import { ExerciseRepo } from "./Exercise"

const ownerA = UserId.make(userA)
const ownerB = UserId.make(userB)

describe("ExerciseRepo", () => {
  it.effect("returns a stored exercise to its owner", () =>
    Effect.gen(function* () {
      const repo = yield* ExerciseRepo
      const row = exercise({ id: "10000000-0000-4000-8000-000000000001" })
      yield* repo.put(ownerA, [row])
      expect(yield* repo.get(ownerA, row.id)).toEqual(Option.some(row))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("never shows user A's exercise to user B", () =>
    Effect.gen(function* () {
      const repo = yield* ExerciseRepo
      const row = exercise({ id: "10000000-0000-4000-8000-000000000002", name: "Squat" })
      yield* repo.put(ownerA, [row])
      expect(yield* repo.get(ownerB, row.id)).toEqual(Option.none())
      expect(yield* repo.list(ownerB, { includeDeleted: true })).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("ignores user B's upsert onto user A's id", () =>
    Effect.gen(function* () {
      const repo = yield* ExerciseRepo
      const row = exercise({ id: "10000000-0000-4000-8000-000000000003", name: "Deadlift" })
      yield* repo.put(ownerA, [row])
      const hijack = exercise({ id: row.id, userId: userB, name: "Hacked", updatedAt: t2 })
      yield* repo.put(ownerB, [hijack])
      expect(yield* repo.get(ownerA, row.id)).toEqual(Option.some(row))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails with Forbidden when a row belongs to another user", () =>
    Effect.gen(function* () {
      const repo = yield* ExerciseRepo
      const foreign = exercise({ id: "10000000-0000-4000-8000-000000000004", userId: userB })
      const error = yield* Effect.flip(repo.put(ownerA, [foreign]))
      expect(error._tag).toBe("Forbidden")
      expect(yield* repo.get(ownerB, foreign.id)).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("rejects a second live exercise with the same name in any case", () =>
    Effect.gen(function* () {
      const repo = yield* ExerciseRepo
      const first = exercise({ id: "10000000-0000-4000-8000-000000000005", name: "Overhead Press" })
      const second = exercise({
        id: "10000000-0000-4000-8000-000000000006",
        name: "overhead press",
      })
      const error = yield* Effect.flip(repo.put(ownerA, [first, second]))
      expect(error._tag).toBe("PersistenceError")
      expect(yield* repo.get(ownerA, first.id)).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("allows reusing the name of a soft-deleted exercise", () =>
    Effect.gen(function* () {
      const repo = yield* ExerciseRepo
      const gone = exercise({
        id: "10000000-0000-4000-8000-000000000007",
        name: "Row",
        deletedAt: t2,
        updatedAt: t2,
      })
      const live = exercise({ id: "10000000-0000-4000-8000-000000000008", name: "row" })
      yield* repo.put(ownerA, [gone, live])
      const ids = (yield* repo.list(ownerA, { includeDeleted: false })).map((row) => row.id)
      expect(ids).toContain(live.id)
      expect(ids).not.toContain(gone.id)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("keeps id, user and createdAt when an upsert changes them", () =>
    Effect.gen(function* () {
      const repo = yield* ExerciseRepo
      const sql = yield* SqlClient.SqlClient
      const row = exercise({ id: "10000000-0000-4000-8000-000000000009", name: "Curl" })
      yield* repo.put(ownerA, [row])
      yield* repo.put(ownerA, [
        exercise({ id: row.id, name: "Hammer Curl", createdAt: t2, updatedAt: t2 }),
      ])
      const stored = yield* sql<{
        readonly name: string
        readonly createdAt: string
      }>`SELECT name, created_at FROM exercise WHERE id = ${row.id}`
      expect(stored).toEqual([{ name: "Hammer Curl", createdAt: "2026-10-19T08:00:00.000Z" }])
    }).pipe(Effect.provide(TestLayer)),
  )
})
