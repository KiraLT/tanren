import { describe, expect, it } from "@effect/vitest"
import {
  PushRequest,
  PushResponse,
  type SyncChange,
  SyncCursor,
  type SyncTable,
  UserId,
} from "@tanren/shared"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { TestClock } from "effect/testing"
import { ExerciseRepo } from "../repositories/Exercise"
import { SessionRepo } from "../repositories/Session"
import {
  exercise,
  plan,
  plannedSession,
  plannedSet,
  planWeek,
  session,
  TestLayer,
  t1,
  t2,
  workoutSet,
} from "../testing/fixtures"
import { SyncStore } from "./SyncStore"

const StoreLayer = SyncStore.layer.pipe(Layer.provideMerge(TestLayer))

const id = (n: number) => `50000000-0000-4000-8000-${n.toString().padStart(12, "0")}`
/** One user per test: pulls and the clock are per user. */
const userOf = (n: number) =>
  `00000000-0000-4000-8000-${(0x500 + n).toString(16).padStart(12, "0")}`
const now = "2026-10-21T00:00:00.000Z"
const at = (iso: string) => TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe(iso)))
const time = (iso: string) => DateTime.makeUnsafe(iso)
const ex = (row: ReturnType<typeof exercise>): SyncChange => ({ table: "exercise", row })

const clockOf = (userId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ readonly seq: number }>`SELECT seq FROM sync_clock
      WHERE user_id = ${userId}`
    return rows.map((row) => row.seq)
  })

const rowsOf = (userId: string, keys: ReadonlyArray<readonly [SyncTable, string]>) =>
  Effect.gen(function* () {
    const store = yield* SyncStore
    return yield* store.getRows(
      UserId.make(userId),
      keys.map(([table, rowId]) => ({ table, id: rowId })),
    )
  })

/** docs/design/data-model.md §10.4, verbatim. */
const example = {
  changes: [
    {
      table: "session",
      row: {
        id: "b3e7c0a2-5d1f-4a7b-8c9d-0e1f2a3b4c5d",
        userId: "6f1d2b7e-3c4a-4e2b-9a0e-1f2a3b4c5d6e",
        startedAt: "2026-10-19T17:02:11.000Z",
        finishedAt: null,
        plannedSessionId: "7c8d9e0f-1a2b-4c3d-9e4f-5a6b7c8d9e0f",
        notes: null,
        createdAt: "2026-10-19T17:02:11.000Z",
        updatedAt: "2026-10-19T17:02:11.000Z",
        deletedAt: null,
      },
    },
    {
      table: "set",
      row: {
        id: "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b",
        userId: "6f1d2b7e-3c4a-4e2b-9a0e-1f2a3b4c5d6e",
        sessionId: "b3e7c0a2-5d1f-4a7b-8c9d-0e1f2a3b4c5d",
        exerciseId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
        order: 0,
        weightKg: 102.5,
        reps: 5,
        rpe: 8.5,
        note: null,
        plannedSetId: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a",
        loggedAt: "2026-10-19T17:08:40.000Z",
        createdAt: "2026-10-19T17:08:40.000Z",
        updatedAt: "2026-10-19T17:08:40.000Z",
        deletedAt: null,
      },
    },
  ],
}

describe("SyncStore.apply", () => {
  it.effect("applies the §10.4 example push in one batch at one server_seq", () =>
    Effect.gen(function* () {
      yield* at("2026-10-19T17:09:12.418Z")
      const user = "6f1d2b7e-3c4a-4e2b-9a0e-1f2a3b4c5d6e"
      const owner = UserId.make(user)
      const squat = exercise({
        id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
        userId: user,
        name: "Back squat",
        aliases: ["squat"],
      })
      yield* (yield* ExerciseRepo).put(owner, [squat])
      const { changes } = Schema.decodeUnknownSync(PushRequest)(example)

      const result = yield* (yield* SyncStore).apply(owner, changes)

      expect(Schema.encodeSync(PushResponse)(result)).toEqual({
        accepted: [
          {
            table: "session",
            id: "b3e7c0a2-5d1f-4a7b-8c9d-0e1f2a3b4c5d",
            updatedAt: "2026-10-19T17:02:11.000Z",
          },
          {
            table: "set",
            id: "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b",
            updatedAt: "2026-10-19T17:08:40.000Z",
          },
        ],
        conflicts: [],
        rejected: [],
        serverTime: "2026-10-19T17:09:12.418Z",
      })
      expect(
        yield* rowsOf(user, [
          ["session", "b3e7c0a2-5d1f-4a7b-8c9d-0e1f2a3b4c5d"],
          ["set", "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b"],
        ]),
      ).toEqual(changes)
      const sql = yield* SqlClient.SqlClient
      const seqs = yield* sql<{ readonly serverSeq: number }>`
        SELECT server_seq FROM workout_session WHERE user_id = ${user}
        UNION ALL SELECT server_seq FROM workout_set WHERE user_id = ${user}`
      // The exercise put took seq 1; the whole push shares seq 2.
      expect(seqs.map((row) => row.serverSeq)).toEqual([2, 2])
      expect(yield* clockOf(user)).toEqual([2])
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("LWW: newer overwrites; older and equal updatedAt keep the server row", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(1)
      const owner = UserId.make(user)
      const store = yield* SyncStore
      const base = exercise({ id: id(10), userId: user, name: "Base", updatedAt: t2 })
      yield* store.apply(owner, [ex(base)])

      const older = exercise({ id: id(10), userId: user, name: "Older", updatedAt: t1 })
      const olderResult = yield* store.apply(owner, [ex(older)])
      expect(olderResult.accepted).toEqual([])
      expect(olderResult.conflicts).toEqual([ex(base)])

      const tie = exercise({ id: id(10), userId: user, name: "Tie", updatedAt: t2 })
      const tieResult = yield* store.apply(owner, [ex(tie)])
      expect(tieResult.accepted).toEqual([])
      expect(tieResult.conflicts).toEqual([ex(base)])
      expect(yield* rowsOf(user, [["exercise", id(10)]])).toEqual([ex(base)])

      const newerAt = "2026-10-20T09:00:00.000Z"
      const newer = exercise({ id: id(10), userId: user, name: "Newer", updatedAt: newerAt })
      const newerResult = yield* store.apply(owner, [ex(newer)])
      expect(newerResult.accepted).toEqual([
        { table: "exercise", id: id(10), updatedAt: time(newerAt) },
      ])
      expect(newerResult.conflicts).toEqual([])
      expect(yield* rowsOf(user, [["exercise", id(10)]])).toEqual([ex(newer)])
      // Rejected pushes do not write: one bump for base, one for newer.
      expect(yield* clockOf(user)).toEqual([2])
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("clamps updatedAt more than 5 minutes ahead of the server to serverTime", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(2)
      const future = exercise({
        id: id(11),
        userId: user,
        name: "Future",
        updatedAt: "2027-01-01T00:00:00.000Z",
      })
      const result = yield* (yield* SyncStore).apply(UserId.make(user), [ex(future)])
      expect(result.accepted).toEqual([{ table: "exercise", id: id(11), updatedAt: time(now) }])
      const [stored] = yield* rowsOf(user, [["exercise", id(11)]])
      expect(stored?.row.updatedAt).toEqual(time(now))
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("rejects foreign-user rows and foreign ids as forbidden without writing them", () =>
    Effect.gen(function* () {
      yield* at(now)
      const userA = userOf(3)
      const userB = userOf(4)
      const ownerB = UserId.make(userB)
      const theirs = exercise({ id: id(21), userId: userB, name: "Theirs" })
      yield* (yield* ExerciseRepo).put(ownerB, [theirs])

      const result = yield* (yield* SyncStore).apply(UserId.make(userA), [
        ex(exercise({ id: id(20), userId: userB, name: "Smuggled" })),
        ex(exercise({ id: id(21), userId: userA, name: "Hijack", updatedAt: t2 })),
      ])

      expect(result.accepted).toEqual([])
      expect(result.rejected.map((r) => [r.id, r.reason])).toEqual([
        [id(20), "forbidden"],
        [id(21), "forbidden"],
      ])
      expect(
        yield* rowsOf(userB, [
          ["exercise", id(20)],
          ["exercise", id(21)],
        ]),
      ).toEqual([ex(theirs)])
      expect(yield* clockOf(userA)).toEqual([])
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("reports missingParent, cascading to children, and writes nothing", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(5)
      const owner = UserId.make(user)
      const other = userOf(6)
      const store = yield* SyncStore
      yield* store.apply(owner, [ex(exercise({ id: id(30), userId: user, name: "Lift" }))])
      yield* (yield* SessionRepo).putSessions(UserId.make(other), [
        session({ id: id(34), userId: other }),
      ])
      const before = yield* clockOf(user)

      const result = yield* store.apply(owner, [
        {
          table: "plannedSet",
          row: plannedSet({
            id: id(33),
            userId: user,
            plannedSessionId: id(32),
            exerciseId: id(30),
          }),
        },
        {
          table: "plannedSession",
          row: plannedSession({ id: id(32), userId: user, planWeekId: id(31) }),
        },
        // The parent exists, but for another user.
        {
          table: "set",
          row: workoutSet({ id: id(35), userId: user, sessionId: id(34), exerciseId: id(30) }),
        },
      ])

      expect(result.accepted).toEqual([])
      expect(result.rejected.map((r) => [r.table, r.reason])).toEqual([
        ["plannedSession", "missingParent"],
        ["plannedSet", "missingParent"],
        ["set", "missingParent"],
      ])
      expect(
        yield* rowsOf(user, [
          ["plannedSession", id(32)],
          ["plannedSet", id(33)],
          ["set", id(35)],
        ]),
      ).toEqual([])
      expect(yield* clockOf(user)).toEqual(before)
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("accepts children whose parents come earlier in the same push, parents first", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(7)
      const u = { userId: user }
      const changes: ReadonlyArray<SyncChange> = [
        {
          table: "plannedSet",
          row: plannedSet({ id: id(44), plannedSessionId: id(43), exerciseId: id(40), ...u }),
        },
        { table: "plannedSession", row: plannedSession({ id: id(43), planWeekId: id(42), ...u }) },
        { table: "planWeek", row: planWeek({ id: id(42), planId: id(41), ...u }) },
        { table: "plan", row: plan({ id: id(41), ...u }) },
        ex(exercise({ id: id(40), name: "Parent lift", ...u })),
      ]
      const result = yield* (yield* SyncStore).apply(UserId.make(user), changes)
      expect(result.rejected).toEqual([])
      expect(result.accepted.map((a) => a.table)).toEqual([
        "exercise",
        "plan",
        "planWeek",
        "plannedSession",
        "plannedSet",
      ])
      expect(yield* clockOf(user)).toEqual([1])
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("rejects a changed immutable parent id", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(8)
      const owner = UserId.make(user)
      const u = { userId: user }
      const store = yield* SyncStore
      const original = workoutSet({ id: id(53), sessionId: id(51), exerciseId: id(50), ...u })
      yield* store.apply(owner, [
        ex(exercise({ id: id(50), name: "Immutable lift", ...u })),
        { table: "session", row: session({ id: id(51), ...u }) },
        { table: "session", row: session({ id: id(52), ...u }) },
        { table: "set", row: original },
      ])
      const moved = workoutSet({
        id: id(53),
        sessionId: id(52),
        exerciseId: id(50),
        updatedAt: t2,
        ...u,
      })
      const result = yield* store.apply(owner, [{ table: "set", row: moved }])
      expect(result.rejected.map((r) => r.reason)).toEqual(["immutableFieldChanged"])
      expect(yield* rowsOf(user, [["set", id(53)]])).toEqual([{ table: "set", row: original }])
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("is atomic: a failing statement aborts the whole push", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(9)
      // Two live exercises with one name violate the unique index on the second insert.
      const error = yield* Effect.flip(
        (yield* SyncStore).apply(UserId.make(user), [
          ex(exercise({ id: id(60), userId: user, name: "Twin" })),
          ex(exercise({ id: id(61), userId: user, name: "twin" })),
        ]),
      )
      expect(error._tag).toBe("PersistenceError")
      expect(
        yield* rowsOf(user, [
          ["exercise", id(60)],
          ["exercise", id(61)],
        ]),
      ).toEqual([])
      expect(yield* clockOf(user)).toEqual([])
    }).pipe(Effect.provide(StoreLayer)),
  )
})

describe("SyncStore.pull", () => {
  it.effect("pages by (server_seq, table rank, id) with cursor continuity and tombstones", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(10)
      const owner = UserId.make(user)
      const u = { userId: user }
      const store = yield* SyncStore
      const e1 = exercise({ id: id(70), name: "Pull one", ...u })
      const e2 = exercise({ id: id(71), name: "Pull two", ...u })
      const e3 = exercise({ id: id(72), name: "Pull three", ...u })
      const p = plan({ id: id(73), ...u })
      yield* store.apply(owner, [{ table: "plan", row: p }, ex(e3), ex(e1), ex(e2)])
      const e1Deleted = exercise({
        id: id(70),
        name: "Pull one",
        updatedAt: t2,
        deletedAt: t2,
        ...u,
      })
      const s = session({ id: id(74), ...u })
      const w = workoutSet({ id: id(75), sessionId: id(74), exerciseId: id(71), ...u })
      yield* store.apply(owner, [
        { table: "set", row: w },
        { table: "session", row: s },
        ex(e1Deleted),
      ])

      const first = yield* store.pull(owner, Option.none(), 1)
      expect(first.changes).toEqual([ex(e2)])
      expect(first.cursor).toBe(`1:1:${id(71)}`)
      expect(first.hasMore).toBe(true)

      const second = yield* store.pull(owner, Option.some(first.cursor), 4)
      expect(second.changes).toEqual([
        ex(e3),
        { table: "plan", row: p },
        ex(e1Deleted),
        { table: "session", row: s },
      ])
      expect(second.hasMore).toBe(true)
      expect(Option.isSome(second.changes[2]?.row.deletedAt ?? Option.none())).toBe(true)

      const third = yield* store.pull(owner, Option.some(second.cursor), 4)
      expect(third.changes).toEqual([{ table: "set", row: w }])
      expect(third.hasMore).toBe(false)

      const empty = yield* store.pull(owner, Option.some(third.cursor), 4)
      expect(empty).toEqual({ changes: [], cursor: third.cursor, hasMore: false })
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("fails with ValidationError on a cursor it did not issue", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        (yield* SyncStore).pull(
          UserId.make(userOf(11)),
          Option.some(SyncCursor.make("not-a-cursor")),
          10,
        ),
      )
      expect(error._tag).toBe("ValidationError")
    }).pipe(Effect.provide(StoreLayer)),
  )
})
