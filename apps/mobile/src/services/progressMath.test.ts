import { describe, expect, it } from "@effect/vitest"
import { DateTime } from "effect"
import { bestSet, epley1Rm, markPrs, type ScoredSet, SetScore, weekStartOf } from "./progressMath"

const set = (id: string, weightKg: number, reps: number, minute = 0): ScoredSet => ({
  id,
  weightKg,
  reps,
  loggedAt: DateTime.makeUnsafe(Date.UTC(2026, 9, 19, 8, minute)),
})

const vilnius = (iso: string) => DateTime.makeZonedUnsafe(iso, { timeZone: "Europe/Vilnius" })

describe("epley1Rm", () => {
  it("estimates w * (1 + reps / 30), with the one-rep and zero edge cases", () => {
    expect(epley1Rm(100, 5)).toBeCloseTo(116.67, 2)
    expect(epley1Rm(100, 1)).toBe(100)
    expect(epley1Rm(0, 12)).toBe(0)
    expect(epley1Rm(80, 0)).toBe(0)
  })
})

describe("SetScore", () => {
  it("ranks by e1RM, then reps, then weight; bodyweight sets by reps", () => {
    expect(SetScore({ weightKg: 100, reps: 8 }, { weightKg: 105, reps: 5 })).toBe(1)
    expect(SetScore({ weightKg: 100, reps: 5 }, { weightKg: 100, reps: 5 })).toBe(0)
    expect(SetScore({ weightKg: 0, reps: 10 }, { weightKg: 0, reps: 8 })).toBe(1)
    expect(SetScore({ weightKg: 0, reps: 8 }, { weightKg: 0, reps: 10 })).toBe(-1)
    // Equal e1RM (both 0 because reps 0): reps tie, so weight decides.
    expect(SetScore({ weightKg: 50, reps: 0 }, { weightKg: 40, reps: 0 })).toBe(1)
  })

  it("bestSet keeps the earliest of equal sets", () => {
    const best = bestSet([set("a", 100, 5), set("b", 100, 5, 1), set("c", 90, 5, 2)])
    expect(best).toMatchObject({ _tag: "Some", value: { id: "a" } })
    expect(bestSet([])._tag).toBe("None")
  })
})

describe("markPrs", () => {
  it("never marks the first set, not an equal best, only a strict beat", () => {
    const marked = markPrs([
      set("first", 100, 5, 0),
      set("equal", 100, 5, 1),
      set("lighter", 90, 5, 2),
      set("beat", 100, 6, 3),
      set("again", 100, 6, 4),
    ])
    expect(marked.map((s) => [s.id, s.isPr])).toEqual([
      ["first", false],
      ["equal", false],
      ["lighter", false],
      ["beat", true],
      ["again", false],
    ])
  })

  it("keeps the input fields and handles empty input", () => {
    expect(markPrs([set("x", 0, 8)])[0]).toMatchObject({ id: "x", reps: 8, isPr: false })
    expect(markPrs([])).toEqual([])
  })
})

describe("weekStartOf", () => {
  it("snaps to the local Monday, including Sunday and Monday itself", () => {
    expect(weekStartOf(vilnius("2026-10-21T08:00:00.000Z"))).toBe("2026-10-19") // Wednesday
    expect(weekStartOf(vilnius("2026-10-19T08:00:00.000Z"))).toBe("2026-10-19") // Monday
    expect(weekStartOf(vilnius("2026-10-18T08:00:00.000Z"))).toBe("2026-10-12") // Sunday
    expect(weekStartOf(vilnius("2026-01-01T08:00:00.000Z"))).toBe("2025-12-29") // across a year
  })

  it("uses the local date across the 2026-10-25 DST change (EEST → EET)", () => {
    // 21:30 UTC on Sunday 25 Oct is 23:30 local (UTC+2 after the change): still the old week.
    expect(weekStartOf(vilnius("2026-10-25T21:30:00.000Z"))).toBe("2026-10-19")
    // 22:05 UTC is 00:05 local on Monday 26 Oct: the new week.
    expect(weekStartOf(vilnius("2026-10-25T22:05:00.000Z"))).toBe("2026-10-26")
    // Before the change (UTC+3), 21:30 UTC on Sunday 18 Oct is already Monday 00:30 local.
    expect(weekStartOf(vilnius("2026-10-18T21:30:00.000Z"))).toBe("2026-10-19")
  })
})
