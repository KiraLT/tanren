import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { LocationId } from "../ids"
import type { Location } from "../user"
import { activeLocation, isAvailableWith, missingEquipment } from "./availability"
import { searchCatalog } from "./index"
import type { CatalogEquipment } from "./taxonomy"

const homeId = LocationId.make("2d2d2d2d-2d2d-4d2d-8d2d-2d2d2d2d2d2d")
const gymId = LocationId.make("1c1c1c1c-1c1c-4c1c-8c1c-1c1c1c1c1c1c")
const home: Location = { id: homeId, name: "Home", equipment: ["dumbbell", "bench"] }
const gym: Location = { id: gymId, name: "Gym", equipment: ["barbell", "rack", "legPress"] }
const needs = (...equipment: ReadonlyArray<CatalogEquipment>) => ({ equipment })

describe("isAvailableWith", () => {
  it("bodyweight is always available, even with no equipment", () => {
    expect(isAvailableWith([])(needs())).toBe(true)
  })

  it("an entry whose tags are a subset of the location's is available", () => {
    expect(isAvailableWith(home.equipment)(needs("dumbbell", "bench"))).toBe(true)
  })

  it("an entry needing one implement the location lacks is not available", () => {
    expect(isAvailableWith(home.equipment)(needs("dumbbell", "legPress"))).toBe(false)
  })
})

describe("missingEquipment", () => {
  it("lists what the location lacks in the entry's tag order", () => {
    expect(missingEquipment(needs("legPress", "dumbbell", "cable"), home)).toEqual([
      "legPress",
      "cable",
    ])
  })

  it("is empty when the entry is available", () => {
    expect(missingEquipment(needs("bench"), home)).toEqual([])
  })
})

describe("activeLocation", () => {
  it("is None when no location is active", () => {
    expect(activeLocation({ locations: [home, gym], activeLocationId: Option.none() })).toEqual(
      Option.none(),
    )
  })

  it("is None when the active id names no location", () => {
    expect(activeLocation({ locations: [home], activeLocationId: Option.some(gymId) })).toEqual(
      Option.none(),
    )
  })

  it("is the location the active id names", () => {
    expect(
      activeLocation({ locations: [home, gym], activeLocationId: Option.some(gymId) }),
    ).toEqual(Option.some(gym))
  })
})

describe("CatalogFilter.availableEquipment", () => {
  it("keeps only entries doable with the equipment", () => {
    const results = searchCatalog({ availableEquipment: home.equipment })
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((entry) => isAvailableWith(home.equipment)(entry))).toBe(true)
    expect(results.some((entry) => entry.equipment.includes("legPress"))).toBe(false)
  })

  it("an absent filter returns the whole catalog", () => {
    expect(searchCatalog({}).length).toBeGreaterThan(
      searchCatalog({ availableEquipment: [] }).length,
    )
  })
})
