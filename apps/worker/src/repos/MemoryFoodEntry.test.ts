import { describe, expect, it } from "@effect/vitest"
import { FoodEntryRepo } from "@tanren/db"
import { FoodEntry, type FoodEntryEncoded, FoodEntryId, UserId } from "@tanren/shared"
import { DateTime, Effect, Schema } from "effect"
import { Repositories } from "./Repositories"

const owner = UserId.make("00000000-0000-4000-8000-0000000000e1")
const intruder = UserId.make("00000000-0000-4000-8000-0000000000e2")
const id = (n: number) => `72000000-0000-4000-8000-${n.toString().padStart(12, "0")}`
const at = (iso: string) => DateTime.makeUnsafe(iso)
const range = { from: at("2026-10-27T00:00:00.000Z"), to: at("2026-10-28T00:00:00.000Z") }

const item = {
  name: "Oats",
  portion: "80 g",
  grams: 80,
  kcal: 300,
  proteinG: 10,
  carbsG: 54,
  fatG: 5,
  fibreG: null,
  confidence: 0.9,
}
const entry = (overrides: Partial<FoodEntryEncoded> & Pick<FoodEntryEncoded, "id">) =>
  Schema.decodeUnknownSync(FoodEntry)({
    userId: owner,
    createdAt: "2026-10-27T08:00:00.000Z",
    updatedAt: "2026-10-27T08:00:00.000Z",
    deletedAt: null,
    loggedAt: "2026-10-27T08:00:00.000Z",
    meal: "breakfast",
    source: "mcp",
    items: [item],
    kcal: 300,
    proteinG: 10,
    carbsG: 54,
    fatG: 5,
    note: null,
    ...overrides,
  })

describe("MemoryFoodEntry (Repositories.layerMemory)", () => {
  it.effect("listRange is half-open on loggedAt, live only, ordered by loggedAt", () =>
    Effect.gen(function* () {
      const repo = yield* FoodEntryRepo
      yield* repo.put(owner, [
        entry({ id: id(1), loggedAt: "2026-10-27T18:00:00.000Z" }),
        entry({ id: id(2), loggedAt: "2026-10-27T00:00:00.000Z" }),
        entry({ id: id(3), loggedAt: "2026-10-28T00:00:00.000Z" }),
        entry({ id: id(4), deletedAt: "2026-10-27T09:00:00.000Z" }),
      ])
      const listed = yield* repo.listRange(owner, range)
      expect(listed.map((r) => r.id)).toEqual([id(2), id(1)])
    }).pipe(Effect.provide(Repositories.layerMemory)),
  )

  it.effect("softDelete returns true for a live row, then false", () =>
    Effect.gen(function* () {
      const repo = yield* FoodEntryRepo
      yield* repo.put(owner, [entry({ id: id(5) })])
      expect(yield* repo.softDelete(owner, FoodEntryId.make(id(5)))).toBe(true)
      expect(yield* repo.softDelete(owner, FoodEntryId.make(id(5)))).toBe(false)
      expect(yield* repo.listRange(owner, range)).toEqual([])
    }).pipe(Effect.provide(Repositories.layerMemory)),
  )

  it.effect("softDelete of another user's id is false and leaves the row live", () =>
    Effect.gen(function* () {
      const repo = yield* FoodEntryRepo
      yield* repo.put(owner, [entry({ id: id(8) })])
      expect(yield* repo.softDelete(intruder, FoodEntryId.make(id(8)))).toBe(false)
      expect((yield* repo.listRange(owner, range)).length).toBe(1)
    }).pipe(Effect.provide(Repositories.layerMemory)),
  )

  it.effect("put of an id another user holds is Forbidden", () =>
    Effect.gen(function* () {
      const repo = yield* FoodEntryRepo
      yield* repo.put(owner, [entry({ id: id(6) })])
      const error = yield* Effect.flip(repo.put(intruder, [entry({ id: id(6), userId: intruder })]))
      expect(error._tag).toBe("Forbidden")
    }).pipe(Effect.provide(Repositories.layerMemory)),
  )

  it.effect("put with totals unequal to totalsOf(items) is a PersistenceError", () =>
    Effect.gen(function* () {
      const repo = yield* FoodEntryRepo
      const error = yield* Effect.flip(repo.put(owner, [entry({ id: id(7), kcal: 999 })]))
      expect(error).toMatchObject({
        _tag: "PersistenceError",
        cause: [`invariantViolated ${id(7)}`],
      })
    }).pipe(Effect.provide(Repositories.layerMemory)),
  )
})
