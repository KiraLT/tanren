import { describe, expect, it } from "@effect/vitest"
import {
  DailyHealth,
  FoodEntry,
  type FoodEntryEncoded,
  FoodEntryId,
  IdGenerator,
  LocalDate,
  UserId,
} from "@tanren/shared"
import { DateTime, Effect, Layer, Schema } from "effect"
import { TestClock } from "effect/testing"
import { SyncStore } from "../sync/SyncStore"
import { TestLayer, t1 } from "../testing/fixtures"
import { FoodEntryRepo } from "./FoodEntry"
import { GarminImportRepo } from "./GarminImport"

const RepoLayer = Layer.mergeAll(FoodEntryRepo.layer, GarminImportRepo.layer).pipe(
  Layer.provideMerge(SyncStore.layer),
  Layer.provideMerge(Layer.mergeAll(TestLayer, IdGenerator.layerTest)),
)

const id = (n: number) => `71000000-0000-4000-8000-${n.toString().padStart(12, "0")}`
/** One user per test: the D1 is shared by the file. */
const userOf = (n: number) =>
  UserId.make(`00000000-0000-4000-8000-${(0x710 + n).toString(16).padStart(12, "0")}`)
const setNow = TestClock.setTime(
  DateTime.toEpochMillis(DateTime.makeUnsafe("2026-10-27T13:00:00.000Z")),
)
const at = (iso: string) => DateTime.makeUnsafe(iso)

const items = [
  {
    name: "Chicken rice bowl",
    portion: "1 bowl",
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

const entry = (overrides: Partial<FoodEntryEncoded> & Pick<FoodEntryEncoded, "id" | "userId">) =>
  Schema.decodeUnknownSync(FoodEntry)({
    createdAt: t1,
    updatedAt: t1,
    deletedAt: null,
    loggedAt: "2026-10-27T12:00:00.000Z",
    meal: "lunch",
    source: "mcp",
    items,
    kcal: 774,
    proteinG: 45,
    carbsG: 70,
    fatG: 29,
    note: null,
    ...overrides,
  })

const range = { from: at("2026-10-27T00:00:00.000Z"), to: at("2026-10-28T00:00:00.000Z") }

describe("FoodEntryRepo", () => {
  it.effect("put then listRange round-trips items and totals", () =>
    Effect.gen(function* () {
      yield* setNow
      const user = userOf(1)
      const repo = yield* FoodEntryRepo
      const row = entry({ id: id(1), userId: user })
      yield* repo.put(user, [row])
      expect(yield* repo.listRange(user, range)).toEqual([row])
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("listRange includes a row at `from`, excludes one at `to`, ordered by loggedAt", () =>
    Effect.gen(function* () {
      yield* setNow
      const user = userOf(2)
      const repo = yield* FoodEntryRepo
      yield* repo.put(user, [
        entry({ id: id(21), userId: user, loggedAt: "2026-10-27T18:00:00.000Z" }),
        entry({ id: id(22), userId: user, loggedAt: "2026-10-27T00:00:00.000Z" }),
        entry({ id: id(23), userId: user, loggedAt: "2026-10-28T00:00:00.000Z" }),
      ])
      const listed = yield* repo.listRange(user, range)
      expect(listed.map((r) => r.id)).toEqual([id(22), id(21)])
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("listRange excludes tombstones", () =>
    Effect.gen(function* () {
      yield* setNow
      const user = userOf(3)
      const repo = yield* FoodEntryRepo
      yield* repo.put(user, [
        entry({ id: id(31), userId: user }),
        entry({ id: id(32), userId: user, deletedAt: t1 }),
      ])
      expect((yield* repo.listRange(user, range)).map((r) => r.id)).toEqual([id(31)])
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("softDelete returns true for a live row, then false, and the row leaves the list", () =>
    Effect.gen(function* () {
      yield* setNow
      const user = userOf(4)
      const repo = yield* FoodEntryRepo
      yield* repo.put(user, [entry({ id: id(41), userId: user })])
      expect(yield* repo.softDelete(user, FoodEntryId.make(id(41)))).toBe(true)
      expect(yield* repo.softDelete(user, FoodEntryId.make(id(41)))).toBe(false)
      expect(yield* repo.listRange(user, range)).toEqual([])
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("softDelete of another user's id is false and leaves the row live", () =>
    Effect.gen(function* () {
      yield* setNow
      const owner = userOf(5)
      const repo = yield* FoodEntryRepo
      yield* repo.put(owner, [entry({ id: id(51), userId: owner })])
      expect(yield* repo.softDelete(userOf(6), FoodEntryId.make(id(51)))).toBe(false)
      expect((yield* repo.listRange(owner, range)).length).toBe(1)
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("put of an id another user owns is Forbidden", () =>
    Effect.gen(function* () {
      yield* setNow
      const owner = userOf(7)
      const intruder = userOf(8)
      const repo = yield* FoodEntryRepo
      yield* repo.put(owner, [entry({ id: id(71), userId: owner })])
      const error = yield* Effect.flip(
        repo.put(intruder, [entry({ id: id(71), userId: intruder })]),
      )
      expect(error._tag).toBe("Forbidden")
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect(
    "put with totals unequal to totalsOf(items) is a PersistenceError naming the reason",
    () =>
      Effect.gen(function* () {
        yield* setNow
        const user = userOf(9)
        const repo = yield* FoodEntryRepo
        const error = yield* Effect.flip(
          repo.put(user, [entry({ id: id(91), userId: user, kcal: 800 })]),
        )
        expect(error).toMatchObject({
          _tag: "PersistenceError",
          operation: "foodEntry.put",
          cause: [expect.stringContaining(`invariantViolated ${id(91)}`)],
        })
        expect(yield* repo.listRange(user, range)).toEqual([])
      }).pipe(Effect.provide(RepoLayer)),
  )
})

const day = (user: UserId, n: number, date: string, deletedAt: string | null = null) =>
  Schema.decodeUnknownSync(DailyHealth)({
    id: id(n),
    userId: user,
    createdAt: t1,
    updatedAt: t1,
    deletedAt,
    provider: "garmin",
    date,
    totalCalories: 2500,
    activeCalories: 600,
    steps: 9000,
    restingHeartRate: 52,
  })

describe("GarminImportRepo.listDays", () => {
  it.effect("returns live days with date in [from, to], both ends included, by date", () =>
    Effect.gen(function* () {
      yield* setNow
      const user = userOf(10)
      const store = yield* SyncStore
      yield* store.apply(user, [
        { table: "dailyHealth", row: day(user, 101, "2026-10-21") },
        { table: "dailyHealth", row: day(user, 102, "2026-10-27") },
        { table: "dailyHealth", row: day(user, 103, "2026-10-22") },
        { table: "dailyHealth", row: day(user, 104, "2026-10-28") },
        { table: "dailyHealth", row: day(user, 105, "2026-10-24", t1) },
      ])
      const days = yield* (yield* GarminImportRepo).listDays(
        user,
        LocalDate.make("2026-10-22"),
        LocalDate.make("2026-10-27"),
      )
      expect(days.map((d) => d.date)).toEqual(["2026-10-22", "2026-10-27"])
    }).pipe(Effect.provide(RepoLayer)),
  )
})
