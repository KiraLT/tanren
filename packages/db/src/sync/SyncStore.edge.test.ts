import { describe, expect, it } from "@effect/vitest"
import { PullRequest, PushRequest, type SyncChange, SyncCursor, UserId } from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Layer, Option, Order, Result, Schema } from "effect"
import { TestClock } from "effect/testing"
import {
  exercise as baseExercise,
  session,
  TestLayer,
  t1,
  t2,
  workoutSet,
} from "../testing/fixtures"
import { SyncStore } from "./SyncStore"

const StoreLayer = SyncStore.layer.pipe(Layer.provideMerge(TestLayer))

const id = (n: number) => `51000000-0000-4000-8000-${n.toString().padStart(12, "0")}`
const userOf = (n: number) =>
  `00000000-0000-4000-8000-${(0x700 + n).toString(16).padStart(12, "0")}`
const now = "2026-10-21T00:00:00.000Z"
const time = (iso: string) => DateTime.makeUnsafe(iso)
const at = (iso: string) => TestClock.setTime(DateTime.toEpochMillis(time(iso)))
/** Names default to the id: live names are unique per user (case-insensitive) in D1. */
const exercise = (overrides: Parameters<typeof baseExercise>[0]) =>
  baseExercise({ name: `Ex ${overrides.id}`, ...overrides })
const ex = (row: ReturnType<typeof exercise>): SyncChange => ({ table: "exercise", row })
const plus = (iso: string, ms: number) =>
  DateTime.formatIso(DateTime.add(time(iso), { milliseconds: ms }))

describe("SyncStore.apply edges", () => {
  it.effect("clamp boundary: exactly now+5min is kept, +1ms is clamped to now", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(1)
      const owner = UserId.make(user)
      const store = yield* SyncStore
      const edge = plus(now, 5 * 60 * 1000)
      const kept = yield* store.apply(owner, [
        ex(exercise({ id: id(1), userId: user, updatedAt: edge })),
      ])
      expect(kept.accepted.map((a) => DateTime.formatIso(a.updatedAt))).toEqual([edge])
      const over = yield* store.apply(owner, [
        ex(exercise({ id: id(2), userId: user, updatedAt: plus(edge, 1) })),
      ])
      expect(over.accepted.map((a) => DateTime.formatIso(a.updatedAt))).toEqual([now])
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("a far-future update after a clamped write ties and loses (no endless overwrite)", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(2)
      const owner = UserId.make(user)
      const store = yield* SyncStore
      const far = "2030-01-01T00:00:00.000Z"
      yield* store.apply(owner, [
        ex(exercise({ id: id(3), userId: user, name: "A", updatedAt: far })),
      ])
      const again = yield* store.apply(owner, [
        ex(exercise({ id: id(3), userId: user, name: "B", updatedAt: far })),
      ])
      expect(again.accepted).toEqual([])
      expect(again.conflicts).toHaveLength(1)
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect(
    "a batch mixing accepted, foreign and conflicting rows of one table splits correctly",
    () =>
      Effect.gen(function* () {
        yield* at(now)
        const a = userOf(3)
        const b = userOf(4)
        const store = yield* SyncStore
        yield* store.apply(UserId.make(b), [ex(exercise({ id: id(10), userId: b }))])
        yield* store.apply(UserId.make(a), [ex(exercise({ id: id(11), userId: a, updatedAt: t2 }))])
        const result = yield* store.apply(UserId.make(a), [
          ex(exercise({ id: id(12), userId: a })), // new: accepted
          ex(exercise({ id: id(10), userId: a })), // id taken by B: forbidden
          ex(exercise({ id: id(13), userId: b })), // wrong userId: forbidden
          ex(exercise({ id: id(11), userId: a, updatedAt: t1 })), // older: conflict
        ])
        expect(result.accepted.map((x) => x.id)).toEqual([id(12)])
        expect(result.rejected.map((x) => [x.id, x.reason])).toEqual([
          [id(10), "forbidden"],
          [id(13), "forbidden"],
        ])
        expect(result.conflicts.map((c) => c.row.id)).toEqual([id(11)])
        // B's row is untouched.
        const bRows = yield* store.getRows(UserId.make(b), [{ table: "exercise", id: id(10) }])
        expect(bRows).toHaveLength(1)
      }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("tombstone then re-upsert: newer revives, older loses to the tombstone", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(5)
      const owner = UserId.make(user)
      const store = yield* SyncStore
      yield* store.apply(owner, [ex(exercise({ id: id(20), userId: user, updatedAt: t1 }))])
      const dead = exercise({
        id: id(20),
        userId: user,
        updatedAt: t2,
        deletedAt: "2026-10-20T08:00:00.000Z",
      })
      yield* store.apply(owner, [ex(dead)])
      const older = yield* store.apply(owner, [
        ex(
          exercise({
            id: id(20),
            userId: user,
            name: "Zombie",
            updatedAt: "2026-10-19T12:00:00.000Z",
          }),
        ),
      ])
      expect(older.accepted).toEqual([])
      expect(older.conflicts.map((c) => Option.isSome(c.row.deletedAt))).toEqual([true])
      const revived = yield* store.apply(owner, [
        ex(
          exercise({
            id: id(20),
            userId: user,
            name: "Back",
            updatedAt: "2026-10-20T09:00:00.000Z",
          }),
        ),
      ])
      expect(revived.accepted).toHaveLength(1)
      const [row] = yield* store.getRows(owner, [{ table: "exercise", id: id(20) }])
      expect(row?.row.deletedAt).toEqual(Option.none())
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("a set whose session belongs to another user is missingParent", () =>
    Effect.gen(function* () {
      yield* at(now)
      const a = userOf(6)
      const b = userOf(7)
      const store = yield* SyncStore
      yield* store.apply(UserId.make(b), [
        ex(exercise({ id: id(30), userId: b })),
        { table: "session", row: session({ id: id(31), userId: b }) },
      ])
      const result = yield* store.apply(UserId.make(a), [
        ex(exercise({ id: id(32), userId: a })),
        {
          table: "set",
          row: workoutSet({ id: id(33), userId: a, sessionId: id(31), exerciseId: id(32) }),
        },
      ])
      expect(result.rejected.map((r) => [r.id, r.reason])).toEqual([[id(33), "missingParent"]])
      expect(result.accepted.map((x) => x.id)).toEqual([id(32)])
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect(
    "a set tied to a session id that is rejected as forbidden in the same push is missingParent",
    () =>
      Effect.gen(function* () {
        yield* at(now)
        const a = userOf(8)
        const b = userOf(9)
        const store = yield* SyncStore
        yield* store.apply(UserId.make(b), [
          { table: "session", row: session({ id: id(40), userId: b }) },
        ])
        const result = yield* store.apply(UserId.make(a), [
          ex(exercise({ id: id(41), userId: a })),
          { table: "session", row: session({ id: id(40), userId: a }) },
          {
            table: "set",
            row: workoutSet({ id: id(42), userId: a, sessionId: id(40), exerciseId: id(41) }),
          },
        ])
        expect(result.rejected.map((r) => [r.id, r.reason])).toEqual([
          [id(40), "forbidden"],
          [id(42), "missingParent"],
        ])
      }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect(
    "Label boundary: 80 characters round-trip, 81 and untrimmed fail decoding with a typed error",
    () =>
      Effect.gen(function* () {
        yield* at(now)
        const user = userOf(10)
        const owner = UserId.make(user)
        const store = yield* SyncStore
        const wire = (name: string) => ({
          changes: [
            {
              table: "exercise",
              row: {
                id: id(50),
                userId: user,
                createdAt: t1,
                updatedAt: t1,
                deletedAt: null,
                name,
                aliases: [],
                muscleGroups: [],
                notes: null,
              },
            },
          ],
        })
        const decode = Schema.decodeUnknownEffect(PushRequest)
        const long = yield* decode(wire("é".repeat(80)))
        const pushed = yield* store.apply(owner, long.changes)
        expect(pushed.accepted).toHaveLength(1)
        const [stored] = yield* store.getRows(owner, [{ table: "exercise", id: id(50) }])
        expect(stored?.table === "exercise" && stored.row.name).toBe("é".repeat(80))
        yield* Effect.forEach(["x".repeat(81), " x", "", "x ".repeat(3)], (bad) =>
          Effect.gen(function* () {
            expect(Result.isFailure(yield* Effect.result(decode(wire(bad))))).toBe(true)
          }),
        )
      }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("a duplicate (table, id) in one push is invariantViolated, first wins", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(11)
      const store = yield* SyncStore
      const result = yield* store.apply(UserId.make(user), [
        ex(exercise({ id: id(60), userId: user, name: "First", updatedAt: t1 })),
        ex(exercise({ id: id(60), userId: user, name: "Second", updatedAt: t2 })),
      ])
      expect(result.accepted).toHaveLength(1)
      expect(result.rejected.map((r) => r.reason)).toEqual(["invariantViolated"])
      const [row] = yield* store.getRows(UserId.make(user), [{ table: "exercise", id: id(60) }])
      expect(row?.table === "exercise" && row.row.name).toBe("First")
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("an empty push writes nothing and answers empty lists", () =>
    Effect.gen(function* () {
      yield* at(now)
      const result = yield* (yield* SyncStore).apply(UserId.make(userOf(12)), [])
      expect([result.accepted, result.conflicts, result.rejected]).toEqual([[], [], []])
    }).pipe(Effect.provide(StoreLayer)),
  )
})

describe("SyncStore.pull edges", () => {
  /** Pulls pages of `limit` from `since` until `hasMore` is false (bounded at 100 pages). */
  const drain = (
    user: string,
    limit: number,
    since: Option.Option<SyncCursor> = Option.none(),
    seen: ReadonlyArray<string> = [],
    depth = 0,
  ): Effect.Effect<ReadonlyArray<string>, unknown, SyncStore> =>
    Effect.gen(function* () {
      const page = yield* (yield* SyncStore).pull(UserId.make(user), since, limit)
      expect(page.changes.length).toBeLessThanOrEqual(limit)
      const all = [...seen, ...page.changes.map((c) => `${c.table}:${c.row.id}`)]
      return page.hasMore && depth < 100
        ? yield* drain(user, limit, Option.some(page.cursor), all, depth + 1)
        : all
    })

  it.effect(
    "paging across one server_seq shared by many rows and tables never skips or repeats",
    () =>
      Effect.gen(function* () {
        yield* at(now)
        const user = userOf(20)
        const store = yield* SyncStore
        const changes: ReadonlyArray<SyncChange> = [
          ...[1, 2, 3, 4].map((n) => ex(exercise({ id: id(100 + n), userId: user }))),
          { table: "session", row: session({ id: id(110), userId: user }) },
          {
            table: "set",
            row: workoutSet({ id: id(111), userId: user, sessionId: id(110), exerciseId: id(101) }),
          },
          {
            table: "set",
            row: workoutSet({ id: id(112), userId: user, sessionId: id(110), exerciseId: id(102) }),
          },
        ]
        yield* store.apply(UserId.make(user), changes)
        const expected = Arr.sort(
          changes.map((c) => `${c.table}:${c.row.id}`),
          Order.String,
        )
        yield* Effect.forEach([1, 2, 3, 6, 7, 8, 500], (limit) =>
          Effect.gen(function* () {
            const seen = yield* drain(user, limit)
            expect(Arr.sort(seen, Order.String), `limit ${limit}`).toEqual(expected)
            expect(new Set(seen).size, `limit ${limit} duplicates`).toBe(seen.length)
          }),
        )
      }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("limit equal to the row count reports hasMore false; one less reports true", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(21)
      const store = yield* SyncStore
      yield* store.apply(
        UserId.make(user),
        [1, 2, 3].map((n) => ex(exercise({ id: id(120 + n), userId: user }))),
      )
      const exact = yield* store.pull(UserId.make(user), Option.none(), 3)
      expect([exact.changes.length, exact.hasMore]).toEqual([3, false])
      const less = yield* store.pull(UserId.make(user), Option.none(), 2)
      expect([less.changes.length, less.hasMore]).toEqual([2, true])
      const tail = yield* store.pull(UserId.make(user), Option.some(exact.cursor), 3)
      expect([tail.changes.length, tail.hasMore, tail.cursor]).toEqual([0, false, exact.cursor])
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("a pull for a user with no rows is empty and keeps a decodable cursor", () =>
    Effect.gen(function* () {
      const store = yield* SyncStore
      const page = yield* store.pull(UserId.make(userOf(22)), Option.none(), 5)
      expect([page.changes, page.hasMore]).toEqual([[], false])
      const next = yield* store.pull(UserId.make(userOf(22)), Option.some(page.cursor), 5)
      expect(next.changes).toEqual([])
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("malformed cursors fail with a typed ValidationError, never throw", () =>
    Effect.gen(function* () {
      const store = yield* SyncStore
      const bad = [
        "garbage",
        "1:2",
        "1:9:-x",
        "-1:0:-",
        `1:0:${"g".repeat(36)}`,
        "99999999999999999999:0:-",
        // Ranks 10 and 11 are real since GM-2 (importedActivity, dailyHealth); past the last is not.
        "1:12:-",
        "1:100:-",
      ]
      yield* Effect.forEach(bad, (raw) =>
        Effect.gen(function* () {
          const result = yield* Effect.result(
            store.pull(UserId.make(userOf(23)), Option.some(SyncCursor.make(raw)), 5),
          )
          expect(Result.isFailure(result) && result.failure._tag, raw).toBe("ValidationError")
        }),
      )
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect(
    "a well-formed cursor with rank beyond the table list or a huge seq pages empty without error",
    () =>
      Effect.gen(function* () {
        const store = yield* SyncStore
        const huge = yield* store.pull(
          UserId.make(userOf(24)),
          Option.some(SyncCursor.make("999999999999999:7:-")),
          5,
        )
        expect(huge.changes).toEqual([])
      }).pipe(Effect.provide(StoreLayer)),
  )

  it("PullRequest rejects limit 0, -1, 501 and 1.5 and a blank cursor", () => {
    expect(() => Schema.decodeUnknownSync(PullRequest)({ since: null, limit: 0 })).toThrow()
    expect(() => Schema.decodeUnknownSync(PullRequest)({ since: null, limit: -1 })).toThrow()
    expect(() => Schema.decodeUnknownSync(PullRequest)({ since: null, limit: 501 })).toThrow()
    expect(() => Schema.decodeUnknownSync(PullRequest)({ since: null, limit: 1.5 })).toThrow()
    expect(() => Schema.decodeUnknownSync(PullRequest)({ since: "", limit: 1 })).toThrow()
    expect(() => Schema.decodeUnknownSync(PullRequest)({ since: " a", limit: 1 })).toThrow()
    expect(Schema.decodeUnknownSync(PullRequest)({ since: null, limit: 500 }).limit).toBe(500)
  })
})

describe("SyncStore.apply defects", () => {
  it.effect("a name collision rejects only the colliding change, not the whole push", () =>
    Effect.gen(function* () {
      yield* at(now)
      const user = userOf(30)
      const store = yield* SyncStore
      const result = yield* store.apply(UserId.make(user), [
        ex(exercise({ id: id(200), userId: user, name: "Bench", aliases: [] })),
        ex(exercise({ id: id(201), userId: user, name: "bench", aliases: [] })),
        ex(exercise({ id: id(202), userId: user, name: "Row", aliases: [] })),
      ])
      expect(result.accepted.map((a) => a.id)).toContain(id(202))
      expect(result.rejected.map((r) => r.id)).toEqual([id(201)])
    }).pipe(Effect.provide(StoreLayer)),
  )
})
