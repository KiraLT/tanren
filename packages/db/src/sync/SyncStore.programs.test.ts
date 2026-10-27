import { describe, expect, it } from "@effect/vitest"
import {
  ProgramEnrollment,
  type ProgramEnrollmentEncoded,
  type SyncChange,
  UserId,
  UserProgram,
  type UserProgramEncoded,
} from "@tanren/shared"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import { TestClock } from "effect/testing"
import { TestLayer, t1 } from "../testing/fixtures"
import { SyncStore } from "./SyncStore"

/**
 * User programs (programs-mcp.md §2, migration 0009) through the sync push/pull rules: no parent,
 * `slug` unique per user among live rows, `slug` / `source` immutable; enrollments carry `swaps`.
 */

const StoreLayer = SyncStore.layer.pipe(Layer.provideMerge(TestLayer))

const id = (n: number) => `90000000-0000-4000-8000-${n.toString().padStart(12, "0")}`
/** One user per test: pulls and the clock are per user. */
const userOf = (n: number) =>
  `00000000-0000-4000-8000-${(0x900 + n).toString(16).padStart(12, "0")}`
const setNow = TestClock.setTime(
  DateTime.toEpochMillis(DateTime.makeUnsafe("2026-10-27T13:00:00.000Z")),
)
const t2 = "2026-10-27T12:00:00.000Z"

const program = (
  overrides: Partial<UserProgramEncoded> & Pick<UserProgramEncoded, "id" | "userId">,
): SyncChange => ({
  table: "program",
  row: Schema.decodeUnknownSync(UserProgram)({
    createdAt: t1,
    updatedAt: t1,
    deletedAt: null,
    title: "Push Pull",
    slug: "push-pull",
    summary: "Two days a week.",
    description: null,
    days: [
      {
        dayNumber: 1,
        title: "Day 1",
        rounds: 2,
        items: [{ kind: "reps", catalogId: "push-up", reps: 10, restSeconds: 30 }],
        restBetweenRoundsSeconds: 60,
      },
    ],
    schedule: { kind: "daysPerWeek", days: 2 },
    source: "mcp",
    version: 1,
    ...overrides,
  }),
})

const enrollment = (
  overrides: Partial<ProgramEnrollmentEncoded> & Pick<ProgramEnrollmentEncoded, "id" | "userId">,
): SyncChange => ({
  table: "programEnrollment",
  row: Schema.decodeUnknownSync(ProgramEnrollment)({
    createdAt: t1,
    updatedAt: t1,
    deletedAt: null,
    programId: "core-30",
    startedOn: "2026-10-20",
    status: "active",
    currentDay: 2,
    swaps: [],
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

describe("SyncStore programs", () => {
  it.effect("accepts a program row and pulls it back", () =>
    Effect.gen(function* () {
      yield* setNow
      const user = userOf(1)
      const store = yield* SyncStore
      const change = program({ id: id(1), userId: user })
      const result = yield* store.apply(UserId.make(user), [change])
      expect(outcome(result)).toEqual({ accepted: [["program", id(1)]], rejected: [] })
      const page = yield* store.pull(UserId.make(user), Option.none(), 10)
      expect(page.changes).toEqual([change])
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("rejects a second live row with the same slug as invariantViolated", () =>
    Effect.gen(function* () {
      yield* setNow
      const user = userOf(2)
      const store = yield* SyncStore
      yield* store.apply(UserId.make(user), [program({ id: id(10), userId: user })])
      const result = yield* store.apply(UserId.make(user), [
        program({ id: id(11), userId: user }),
        program({ id: id(12), userId: user, slug: "other-slug" }),
      ])
      expect(outcome(result)).toEqual({
        accepted: [["program", id(12)]],
        rejected: [["program", "invariantViolated"]],
      })
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("rejects a changed slug or source as immutableFieldChanged", () =>
    Effect.gen(function* () {
      yield* setNow
      const user = userOf(3)
      const store = yield* SyncStore
      yield* store.apply(UserId.make(user), [
        program({ id: id(20), userId: user, slug: "first" }),
        program({ id: id(21), userId: user, slug: "second" }),
      ])
      const result = yield* store.apply(UserId.make(user), [
        program({ id: id(20), userId: user, slug: "renamed", updatedAt: t2 }),
        program({ id: id(21), userId: user, slug: "second", source: "manual", updatedAt: t2 }),
      ])
      expect(outcome(result)).toEqual({
        accepted: [],
        rejected: [
          ["program", "immutableFieldChanged"],
          ["program", "immutableFieldChanged"],
        ],
      })
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("round-trips an enrollment's swaps through the JSON column", () =>
    Effect.gen(function* () {
      yield* setNow
      const user = userOf(4)
      const store = yield* SyncStore
      const change = enrollment({
        id: id(30),
        userId: user,
        swaps: [{ from: "push-up", to: "incline-push-up" }],
      })
      const result = yield* store.apply(UserId.make(user), [change])
      expect(outcome(result)).toEqual({ accepted: [["programEnrollment", id(30)]], rejected: [] })
      const page = yield* store.pull(UserId.make(user), Option.none(), 10)
      expect(page.changes).toEqual([change])
    }).pipe(Effect.provide(StoreLayer)),
  )
})
