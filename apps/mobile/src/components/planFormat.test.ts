import { LocalDate, RepTarget, type Weekday, WeightKg } from "@tanren/shared"
import { Option, Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  formatBlockLine,
  formatDayDate,
  formatTarget,
  formatWeekRange,
  type SetTarget,
  sessionLabel,
  statusLabel,
  weekdayLabel,
} from "./planFormat"

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
