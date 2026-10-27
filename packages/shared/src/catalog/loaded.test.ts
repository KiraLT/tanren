import { describe, expect, it } from "@effect/vitest"
import { CatalogEquipment, CatalogId, isLoaded, isLoadedEquipment, LOADED_EQUIPMENT } from "./index"

/** The supports and bodyweight accessories `LOADED_EQUIPMENT` leaves out (programs-player-v2 §2.1). */
const NOT_LOADED: ReadonlyArray<CatalogEquipment> = [
  "bench",
  "rack",
  "preacherBench",
  "backExtensionBench",
  "gluteHamDeveloper",
  "box",
  "pullUpBar",
  "dipStation",
  "band",
  "abWheel",
  "foamRoller",
  "suspensionTrainer",
  "cardioMachine",
]

describe("LOADED_EQUIPMENT", () => {
  it.each(CatalogEquipment.literals)("%s is in exactly one of the two lists", (equipment) => {
    const lists = [LOADED_EQUIPMENT.has(equipment), NOT_LOADED.includes(equipment)]
    expect(lists.filter(Boolean)).toHaveLength(1)
  })

  it("names only CatalogEquipment literals", () => {
    const known: ReadonlyArray<string> = CatalogEquipment.literals
    expect([...LOADED_EQUIPMENT, ...NOT_LOADED].every((item) => known.includes(item))).toBe(true)
    expect(LOADED_EQUIPMENT.size + NOT_LOADED.length).toBe(CatalogEquipment.literals.length)
  })
})

describe("isLoadedEquipment", () => {
  it("is false for bodyweight (no equipment) and supports only", () => {
    expect(isLoadedEquipment([])).toBe(false)
    expect(isLoadedEquipment(["bench", "pullUpBar"])).toBe(false)
  })

  it("is true when any item moves a load", () => {
    expect(isLoadedEquipment(["bench", "dumbbell"])).toBe(true)
  })
})

describe("isLoaded", () => {
  it("is true for a barbell entry, false for the plank and an unknown id", () => {
    expect(isLoaded(CatalogId.make("barbell-bench-press"))).toBe(true)
    expect(isLoaded(CatalogId.make("plank"))).toBe(false)
    expect(isLoaded(CatalogId.make("not-in-the-catalog"))).toBe(false)
  })
})
