import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { rejects } from "../testing"
import { EQUIPMENT_GROUPS, EquipmentGroup, LOCATION_PRESETS, LocationPreset } from "./presets"
import { CatalogEquipment } from "./taxonomy"

const grouped = Object.values(EQUIPMENT_GROUPS).flat()

describe("EquipmentGroup", () => {
  it.effect("decodes a known group", () =>
    Effect.gen(function* () {
      expect(yield* Schema.decodeUnknownEffect(EquipmentGroup)("cables")).toBe("cables")
    }),
  )

  it.effect("rejects an unknown group", () =>
    Effect.gen(function* () {
      yield* rejects(EquipmentGroup, "weights")
      const error = yield* Effect.flip(Schema.decodeUnknownEffect(EquipmentGroup)("weights"))
      expect(error.message).toMatch(/^Expected "freeWeights" \| "benchesRacks"/)
    }),
  )
})

describe("LocationPreset", () => {
  it.effect("decodes a known preset", () =>
    Effect.gen(function* () {
      expect(yield* Schema.decodeUnknownEffect(LocationPreset)("home")).toBe("home")
    }),
  )

  it.effect("rejects an unknown preset", () =>
    Effect.gen(function* () {
      yield* rejects(LocationPreset, "garage")
      const error = yield* Effect.flip(Schema.decodeUnknownEffect(LocationPreset)("garage"))
      expect(error.message).toMatch(/^Expected "commercialGym" \| "home" \| "bodyweightOnly"/)
    }),
  )
})

describe("EQUIPMENT_GROUPS", () => {
  it("lists every CatalogEquipment literal in exactly one group", () => {
    expect(grouped.length).toBe(new Set(grouped).size)
    expect(new Set(grouped)).toEqual(new Set(CatalogEquipment.literals))
  })
})

describe("LOCATION_PRESETS", () => {
  it("commercialGym has every literal", () => {
    expect(new Set(LOCATION_PRESETS.commercialGym.equipment)).toEqual(
      new Set(CatalogEquipment.literals),
    )
  })

  it("home has dumbbells, kettlebell, bench, pull-up bar and bands", () => {
    expect(LOCATION_PRESETS.home).toEqual({
      name: "Home",
      equipment: ["dumbbell", "kettlebell", "bench", "pullUpBar", "band"],
    })
  })

  it("bodyweightOnly has no equipment", () => {
    expect(LOCATION_PRESETS.bodyweightOnly.equipment).toEqual([])
  })
})
