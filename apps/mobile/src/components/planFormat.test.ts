import { LocalDate, RepTarget, type Weekday, WeightKg } from "@tanren/shared"
import { Option, Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  formatBlockLine,
  formatDayDate,
  formatDayShort,
  formatItemTarget,
  formatTarget,
  formatWeekRange,
  type SetTarget,
  sessionLabel,
  statusLabel,
  weekdayLabel,
  weekStats,
  weekSummary,
} from "./planFormat"
import { planWeekFixture } from "./planWeekFixture"

const reps = Schema.decodeUnknownSync(RepTarget)
const date = (value: string) => LocalDate.make(value)

interface Spec {
  readonly kg?: number
  readonly reps: unknown
  readonly rest?: number
}

const set = (spec: Spec): SetTarget => ({
  targetWeightKg: Option.map(Option.fromNullishOr(spec.kg), (kg) => WeightKg.make(kg)),
  targetReps: reps(spec.reps),
  restSeconds: Option.fromNullishOr(spec.rest),
})

const exact = (n: number) => ({ _tag: "Exact", reps: n })

describe("formatTarget", () => {
  it("groups identical sets: count × reps @ weight · rest", () => {
    const sets = [100, 100, 100].map((kg) => set({ kg, reps: exact(5), rest: 180 }))
    expect(formatTarget(sets)).toBe("3 × 5 @ 100 kg · rest 180 s")
  })

  it("formats range reps with an en dash", () => {
    const sets = [set({ kg: 22.5, reps: { _tag: "Range", min: 8, max: 12 }, rest: 90 })]
    expect(formatTarget(sets)).toBe("1 × 8–12 @ 22.5 kg · rest 90 s")
  })

  it("leaves out a missing weight", () => {
    expect(
      formatTarget([set({ reps: exact(10), rest: 60 }), set({ reps: exact(10), rest: 60 })]),
    ).toBe("2 × 10 · rest 60 s")
  })

  it("leaves out a missing rest", () => {
    expect(formatTarget([set({ kg: 60, reps: exact(8) })])).toBe("1 × 8 @ 60 kg")
  })

  it("lists mixed sets as separate groups, rest printed once when shared", () => {
    const sets = [
      set({ kg: 60, reps: exact(5), rest: 180 }),
      set({ kg: 100, reps: exact(5), rest: 180 }),
      set({ kg: 100, reps: exact(5), rest: 180 }),
    ]
    expect(formatTarget(sets)).toBe("1 × 5 @ 60 kg, 2 × 5 @ 100 kg · rest 180 s")
  })

  it("puts differing rests in brackets per group", () => {
    const sets = [
      set({ kg: 60, reps: exact(5), rest: 120 }),
      set({ kg: 100, reps: exact(5), rest: 180 }),
    ]
    expect(formatTarget(sets)).toBe("1 × 5 @ 60 kg (rest 120 s), 1 × 5 @ 100 kg (rest 180 s)")
  })

  it("does not merge non-adjacent equal sets", () => {
    const sets = [
      set({ kg: 60, reps: exact(5) }),
      set({ kg: 80, reps: exact(5) }),
      set({ kg: 60, reps: exact(5) }),
    ]
    expect(formatTarget(sets)).toBe("1 × 5 @ 60 kg, 1 × 5 @ 80 kg, 1 × 5 @ 60 kg")
  })

  it("is empty for no sets", () => {
    expect(formatTarget([])).toBe("")
  })
})

describe("formatBlockLine", () => {
  it("prefixes the exercise name", () => {
    const sets = [100, 100, 100].map((kg) => set({ kg, reps: exact(5), rest: 180 }))
    expect(formatBlockLine("Back Squat", sets)).toBe("Back Squat · 3 × 5 @ 100 kg · rest 180 s")
  })

  it("is just the name without sets", () => {
    expect(formatBlockLine("Plank", [])).toBe("Plank")
  })
})

describe("statusLabel / sessionLabel", () => {
  it("names each status", () => {
    expect(statusLabel("done")).toBe("done")
    expect(statusLabel("today")).toBe("today")
    expect(statusLabel("upcoming")).toBe("upcoming")
    expect(statusLabel("missed")).toBe("missed")
  })

  it("builds the card accessibility label", () => {
    expect(sessionLabel("Lower A", "today")).toBe("Lower A, today")
    expect(sessionLabel("Upper B", "missed")).toBe("Upper B, missed")
  })
})

describe("dates", () => {
  it("formats a day date and weekday", () => {
    expect(formatDayDate(date("2026-10-05"))).toBe("5 Oct")
    expect(weekdayLabel("wed" satisfies Weekday)).toBe("Wed")
  })

  it("formats a week range in one month and across months", () => {
    expect(formatWeekRange(date("2026-10-19"), date("2026-10-25"))).toBe("19–25 Oct")
    expect(formatWeekRange(date("2026-10-28"), date("2026-11-03"))).toBe("28 Oct – 3 Nov")
  })

  it("does not assume Monday: a Wednesday start reads the same way", () => {
    expect(formatWeekRange(date("2026-10-21"), date("2026-10-27"))).toBe("21–27 Oct")
  })
})

describe("formatItemTarget", () => {
  it("is count × reps · weight, without the rest", () => {
    const sets = [100, 100, 100].map((kg) => set({ kg, reps: exact(5), rest: 180 }))
    expect(formatItemTarget(sets)).toBe("3 × 5 · 100 kg")
  })

  it("keeps fractional kg and rep ranges", () => {
    expect(formatItemTarget([set({ kg: 22.5, reps: { _tag: "Range", min: 8, max: 12 } })])).toBe(
      "1 × 8–12 · 22.5 kg",
    )
  })

  it("treats sets that differ only in rest as one group", () => {
    const sets = [
      set({ kg: 60, reps: exact(8), rest: 60 }),
      set({ kg: 60, reps: exact(8), rest: 90 }),
    ]
    expect(formatItemTarget(sets)).toBe("2 × 8 · 60 kg")
  })

  it("leaves the weight out when there is none", () => {
    expect(formatItemTarget([set({ reps: exact(12) }), set({ reps: exact(12) })])).toBe("2 × 12")
  })

  it("prints a zero weight", () => {
    expect(formatItemTarget([set({ kg: 0, reps: exact(10) })])).toBe("1 × 10 · 0 kg")
  })

  it("collapses mixed sets to a set count and a weight range", () => {
    const sets = [60, 100, 100].map((kg) => set({ kg, reps: exact(5) }))
    expect(formatItemTarget(sets)).toBe("3 sets · 60–100 kg")
  })

  it("collapses mixed reps at one weight to the count and that weight", () => {
    const sets = [set({ kg: 50, reps: exact(8) }), set({ kg: 50, reps: exact(6) })]
    expect(formatItemTarget(sets)).toBe("2 sets · 50 kg")
  })

  it("collapses mixed bodyweight sets to the count alone", () => {
    expect(formatItemTarget([set({ reps: exact(10) }), set({ reps: exact(8) })])).toBe("2 sets")
  })

  it("is empty without sets", () => {
    expect(formatItemTarget([])).toBe("")
  })
})

describe("formatDayShort", () => {
  it("is the weekday and the day of month on one line", () => {
    expect(formatDayShort("mon", date("2026-10-26"))).toBe("Mon 26")
    expect(formatDayShort("sun", date("2026-11-01"))).toBe("Sun 1")
  })
})

describe("weekSummary", () => {
  const empty = { ...planWeekFixture, unscheduled: [] }
  it("counts a partial week: done sessions' sets and planned volume", () => {
    expect(weekSummary(planWeekFixture)).toEqual({
      sessionsDone: 1,
      sessionsTotal: 5,
      setsDone: 5,
      setsTotal: 13,
      volumeKg: 3 * 100 * 5 + 2 * 80 * 8,
    })
  })

  it("is all zero for a week without sessions", () => {
    const week = { ...empty, days: planWeekFixture.days.map((day) => ({ ...day, sessions: [] })) }
    expect(weekSummary(week)).toEqual({
      sessionsDone: 0,
      sessionsTotal: 0,
      setsDone: 0,
      setsTotal: 0,
      volumeKg: 0,
    })
  })

  it("counts sessions that have no sets", () => {
    const days = planWeekFixture.days.map((day) => ({
      ...day,
      sessions: day.sessions.map((item) => ({ ...item, blocks: [] })),
    }))
    const summary = weekSummary({ days, unscheduled: [] })
    expect(summary.sessionsTotal).toBe(4)
    expect(summary.sessionsDone).toBe(1)
    expect(summary.setsTotal).toBe(0)
    expect(summary.volumeKg).toBe(0)
  })
})

describe("weekStats", () => {
  it("labels the slots as planned figures, with a thousands separator", () => {
    const stats = weekStats({
      sessionsDone: 1,
      sessionsTotal: 5,
      setsDone: 5,
      setsTotal: 13,
      volumeKg: 4110,
    })
    expect(stats).toEqual([
      { label: "Sessions", value: "1/5" },
      { label: "Planned sets", value: "5/13" },
      { label: "Planned volume", value: "4,110 kg" },
    ])
  })

  it("prints an empty week as zeros", () => {
    const stats = weekStats({
      sessionsDone: 0,
      sessionsTotal: 0,
      setsDone: 0,
      setsTotal: 0,
      volumeKg: 0,
    })
    expect(stats).toEqual([
      { label: "Sessions", value: "0/0" },
      { label: "Planned sets", value: "0/0" },
      { label: "Planned volume", value: "0 kg" },
    ])
  })
})

describe("formatTarget edge combinations", () => {
  it("range reps without weight and with differing rests", () => {
    const sets = [
      set({ reps: { _tag: "Range", min: 8, max: 12 }, rest: 60 }),
      set({ reps: { _tag: "Range", min: 8, max: 12 }, rest: 90 }),
    ]
    expect(formatTarget(sets)).toBe("1 × 8–12 (rest 60 s), 1 × 8–12 (rest 90 s)")
    expect(formatBlockLine("Curl", sets)).toBe("Curl · 1 × 8–12 (rest 60 s), 1 × 8–12 (rest 90 s)")
  })

  it("a group without rest next to one with rest prints no bracket for the empty one", () => {
    const sets = [set({ kg: 60, reps: exact(5) }), set({ kg: 100, reps: exact(5), rest: 180 })]
    expect(formatTarget(sets)).toBe("1 × 5 @ 60 kg, 1 × 5 @ 100 kg (rest 180 s)")
  })

  it("zero weight and zero rest are printed, not treated as missing", () => {
    expect(formatTarget([set({ kg: 0, reps: exact(10), rest: 0 })])).toBe(
      "1 × 10 @ 0 kg · rest 0 s",
    )
  })
})
