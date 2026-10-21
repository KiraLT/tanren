import { describe, expect, it } from "@effect/vitest"
import { EQUIPMENT_GROUPS, LOCATION_PRESETS } from "./presets"
import { CatalogEquipment } from "./taxonomy"

const grouped = Object.values(EQUIPMENT_GROUPS).flat()

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
