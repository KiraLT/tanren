import { describe, expect, it } from "@effect/vitest"
import { LocationId } from "@tanren/shared"
import { Option } from "effect"
import {
  emptyLocations,
  type LocationsAction,
  type LocationsState,
  MAX_LOCATIONS,
  reduceLocations,
} from "./locationsState"

const id = (n: number) => LocationId.make(`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`)
const run = (actions: ReadonlyArray<LocationsAction>, from: LocationsState = emptyLocations) =>
  actions.reduce(reduceLocations, from)

const gymAndHome = run([
  { _tag: "AddPreset", preset: "commercialGym", id: id(1) },
  { _tag: "AddPreset", preset: "home", id: id(2) },
])

describe("reduceLocations", () => {
  it("AddPreset appends the preset's name and equipment; the first one becomes active", () => {
    expect(gymAndHome.locations.map((l) => l.name)).toEqual(["Gym", "Home"])
    expect(gymAndHome.locations[1]?.equipment).toEqual([
      "dumbbell",
      "kettlebell",
      "bench",
      "pullUpBar",
      "band",
    ])
    expect(gymAndHome.activeLocationId).toEqual(Option.some(id(1)))
  })

  it("AddPreset numbers a second location from the same preset", () => {
    const twice = run([{ _tag: "AddPreset", preset: "home", id: id(3) }], gymAndHome)
    expect(twice.locations.map((l) => l.name)).toEqual(["Gym", "Home", "Home 2"])
  })

  it("AddPreset stops at the maximum number of locations", () => {
    const full = run(
      Array.from({ length: MAX_LOCATIONS + 1 }, (_, n) => ({
        _tag: "AddPreset" as const,
        preset: "bodyweightOnly" as const,
        id: id(n + 1),
      })),
    )
    expect(full.locations.length).toBe(MAX_LOCATIONS)
  })

  it("Rename trims the name and ignores a blank one", () => {
    const renamed = run([{ _tag: "Rename", id: id(2), name: "  Garage  " }], gymAndHome)
    expect(renamed.locations[1]?.name).toBe("Garage")
    expect(run([{ _tag: "Rename", id: id(2), name: "   " }], gymAndHome)).toEqual(gymAndHome)
  })

  it("Toggle removes present equipment and adds missing equipment", () => {
    const toggled = run(
      [
        { _tag: "Toggle", id: id(2), equipment: "bench" },
        { _tag: "Toggle", id: id(2), equipment: "legPress" },
      ],
      gymAndHome,
    )
    expect(toggled.locations[1]?.equipment).toEqual([
      "dumbbell",
      "kettlebell",
      "pullUpBar",
      "band",
      "legPress",
    ])
  })

  it("Remove of the active location clears the active id", () => {
    const removed = run([{ _tag: "Remove", id: id(1) }], gymAndHome)
    expect(removed.locations.map((l) => l.name)).toEqual(["Home"])
    expect(removed.activeLocationId).toEqual(Option.none())
  })

  it("Remove of another location keeps the active id", () => {
    const removed = run([{ _tag: "Remove", id: id(2) }], gymAndHome)
    expect(removed.activeLocationId).toEqual(Option.some(id(1)))
  })

  it("SetActive picks a known location and ignores an unknown id", () => {
    expect(run([{ _tag: "SetActive", id: id(2) }], gymAndHome).activeLocationId).toEqual(
      Option.some(id(2)),
    )
    expect(run([{ _tag: "SetActive", id: id(9) }], gymAndHome)).toEqual(gymAndHome)
  })
})
