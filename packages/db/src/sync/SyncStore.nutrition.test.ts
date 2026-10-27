import { describe, expect, it } from "@effect/vitest"
import { FoodEntry, type FoodEntryEncoded, type SyncChange, UserId } from "@tanren/shared"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import { TestClock } from "effect/testing"
import { TestLayer, t1 } from "../testing/fixtures"
import { SyncStore } from "./SyncStore"

/**
 * Food entries (nutrition.md §2, migration 0008) through the sync push/pull rules: no parent,
 * synced both ways, and the denormalised totals must equal `totalsOf(items)`.
 */

const StoreLayer = SyncStore.layer.pipe(Layer.provideMerge(TestLayer))

const id = (n: number) => `70000000-0000-4000-8000-${n.toString().padStart(12, "0")}`
/** One user per test: pulls and the clock are per user. */
const userOf = (n: number) =>
  `00000000-0000-4000-8000-${(0x700 + n).toString(16).padStart(12, "0")}`
const setNow = TestClock.setTime(
  DateTime.toEpochMillis(DateTime.makeUnsafe("2026-10-27T13:00:00.000Z")),
)

const items = [
  {
    name: "Chicken rice bowl",
    portion: "1 bowl, ~450 g",
    grams: 450,
    kcal: 650,
    proteinG: 45,
    carbsG: 70,
    fatG: 15,
    fibreG: null,
    confidence: 0.6,
  },
  {
    name: "Olive oil",
    portion: "1 tbsp",
    grams: 14,
    kcal: 124,
    proteinG: 0,
    carbsG: 0,
    fatG: 14,
    fibreG: null,
    confidence: 0.9,
  },
]

const foodEntry = (
  overrides: Partial<FoodEntryEncoded> & Pick<FoodEntryEncoded, "id" | "userId">,
): SyncChange => ({
  table: "foodEntry",
  row: Schema.decodeUnknownSync(FoodEntry)({
    createdAt: t1,
    updatedAt: t1,
    deletedAt: null,
    loggedAt: "2026-10-27T12:40:00.000Z",
    meal: "lunch",
    source: "quick_add",
    items,
    kcal: 774,
    proteinG: 45,
    carbsG: 70,
    fatG: 29,
    note: null,
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

describe("SyncStore food entries", () => {
  it.effect("accepts an entry whose totals equal totalsOf(items) and pulls it back", () =>
    Effect.gen(function* () {
      yield* setNow
      const user = userOf(1)
      const store = yield* SyncStore
      const change = foodEntry({ id: id(1), userId: user })
      const result = yield* store.apply(UserId.make(user), [change])
      expect(outcome(result)).toEqual({ accepted: [["foodEntry", id(1)]], rejected: [] })
      const page = yield* store.pull(UserId.make(user), Option.none(), 10)
      expect(page.changes).toEqual([change])
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("rejects totals that differ from totalsOf(items) as invariantViolated", () =>
    Effect.gen(function* () {
      yield* setNow
      const user = userOf(2)
      const store = yield* SyncStore
      const result = yield* store.apply(UserId.make(user), [
        foodEntry({ id: id(10), userId: user, kcal: 650 }),
        foodEntry({ id: id(11), userId: user, fatG: 15 }),
        foodEntry({ id: id(12), userId: user }),
      ])
      expect(outcome(result)).toEqual({
        accepted: [["foodEntry", id(12)]],
        rejected: [
          ["foodEntry", "invariantViolated"],
          ["foodEntry", "invariantViolated"],
        ],
      })
    }).pipe(Effect.provide(StoreLayer)),
  )

  it.effect("rejects another user's entry as forbidden", () =>
    Effect.gen(function* () {
      yield* setNow
      const store = yield* SyncStore
      const result = yield* store.apply(UserId.make(userOf(3)), [
        foodEntry({ id: id(20), userId: userOf(4) }),
      ])
      expect(outcome(result)).toEqual({ accepted: [], rejected: [["foodEntry", "forbidden"]] })
    }).pipe(Effect.provide(StoreLayer)),
  )
})
