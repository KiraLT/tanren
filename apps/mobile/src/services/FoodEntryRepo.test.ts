import { describe, expect, it } from "@effect/vitest"
import { FoodEntryId, type FoodItem, IdGenerator, totalsOf } from "@tanren/shared"
import { DateTime, Effect, Layer, Option, Ref } from "effect"
import { TestClock } from "effect/testing"
import { LOCAL_USER_ID } from "../store/localUser"
import { CurrentUser } from "./CurrentUser"
import { type FoodEntryDraft, FoodEntryRepo, flipAndSync } from "./FoodEntryRepo"
import { LocalStore } from "./LocalStore"
import { StoreError } from "./SqlDriver"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"

const TestLayer = FoodEntryRepo.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      LocalStore.layerNoDeps.pipe(
        Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
      ),
      CurrentUser.layerTest(Option.none()),
      IdGenerator.layerTest,
    ),
  ),
)

const FailingLayer = FoodEntryRepo.layer.pipe(
  Layer.provide(
    Layer.mergeAll(
      Layer.succeed(
        LocalStore,
        LocalStore.of({
          all: () => Effect.fail(new StoreError({ cause: "boom" })),
          write: () => Effect.fail(new StoreError({ cause: "boom" })),
        }),
      ),
      CurrentUser.layerTest(Option.none()),
      IdGenerator.layerTest,
    ),
  ),
)

const at = (iso: string) => DateTime.makeUnsafe(iso)

const item = (name: string, kcal: number, proteinG: number): FoodItem => ({
  name,
  portion: "1 bowl",
  grams: Option.none(),
  kcal,
  proteinG,
  carbsG: 10.04,
  fatG: 2.5,
  fibreG: Option.none(),
  confidence: Option.none(),
})

const draft = (loggedAt: string): FoodEntryDraft => ({
  loggedAt: at(loggedAt),
  meal: "lunch",
  source: "quick_add",
  items: [item("Rice", 420, 8.2), item("Chicken", 280, 41.16)],
  note: Option.none(),
})

const range = (from: string, to: string) => ({ from: at(from), to: at(to) })
const DAY = range("2026-10-27T00:00:00.000Z", "2026-10-28T00:00:00.000Z")

describe("FoodEntryRepo", () => {
  it.effect("insert stamps id, owner, totals = totalsOf(items) and writes the row dirty", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.UTC(2026, 9, 27, 12))
      const foods = yield* FoodEntryRepo
      const input = draft("2026-10-27T11:30:00.000Z")
      const entry = yield* foods.insert(input)
      expect(entry.id).toBe("00000000-0000-4000-8000-000000000001")
      expect(entry.userId).toBe(LOCAL_USER_ID)
      expect(DateTime.formatIso(entry.createdAt)).toBe("2026-10-27T12:00:00.000Z")
      expect(entry.updatedAt).toEqual(entry.createdAt)
      expect(entry.deletedAt).toEqual(Option.none())
      const totals = totalsOf(input.items)
      expect({
        kcal: entry.kcal,
        proteinG: entry.proteinG,
        carbsG: entry.carbsG,
        fatG: entry.fatG,
      }).toEqual(totals)
      expect(totals).toEqual({ kcal: 700, proteinG: 49.4, carbsG: 20.1, fatG: 5 })

      const listed = yield* foods.list(DAY)
      expect(listed.map((row) => [row.id, row.kcal, row.items.length])).toEqual([
        [entry.id, 700, 2],
      ])
      const raw = yield* LocalStore.use((store) =>
        store.all({ sql: `SELECT "_dirty", "kcal" FROM "food_entry"`, params: [] }),
      )
      expect(raw).toEqual([{ _dirty: 1, kcal: 700 }])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("list is half-open [from, to) and ordered by loggedAt", () =>
    Effect.gen(function* () {
      const foods = yield* FoodEntryRepo
      const late = yield* foods.insert(draft("2026-10-27T20:00:00.000Z"))
      const early = yield* foods.insert(draft("2026-10-27T00:00:00.000Z"))
      yield* foods.insert(draft("2026-10-28T00:00:00.000Z"))
      yield* foods.insert(draft("2026-10-26T23:59:59.000Z"))
      const listed = yield* foods.list(DAY)
      expect(listed.map((row) => row.id)).toEqual([early.id, late.id])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("softDelete is true once, hides the row, and restore brings it back once", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.UTC(2026, 9, 27, 12))
      const foods = yield* FoodEntryRepo
      const entry = yield* foods.insert(draft("2026-10-27T11:00:00.000Z"))
      yield* TestClock.setTime(Date.UTC(2026, 9, 27, 13))
      expect(yield* foods.softDelete(entry.id)).toBe(true)
      expect(yield* foods.softDelete(entry.id)).toBe(false)
      expect(yield* foods.list(DAY)).toEqual([])
      const tomb = yield* LocalStore.use((store) =>
        store.all({
          sql: `SELECT "_dirty", "deletedAt", "updatedAt" FROM "food_entry"`,
          params: [],
        }),
      )
      expect(tomb).toEqual([
        {
          _dirty: 1,
          deletedAt: "2026-10-27T13:00:00.000Z",
          updatedAt: "2026-10-27T13:00:00.000Z",
        },
      ])

      yield* TestClock.setTime(Date.UTC(2026, 9, 27, 14))
      expect(yield* foods.restore(entry.id)).toBe(true)
      expect(yield* foods.restore(entry.id)).toBe(false)
      const back = yield* foods.list(DAY)
      expect(back.map((row) => [row.id, DateTime.formatIso(row.updatedAt)])).toEqual([
        [entry.id, "2026-10-27T14:00:00.000Z"],
      ])
      expect(back[0]?.deletedAt).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("softDelete and restore are false for an unknown id", () =>
    Effect.gen(function* () {
      const foods = yield* FoodEntryRepo
      const unknown = FoodEntryId.make("00000000-0000-4000-8000-0000000000ff")
      expect(yield* foods.softDelete(unknown)).toBe(false)
      expect(yield* foods.restore(unknown)).toBe(false)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails with StoreError when the store fails", () =>
    Effect.gen(function* () {
      const foods = yield* FoodEntryRepo
      const listError = yield* Effect.flip(foods.list(DAY))
      const insertError = yield* Effect.flip(foods.insert(draft("2026-10-27T11:00:00.000Z")))
      expect([listError._tag, insertError._tag]).toEqual(["StoreError", "StoreError"])
    }).pipe(Effect.provide(FailingLayer)),
  )
})

describe("flipAndSync", () => {
  it.effect("requests a sync only when the row changed", () =>
    Effect.gen(function* () {
      const syncs = yield* Ref.make(0)
      const requestSync = Ref.update(syncs, (n) => n + 1)
      const entry = yield* (yield* FoodEntryRepo).insert(draft("2026-10-27T11:00:00.000Z"))
      const first = yield* flipAndSync((repo) => repo.softDelete(entry.id), requestSync)
      const again = yield* flipAndSync((repo) => repo.softDelete(entry.id), requestSync)
      expect([first, again, yield* Ref.get(syncs)]).toEqual([true, false, 1])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("resolves false without a sync when the store fails", () =>
    Effect.gen(function* () {
      const syncs = yield* Ref.make(0)
      const unknown = FoodEntryId.make("00000000-0000-4000-8000-0000000000ff")
      const result = yield* flipAndSync(
        (repo) => repo.restore(unknown),
        Ref.update(syncs, (n) => n + 1),
      )
      expect([result, yield* Ref.get(syncs)]).toEqual([false, 0])
    }).pipe(Effect.provide(FailingLayer)),
  )
})
