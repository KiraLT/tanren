import { describe, expect, it } from "@effect/vitest"
import {
  ProgramDayCompletion,
  type ProgramDayCompletionEncoded,
  ProgramEnrollment,
  type ProgramEnrollmentEncoded,
  type SyncChange,
  UserId,
} from "@tanren/shared"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import { TestClock } from "effect/testing"
import { TestLayer, t1, t2 } from "../testing/fixtures"
import { SyncStore } from "./SyncStore"

/** Program progress tables (migration 0002, v2-programs.md §2) through the sync push/pull rules. */

const StoreLayer = SyncStore.layer.pipe(Layer.provideMerge(TestLayer))

const id = (n: number) => `60000000-0000-4000-8000-${n.toString().padStart(12, "0")}`
/** One user per test: pulls and the clock are per user. */
const userOf = (n: number) =>
  `00000000-0000-4000-8000-${(0x600 + n).toString(16).padStart(12, "0")}`
const setNow = TestClock.setTime(
  DateTime.toEpochMillis(DateTime.makeUnsafe("2026-10-21T00:00:00.000Z")),
)

const enrollment = (
  overrides: Partial<ProgramEnrollmentEncoded> & Pick<ProgramEnrollmentEncoded, "id" | "userId">,
): SyncChange => ({
  table: "programEnrollment",
  row: Schema.decodeUnknownSync(ProgramEnrollment)({
    createdAt: t1,
    updatedAt: t1,
    deletedAt: null,
    programId: "core-30",
    startedOn: "2026-10-19",
    status: "active",
    currentDay: 1,
    ...overrides,
  }),
})

const completion = (
  overrides: Partial<ProgramDayCompletionEncoded> &
    Pick<ProgramDayCompletionEncoded, "id" | "userId" | "enrollmentId">,
): SyncChange => ({
  table: "programDayCompletion",
  row: Schema.decodeUnknownSync(ProgramDayCompletion)({
    createdAt: t1,
    updatedAt: t1,
    deletedAt: null,
    dayNumber: 1,
    completedAt: t1,
    durationSeconds: 900,
    sessionId: null,
    ...overrides,
  }),
})

const outcome = (result: {
  readonly accepted: ReadonlyArray<{ readonly table: string; readonly id: string }>
  readonly rejected: ReadonlyArray<{ readonly table: string; readonly reason: string }>
}) => ({
  accepted: result.accepted.map((a) => [a.table, a.id]),
  rejected: result.rejected.map((r) => [r.table, r.reason]),
})

describe("SyncStore program tables", () => {
  it.effect("rejects a completion without its enrollment as missingParent", () =>
    Effect.gen(function* () {
      yield* setNow
      const user = userOf(1)
      const store = yield* SyncStore
      const result = yield* store.apply(UserId.make(user), [
        completion({ id: id(1), userId: user, enrollmentId: id(2) }),
      ])
      expect(outcome(result)).toEqual({
        accepted: [],
        rejected: [["programDayCompletion", "missingParent"]],
      })
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("accepts an enrollment and its completion in one push, and pulls both back", () =>
    Effect.gen(function* () {
      yield* setNow
      const user = userOf(2)
      const store = yield* SyncStore
      // Request order is child first: the store applies parents first (SYNC_TABLE_ORDER).
      const changes = [
        completion({ id: id(11), userId: user, enrollmentId: id(10), sessionId: id(12) }),
        enrollment({ id: id(10), userId: user }),
      ]
      const result = yield* store.apply(UserId.make(user), changes)
      expect(outcome(result)).toEqual({
        accepted: [
          ["programEnrollment", id(10)],
          ["programDayCompletion", id(11)],
        ],
        rejected: [],
      })
      const page = yield* store.pull(UserId.make(user), Option.none(), 10)
      expect(page.changes).toEqual([changes[1], changes[0]])
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect(
    "rejects a second live active enrollment for the same program as invariantViolated",
    () =>
      Effect.gen(function* () {
        yield* setNow
        const user = userOf(3)
        const store = yield* SyncStore
        yield* store.apply(UserId.make(user), [enrollment({ id: id(20), userId: user })])
        const result = yield* store.apply(UserId.make(user), [
          enrollment({ id: id(21), userId: user }),
          enrollment({ id: id(22), userId: user, programId: "other-program" }),
          enrollment({ id: id(23), userId: user, status: "abandoned" }),
        ])
        expect(outcome(result)).toEqual({
          accepted: [
            ["programEnrollment", id(22)],
            ["programEnrollment", id(23)],
          ],
          rejected: [["programEnrollment", "invariantViolated"]],
        })
      }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("rejects a second live completion of the same day as invariantViolated", () =>
    Effect.gen(function* () {
      yield* setNow
      const user = userOf(4)
      const store = yield* SyncStore
      yield* store.apply(UserId.make(user), [
        enrollment({ id: id(30), userId: user }),
        completion({ id: id(31), userId: user, enrollmentId: id(30) }),
      ])
      const result = yield* store.apply(UserId.make(user), [
        completion({ id: id(32), userId: user, enrollmentId: id(30) }),
        completion({ id: id(33), userId: user, enrollmentId: id(30), dayNumber: 2 }),
      ])
      expect(outcome(result)).toEqual({
        accepted: [["programDayCompletion", id(33)]],
        rejected: [["programDayCompletion", "invariantViolated"]],
      })
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("rejects moving a completion to another enrollment as immutableFieldChanged", () =>
    Effect.gen(function* () {
      yield* setNow
      const user = userOf(5)
      const store = yield* SyncStore
      yield* store.apply(UserId.make(user), [
        enrollment({ id: id(40), userId: user }),
        enrollment({ id: id(41), userId: user, programId: "other-program" }),
        completion({ id: id(42), userId: user, enrollmentId: id(40) }),
      ])
      const result = yield* store.apply(UserId.make(user), [
        completion({ id: id(42), userId: user, enrollmentId: id(41), updatedAt: t2 }),
      ])
      expect(outcome(result)).toEqual({
        accepted: [],
        rejected: [["programDayCompletion", "immutableFieldChanged"]],
      })
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("keeps the stored programId and startedOn when a newer enrollment changes them", () =>
    Effect.gen(function* () {
      yield* setNow
      const user = userOf(6)
      const store = yield* SyncStore
      yield* store.apply(UserId.make(user), [enrollment({ id: id(50), userId: user })])
      const result = yield* store.apply(UserId.make(user), [
        enrollment({
          id: id(50),
          userId: user,
          updatedAt: t2,
          programId: "other-program",
          startedOn: "2026-10-20",
          currentDay: 2,
        }),
      ])
      expect(outcome(result).accepted).toEqual([["programEnrollment", id(50)]])
      const [stored] = yield* store.getRows(UserId.make(user), [
        { table: "programEnrollment", id: id(50) },
      ])
      expect(stored?.table === "programEnrollment" && stored.row).toMatchObject({
        programId: "core-30",
        startedOn: "2026-10-19",
        currentDay: 2,
      })
    }).pipe(Effect.provide(StoreLayer)),
  )
})
