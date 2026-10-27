import { describe, expect, it } from "@effect/vitest"
import { todayEmptyCopy } from "./todayEmptyCopy"

describe("todayEmptyCopy", () => {
  it("keeps the rest-day copy when no program is due", () => {
    expect(todayEmptyCopy(0)).toEqual({
      title: "Nothing planned today",
      body: "Rest up. Your next session shows up here.",
    })
  })

  it("points at the program day above when one is due (fails if it still says 'Nothing planned today')", () => {
    expect(todayEmptyCopy(1)).toEqual({
      title: "No gym session planned",
      body: "Your program day is ready above.",
    })
  })

  it("reads the same when several programs are due", () => {
    expect(todayEmptyCopy(2)).toEqual(todayEmptyCopy(1))
  })
})
