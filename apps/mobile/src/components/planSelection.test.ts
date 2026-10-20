import { LocalDate, PlannedSessionId } from "@tanren/shared"
import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { defaultSession, selectedSession } from "./planSelection"
import { FIXTURE_TODAY, planWeekFixture } from "./planWeekFixture"

const nameOf = (item: Option.Option<{ readonly plannedSession: { readonly name: string } }>) =>
  Option.map(item, (found) => found.plannedSession.name)

const emptyWeek = { ...planWeekFixture, days: [], unscheduled: [] }

describe("defaultSession", () => {
  it("picks today's session when today has one", () => {
    expect(nameOf(defaultSession(planWeekFixture, LocalDate.make(FIXTURE_TODAY)))).toEqual(
      Option.some("Upper A"),
    )
  })

  it("falls back to the next upcoming session on a rest day", () => {
    expect(nameOf(defaultSession(planWeekFixture, LocalDate.make("2026-10-23")))).toEqual(
      Option.some("Lower B"),
    )
  })

  it("falls back to the first session when nothing is upcoming", () => {
    const pastWeek = { ...planWeekFixture, days: planWeekFixture.days.slice(0, 1), unscheduled: [] }
    expect(nameOf(defaultSession(pastWeek, LocalDate.make("2026-10-27")))).toEqual(
      Option.some("Lower A"),
    )
  })

  it("is None for a week without sessions", () => {
    expect(defaultSession(emptyWeek, LocalDate.make(FIXTURE_TODAY))).toEqual(Option.none())
  })
})

describe("selectedSession", () => {
  it("keeps the tapped session, including an unscheduled one", () => {
    const arms = PlannedSessionId.make("00000000-0000-4000-8000-000000000205")
    expect(
      nameOf(selectedSession(planWeekFixture, LocalDate.make(FIXTURE_TODAY), Option.some(arms))),
    ).toEqual(Option.some("Optional arms"))
  })

  it("falls back to the default when the tapped session left the week", () => {
    const gone = PlannedSessionId.make("00000000-0000-4000-8000-000000000999")
    expect(
      nameOf(selectedSession(planWeekFixture, LocalDate.make(FIXTURE_TODAY), Option.some(gone))),
    ).toEqual(Option.some("Upper A"))
  })
})
