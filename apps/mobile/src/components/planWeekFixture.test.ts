import { describe, expect, it } from "vitest"
import { formatBlockLine, formatWeekRange, localDateOf } from "./planFormat"
import { FIXTURE_TODAY, planWeekFixture } from "./planWeekFixture"

describe("planWeekFixture", () => {
  it("has seven days starting at weekStart, which is a Wednesday (ADR-0007)", () => {
    const { days, week } = planWeekFixture
    expect(days).toHaveLength(7)
    expect(days[0]?.date).toBe(week.weekStart)
    expect(days.map((day) => day.weekday)).toEqual([
      "wed",
      "thu",
      "fri",
      "sat",
      "sun",
      "mon",
      "tue",
    ])
    expect(formatWeekRange(week.weekStart, days[6]?.date ?? week.weekStart)).toBe("21–27 Oct")
  })

  it("renders every block as a one-line target", () => {
    const lines = planWeekFixture.days.flatMap((day) =>
      day.sessions.flatMap((item) =>
        item.blocks.map((block) => formatBlockLine(block.exercise.name, block.sets)),
      ),
    )
    expect(lines).toContain("Back Squat · 3 × 5 @ 100 kg · rest 180 s")
    expect(lines).toContain("Romanian Deadlift · 2 × 8–10 @ 80 kg · rest 120 s")
    expect(lines).toContain("Bench Press · 1 × 5 @ 60 kg, 2 × 5 @ 80 kg · rest 150 s")
    expect(lines).toContain("Pull-up · 2 × 6–10 · rest 120 s")
    expect(lines).toContain("Hip 90/90 · 1 × 10")
  })

  it("marks today's session and keeps the unscheduled one apart", () => {
    const today = planWeekFixture.days.find((day) => day.date === FIXTURE_TODAY)
    expect(today?.sessions.map((item) => item.status)).toEqual(["today"])
    expect(planWeekFixture.unscheduled.map((item) => item.plannedSession.name)).toEqual([
      "Optional arms",
    ])
  })
})

describe("localDateOf", () => {
  it("pads month and day from the local calendar", () => {
    expect(localDateOf(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05")
  })
})
