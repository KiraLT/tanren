import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { accepts, failingPaths } from "../testing"
import { EquipmentKind } from "../user"
import { CatalogEquipment, CatalogId, equipmentKindFor, Slug } from "./taxonomy"

describe("Slug", () => {
  it.effect("accepts kebab-case", () =>
    Effect.gen(function* () {
      yield* accepts(Slug, "barbell-back-squat")
      yield* accepts(Slug, "core-30")
    }),
  )

  it.effect("rejects spaces, capitals, edge or double dashes and more than 64 chars", () =>
    Effect.gen(function* () {
      const bad = ["Back Squat", "-plank", "plank-", "plank--hold", "a".repeat(65)]
      const paths = yield* Effect.forEach(bad, (input) => failingPaths(CatalogId, input))
      expect(paths).toEqual(bad.map(() => [[]]))
    }),
  )
})

describe("equipmentKindFor", () => {
  it("maps every catalog implement to a profile EquipmentKind", () => {
    const kinds = CatalogEquipment.literals.map(equipmentKindFor)
    expect(kinds.filter((kind) => !EquipmentKind.literals.includes(kind))).toEqual([])
    expect(equipmentKindFor("dumbbell")).toBe("dumbbells")
    expect(equipmentKindFor("band")).toBe("resistanceBands")
  })
})
