import { describe, expect, it } from "@effect/vitest"
import { CatalogId, findCatalogExercise } from "@tanren/shared"
import { Option } from "effect"
import { swappedTo, swapSubtitle } from "./swapRows"

const entry = (id: string) =>
  Option.getOrThrowWith(findCatalogExercise(CatalogId.make(id)), () => new Error(`no ${id}`))

describe("swapSubtitle", () => {
  it("lists the primary muscles shared with the original, then the equipment", () => {
    const original = entry("barbell-bench-press")
    const other = entry("dumbbell-bench-press")
    const text = swapSubtitle(original, other)
    const [muscles, equipment] = text.split(" · ")
    expect(muscles).toContain("Chest")
    expect(equipment).toBe("Dumbbell, Bench")
  })

  it("names bodyweight when the candidate needs nothing", () => {
    expect(swapSubtitle(entry("plank"), entry("dead-bug")).endsWith(" · Bodyweight")).toBe(true)
  })
})

describe("swappedTo", () => {
  const plank = CatalogId.make("plank")
  const deadBug = CatalogId.make("dead-bug")
  it("is the target of the swap keyed by the original id", () => {
    expect(swappedTo([{ from: plank, to: deadBug }], plank)).toEqual(Option.some(deadBug))
  })
  it("is None for an id that runs as written", () => {
    expect(swappedTo([{ from: plank, to: deadBug }], deadBug)).toEqual(Option.none())
    expect(swappedTo([], plank)).toEqual(Option.none())
  })
})
