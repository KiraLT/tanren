import { describe, expect, it } from "@effect/vitest"
import {
  Profile,
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
  profile,
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

  it.effect("rejects a second change to the same row in one push and applies the first", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(12)
      const first = exercise({ id: id(80), userId: user, name: "First", updatedAt: t2 })
      // Older, so sorting by updatedAt alone would have put it first: input order decides.
      const second = exercise({ id: id(80), userId: user, name: "Second", updatedAt: t1 })

      const result = yield* (yield* SyncStore).apply(UserId.make(user), [ex(first), ex(second)])

      expect(result.accepted).toEqual([{ table: "exercise", id: id(80), updatedAt: time(t2) }])
      expect(result.rejected.map((r) => [r.table, r.id, r.reason])).toEqual([
        ["exercise", id(80), "invariantViolated"],
      ])
      expect(yield* rowsOf(user, [["exercise", id(80)]])).toEqual([ex(first)])
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("rejects a live name another live exercise of the user already holds in D1", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(40)
      const store = yield* SyncStore
      yield* store.apply(UserId.make(user), [
        ex(exercise({ id: id(300), userId: user, name: "Bench", aliases: [] })),
      ])

      const result = yield* store.apply(UserId.make(user), [
        ex(exercise({ id: id(301), userId: user, name: "BENCH", aliases: [] })),
        ex(exercise({ id: id(302), userId: user, name: "Row", aliases: [] })),
      ])

      expect(result.accepted.map((a) => a.id)).toEqual([id(302)])
      expect(result.rejected.map((r) => [r.id, r.reason])).toEqual([[id(301), "invariantViolated"]])
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("rejects a name taken by a rename accepted earlier in the same push", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(41)
      const store = yield* SyncStore
      yield* store.apply(UserId.make(user), [
        ex(exercise({ id: id(310), userId: user, name: "Deadlift", aliases: [] })),
      ])

      const result = yield* store.apply(UserId.make(user), [
        // The rename sorts first (older updatedAt), so "squat" is taken when the new row comes.
        ex(exercise({ id: id(311), userId: user, name: "squat", aliases: [], updatedAt: now })),
        ex(exercise({ id: id(310), userId: user, name: "Squat", aliases: [], updatedAt: t2 })),
      ])

      expect(result.accepted.map((a) => a.id)).toEqual([id(310)])
      expect(result.rejected.map((r) => [r.id, r.reason])).toEqual([[id(311), "invariantViolated"]])
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect(
    "rejects a second active plan and accepts one activated after the first is archived",
    () =>
      Effect.gen(function* () {
        yield* at(now)
        const user = userOf(43)
        const store = yield* SyncStore
        yield* store.apply(UserId.make(user), [
          { table: "plan", row: plan({ id: id(330), userId: user }) },
        ])

        const second = yield* store.apply(UserId.make(user), [
          { table: "plan", row: plan({ id: id(331), userId: user, updatedAt: t2 }) },
          ex(exercise({ id: id(332), userId: user, name: "Bystander" })),
        ])
        expect(second.accepted.map((a) => a.id)).toEqual([id(332)])
        expect(second.rejected.map((r) => [r.id, r.reason])).toEqual([
          [id(331), "invariantViolated"],
        ])

        const swap = yield* store.apply(UserId.make(user), [
          { table: "plan", row: plan({ id: id(333), userId: user, updatedAt: now }) },
          {
            table: "plan",
            row: plan({ id: id(330), userId: user, status: "archived", updatedAt: t2 }),
          },
        ])
        expect(swap.rejected).toEqual([])
        expect(swap.accepted.map((a) => a.id)).toEqual([id(330), id(333)])
      }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("rejects a second live week with the same start, but not over a deleted one", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(44)
      const store = yield* SyncStore
      const week = (
        n: number,
        weekStart: string,
        more: { updatedAt?: string; deletedAt?: string } = {},
      ) =>
        ({
          table: "planWeek",
          row: planWeek({ id: id(n), userId: user, planId: id(340), weekStart, ...more }),
        }) satisfies SyncChange
      yield* store.apply(UserId.make(user), [
        { table: "plan", row: plan({ id: id(340), userId: user }) },
        week(341, "2026-10-19"),
        week(342, "2026-10-26", { deletedAt: t1 }),
      ])

      const result = yield* store.apply(UserId.make(user), [
        week(343, "2026-10-19"), // held in D1 by 341
        week(344, "2026-10-26"), // 342 is soft-deleted: free
        week(345, "2026-10-26", { updatedAt: t2 }), // held by 344, accepted earlier in this push
      ])

      expect(result.accepted.map((a) => a.id)).toEqual([id(344)])
      expect(result.rejected.map((r) => [r.id, r.reason])).toEqual([
        [id(343), "invariantViolated"],
        [id(345), "invariantViolated"],
      ])
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("accepts re-upserts, a case-only self rename, and names freed by a soft delete", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(42)
      const store = yield* SyncStore
      yield* store.apply(UserId.make(user), [
        ex(exercise({ id: id(320), userId: user, name: "Curl", aliases: [] })),
        ex(exercise({ id: id(321), userId: user, name: "Press", aliases: [] })),
        ex(exercise({ id: id(322), userId: user, name: "Dip", aliases: [], deletedAt: t1 })),
      ])

      const result = yield* store.apply(UserId.make(user), [
        ex(exercise({ id: id(320), userId: user, name: "CURL", aliases: [], updatedAt: t2 })),
        // Already soft-deleted in D1: the partial index ignores it.
        ex(exercise({ id: id(323), userId: user, name: "dip", aliases: [], updatedAt: t2 })),
        // Deleted earlier in this push, so its name is free for the later row.
        ex(
          exercise({
            id: id(321),
            userId: user,
            name: "Press",
            aliases: [],
            updatedAt: t2,
            deletedAt: t2,
          }),
        ),
        ex(exercise({ id: id(324), userId: user, name: "press", aliases: [], updatedAt: now })),
      ])

      expect(result.rejected).toEqual([])
      expect(result.accepted.map((a) => a.id)).toEqual([id(320), id(323), id(321), id(324)])
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("rejects missing and foreign parents, cascading, and applies the rest", () =>
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
      yield* store.apply(UserId.make(other), [
        { table: "plan", row: plan({ id: id(37), userId: other }) },
      ])
      const bystander = exercise({ id: id(36), userId: user, name: "Bystander" })

      const result = yield* store.apply(owner, [
        ex(bystander),
        // Parent plan belongs to another user / does not exist.
        { table: "planWeek", row: planWeek({ id: id(38), userId: user, planId: id(37) }) },
        { table: "planWeek", row: planWeek({ id: id(39), userId: user, planId: id(29) }) },
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

      expect(result.accepted.map((a) => [a.table, a.id])).toEqual([["exercise", id(36)]])
      expect(result.rejected.map((r) => [r.table, r.reason])).toEqual([
        ["planWeek", "missingParent"],
        ["planWeek", "missingParent"],
        ["plannedSession", "missingParent"],
        ["plannedSet", "missingParent"],
        ["set", "missingParent"],
      ])
      expect(
        yield* rowsOf(user, [
          ["exercise", id(36)],
          ["planWeek", id(38)],
          ["planWeek", id(39)],
          ["plannedSession", id(32)],
          ["plannedSet", id(33)],
          ["set", id(35)],
        ]),
      ).toEqual([ex(bystander)])
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

  it.effect("rejects a new set under a tombstoned session as missingParent", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(30)
      const owner = UserId.make(user)
      const u = { userId: user }
      const store = yield* SyncStore
      yield* store.apply(owner, [
        ex(exercise({ id: id(90), name: "Tombstone lift", ...u })),
        { table: "session", row: session({ id: id(91), deletedAt: t1, ...u }) },
      ])
      const result = yield* store.apply(owner, [
        {
          table: "set",
          row: workoutSet({ id: id(92), sessionId: id(91), exerciseId: id(90), ...u }),
        },
      ])
      expect(result.accepted).toEqual([])
      expect(result.rejected.map((r) => [r.table, r.id, r.reason])).toEqual([
        ["set", id(92), "missingParent"],
      ])
      expect(yield* rowsOf(user, [["set", id(92)]])).toEqual([])
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("rejects a new plannedSet under a plannedSession tombstoned in the same push", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(31)
      const owner = UserId.make(user)
      const u = { userId: user }
      const store = yield* SyncStore
      yield* store.apply(owner, [
        ex(exercise({ id: id(93), name: "Planned tombstone lift", ...u })),
        { table: "plan", row: plan({ id: id(94), ...u }) },
        { table: "planWeek", row: planWeek({ id: id(95), planId: id(94), ...u }) },
        { table: "plannedSession", row: plannedSession({ id: id(96), planWeekId: id(95), ...u }) },
      ])
      const result = yield* store.apply(owner, [
        {
          table: "plannedSession",
          row: plannedSession({
            id: id(96),
            planWeekId: id(95),
            updatedAt: t2,
            deletedAt: t2,
            ...u,
          }),
        },
        {
          table: "plannedSet",
          row: plannedSet({ id: id(97), plannedSessionId: id(96), exerciseId: id(93), ...u }),
        },
        // A tombstone under the deleted owner still goes through (cascaded delete).
        {
          table: "plannedSet",
          row: plannedSet({
            id: id(98),
            plannedSessionId: id(96),
            exerciseId: id(93),
            deletedAt: t2,
            ...u,
          }),
        },
      ])
      expect(result.accepted.map((a) => [a.table, a.id])).toEqual([
        ["plannedSession", id(96)],
        ["plannedSet", id(98)],
      ])
      expect(result.rejected.map((r) => [r.table, r.id, r.reason])).toEqual([
        ["plannedSet", id(97), "missingParent"],
      ])
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("is atomic: a failing statement aborts the whole push", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(9)
      // `decide` pre-checks every constraint of the schema, so the failing statement comes from a
      // test-only trigger it cannot see: the plan insert (last in push order) aborts the batch.
      // DDL takes no bound parameters; `user` is a constant test UUID.
      yield* (yield* SqlClient.SqlClient).unsafe(
        `CREATE TRIGGER IF NOT EXISTS abort_plan_${id(60).slice(-4)} BEFORE INSERT ON plan
          WHEN NEW.user_id = '${user}' BEGIN SELECT RAISE(ABORT, 'boom'); END`,
      )
      const error = yield* Effect.flip(
        (yield* SyncStore).apply(UserId.make(user), [
          ex(exercise({ id: id(62), userId: user, name: "Bystander" })),
          { table: "plan", row: plan({ id: id(60), userId: user }) },
        ]),
      )
      expect(error._tag).toBe("PersistenceError")
      expect(
        yield* rowsOf(user, [
          ["exercise", id(62)],
          ["plan", id(60)],
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

  it.effect("round-trips a pushed profile with locations and an active one through pull", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(50)
      const owner = UserId.make(user)
      const store = yield* SyncStore
      const gym = { id: id(400), name: "Gym", equipment: ["barbell", "rack", "legPress"] }
      const home = { id: id(401), name: "Home", equipment: [] }
      // A wire push as a client sends it; a pre-v3 `equipment` key is an ignored excess key.
      const { changes } = Schema.decodeUnknownSync(PushRequest)({
        changes: [
          {
            table: "profile",
            row: {
              ...Schema.encodeSync(Profile)(profile({ id: user, userId: user })),
              equipment: [{ kind: "barbell", note: null }],
              locations: [gym, home],
              activeLocationId: home.id,
            },
          },
        ],
      })
      const pushed = yield* store.apply(owner, changes)
      expect(pushed.rejected).toEqual([])

      const pulled = yield* store.pull(owner, Option.none(), 10)
      expect(pulled.changes).toEqual(changes)
      const row = pulled.changes[0]?.row
      expect(row && "locations" in row ? row.locations.map((l) => l.name) : []).toEqual([
        "Gym",
        "Home",
      ])
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
