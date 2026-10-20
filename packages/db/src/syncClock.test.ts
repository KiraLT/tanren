import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { ExerciseRepo } from "./repositories"
import { exercise, TestLayer, userA, userB } from "./testing/fixtures"

const ownerA = UserId.make(userA)
const ownerB = UserId.make(userB)

const serverSeqs = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql<{
    readonly id: string
    readonly serverSeq: number
  }>`SELECT id, server_seq FROM exercise WHERE user_id = ${userA} ORDER BY id`
})

describe("sync clock", () => {
  it.effect("gives every row of a batch the same server_seq and later batches a higher one", () =>
    Effect.gen(function* () {
      const repo = yield* ExerciseRepo
      const a = exercise({ id: "20000000-0000-4000-8000-000000000001", name: "A" })
      const b = exercise({ id: "20000000-0000-4000-8000-000000000002", name: "B" })
      const c = exercise({ id: "20000000-0000-4000-8000-000000000003", name: "C" })
      yield* repo.put(ownerA, [a, b])
      yield* repo.put(ownerB, [
        exercise({ id: "20000000-0000-4000-8000-0000000000b1", userId: userB }),
      ])
      yield* repo.put(ownerA, [c])
      yield* repo.put(ownerA, [a])
      expect(yield* serverSeqs).toEqual([
        { id: a.id, serverSeq: 3 },
        { id: b.id, serverSeq: 1 },
        { id: c.id, serverSeq: 2 },
      ])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("does not advance the clock when a batch rolls back", () =>
    Effect.gen(function* () {
      const repo = yield* ExerciseRepo
      const sql = yield* SqlClient.SqlClient
      const before = yield* sql<{
        readonly seq: number
      }>`SELECT seq FROM sync_clock WHERE user_id = ${userA}`
      const dupes = [
        exercise({ id: "20000000-0000-4000-8000-000000000004", name: "Dup" }),
        exercise({ id: "20000000-0000-4000-8000-000000000005", name: "dup" }),
      ]
      yield* Effect.flip(repo.put(ownerA, dupes))
      const after = yield* sql<{
        readonly seq: number
      }>`SELECT seq FROM sync_clock WHERE user_id = ${userA}`
      expect(after).toEqual(before)
    }).pipe(Effect.provide(TestLayer)),
  )
})
