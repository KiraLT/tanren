import { describe, expect, it } from "@effect/vitest"
import { searchCatalog } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import {
  hasFilter,
  initialSearch,
  isSettling,
  reduceSearch,
  type SearchAction,
  toFilter,
} from "./searchState"

const run = (...actions: ReadonlyArray<SearchAction>) =>
  Arr.reduce(actions, initialSearch, reduceSearch)

describe("reduceSearch", () => {
  it("shows typed text at once but searches it only once settled (debounce)", () => {
    const typing = run({ _tag: "Typed", text: "oh" }, { _tag: "Typed", text: "ohp" })
    expect(typing.input).toBe("ohp")
    expect(typing.query).toBe("")
    expect(isSettling(typing)).toBe(true)
    expect(toFilter(typing)).toEqual({})

    const settled = reduceSearch(typing, { _tag: "Settled" })
    expect(settled.query).toBe("ohp")
    expect(isSettling(settled)).toBe(false)
    expect(toFilter(settled)).toEqual({ query: "ohp" })
  })

  it("applies facets immediately and omits unset keys from the filter", () => {
    const state = run(
      { _tag: "Muscle", value: Option.some("core") },
      { _tag: "Kind", value: Option.some("timed") },
    )
    expect(toFilter(state)).toEqual({ muscle: "core", kind: "timed" })
    expect(Object.keys(toFilter(state))).not.toContain("equipment")
    const cleared = reduceSearch(state, { _tag: "Muscle", value: Option.none() })
    expect(toFilter(cleared)).toEqual({ kind: "timed" })
  })

  it("trims whitespace-only queries away", () => {
    const state = run({ _tag: "Typed", text: "   " }, { _tag: "Settled" })
    expect(toFilter(state)).toEqual({})
    expect(hasFilter(state)).toBe(false)
  })

  it("Cleared resets everything", () => {
    const state = run(
      { _tag: "Typed", text: "squat" },
      { _tag: "Settled" },
      { _tag: "Equipment", value: Option.some("barbell") },
    )
    expect(hasFilter(state)).toBe(true)
    expect(reduceSearch(state, { _tag: "Cleared" })).toEqual(initialSearch)
  })

  it("feeds searchCatalog: every result matches the muscle facet", () => {
    const results = searchCatalog(toFilter(run({ _tag: "Muscle", value: Option.some("core") })))
    expect(
      results.every(
        (entry) => entry.primaryMuscles.includes("core") || entry.secondaryMuscles.includes("core"),
      ),
    ).toBe(true)
  })
})
