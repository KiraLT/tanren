import type { ProgramSummary } from "@tanren/shared"
import { CORE30, LocalDate, ProgramEnrollmentId, ProgramId, summarize } from "@tanren/shared"
import { Option } from "effect"
import { describe, expect, it } from "vitest"
import {
  enrolLabel,
  summaryBadge,
  summaryLabel,
  summarySubtitle,
  userProgramIdOf,
} from "./programList"

const builtin: ProgramSummary = summarize(
  CORE30,
  { source: "builtin", version: 1, schedule: Option.none() },
  Option.none(),
)

const custom = (over: Partial<ProgramSummary>): ProgramSummary => ({
  ...builtin,
  programId: ProgramId.make("11111111-1111-4111-8111-111111111111"),
  source: "manual",
  ...over,
})

const running = (status: "active" | "paused" | "completed"): ProgramSummary["enrollment"] =>
  Option.some({
    enrollmentId: ProgramEnrollmentId.make("22222222-2222-4222-8222-222222222222"),
    status,
    currentDay: 3,
    startedOn: LocalDate.make("2026-10-27"),
  })

describe("summarySubtitle", () => {
  it("collapses an equal range and marks Claude's programs", () => {
    expect(summarySubtitle({ ...builtin, days: 30, minutesPerDay: { min: 15, max: 15 } })).toBe(
      "30 days · 15 min",
    )
    expect(
      summarySubtitle(custom({ source: "mcp", days: 12, minutesPerDay: { min: 40, max: 55 } })),
    ).toBe("12 days · 40–55 min · Made with Claude")
    expect(summarySubtitle(custom({ days: 1, minutesPerDay: { min: 5, max: 9 } }))).toBe(
      "1 day · 5–9 min",
    )
  })
})

describe("summaryBadge", () => {
  it("lets the status win over Yours and hides it for an idle built-in", () => {
    expect(summaryBadge(builtin)).toEqual(Option.none())
    expect(summaryBadge(custom({}))).toEqual(Option.some({ label: "Yours", tone: "neutral" }))
    expect(summaryBadge(custom({ enrollment: running("active") }))).toEqual(
      Option.some({ label: "Active", tone: "accent" }),
    )
    expect(summaryBadge({ ...builtin, enrollment: running("paused") })).toEqual(
      Option.some({ label: "Paused", tone: "neutral" }),
    )
  })

  it("ignores a finished enrollment", () => {
    expect(summaryBadge({ ...builtin, enrollment: running("completed") })).toEqual(Option.none())
    expect(summaryBadge(custom({ enrollment: running("completed") }))).toEqual(
      Option.some({ label: "Yours", tone: "neutral" }),
    )
  })
})

describe("summaryLabel", () => {
  it("reads title, subtitle and badge", () => {
    expect(
      summaryLabel(custom({ title: "Push", days: 3, minutesPerDay: { min: 45, max: 45 } })),
    ).toBe("Push, 3 days · 45 min, Yours")
  })
})

describe("userProgramIdOf", () => {
  it("has none for a built-in and the row id for a custom program", () => {
    expect(userProgramIdOf(builtin)).toEqual(Option.none())
    expect(Option.isSome(userProgramIdOf(custom({})))).toBe(true)
    expect(
      Option.isNone(userProgramIdOf(custom({ programId: ProgramId.make("not-a-uuid") }))),
    ).toBe(true)
  })
})

describe("enrolLabel", () => {
  it("offers to start alongside", () => {
    expect(enrolLabel(false)).toBe("Start program")
    expect(enrolLabel(true)).toBe("Start alongside")
  })
})
