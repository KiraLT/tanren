import { LocalDate } from "@tanren/shared"
import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { nextUpcoming, UP_NEXT_MAX_ITEMS, upNextDate, upNextLines } from "./planUpNext"
import { FIXTURE_TODAY, planWeekFixture } from "./planWeekFixture"

const today = LocalDate.make(FIXTURE_TODAY)

describe("nextUpcoming", () => {
  it("skips today's and done sessions and finds the next upcoming one", () => {
    const next = nextUpcoming(planWeekFixture, today)
    expect(Option.map(next, (found) => found.session.plannedSession.name)).toEqual(
      Option.some("Lower B"),
    )
    expect(Option.map(next, upNextDate)).toEqual(Option.some("Sat 24 Oct"))
  })

  it("is None when nothing after today is upcoming (unscheduled sessions never count)", () => {
    expect(nextUpcoming(planWeekFixture, LocalDate.make("2026-10-24"))).toEqual(Option.none())
  })

  it("is None for a week with no days", () => {
    expect(nextUpcoming({ days: [] }, today)).toEqual(Option.none())
  })
})

describe("upNextLines", () => {
  it("prints one name + target line per exercise, no overflow for a short session", () => {
    const next = nextUpcoming(planWeekFixture, today)
    const lines = Option.map(next, (found) => upNextLines(found.session))
    expect(Option.map(lines, (found) => found.more)).toEqual(Option.some(0))
    expect(Option.map(lines, (found) => found.lines)).toEqual(
      Option.some([
        {
          key: "00000000-0000-4000-8000-000000000101-0",
          name: "Back Squat",
          target: "1 × 8 · 90 kg",
        },
      ]),
    )
  })

  it("caps the lines and counts the rest", () => {
    const upper = planWeekFixture.days[1]?.sessions[0]
    expect(upper).toBeDefined()
    if (upper === undefined) return
    const long = { ...upper, blocks: [...upper.blocks, ...upper.blocks, ...upper.blocks] }
    const result = upNextLines(long)
    expect(result.lines).toHaveLength(UP_NEXT_MAX_ITEMS)
    expect(result.more).toBe(long.blocks.length - UP_NEXT_MAX_ITEMS)
    expect(result.lines[0]).toMatchObject({ name: "Bench Press", target: "3 sets · 60–80 kg" })
    // The same exercise repeated: React keys must still be unique.
    expect(new Set(result.lines.map((line) => line.key)).size).toBe(result.lines.length)
  })
})

describe("nextUpcoming order", () => {
  const upper = planWeekFixture.days[1]?.sessions[0]
  const lowerB = planWeekFixture.days[3]?.sessions[0]
  const mk = (date: string, weekday: "sat" | "sun" | "mon", name: string, session = lowerB) =>
    session === undefined
      ? undefined
      : {
          date: LocalDate.make(date),
          weekday,
          sessions: [
            {
              ...session,
              status: "upcoming" as const,
              plannedSession: { ...session.plannedSession, name },
            },
          ],
        }

  it("picks the earliest upcoming day even when days arrive out of order", () => {
    const later = mk("2026-10-26", "mon", "Later")
    const sooner = mk("2026-10-24", "sat", "Sooner")
    expect(later).toBeDefined()
    expect(sooner).toBeDefined()
    if (later === undefined || sooner === undefined) return
    const next = nextUpcoming({ days: [later, sooner] }, today)
    expect(Option.map(next, (found) => found.session.plannedSession.name)).toEqual(
      Option.some("Sooner"),
    )
  })

  it("on one day keeps the first upcoming session in session order", () => {
    expect(upper).toBeDefined()
    const first = mk("2026-10-24", "sat", "First")
    const second = mk("2026-10-24", "sat", "Second")
    if (first === undefined || second === undefined) return
    const day = { ...first, sessions: [...first.sessions, ...second.sessions] }
    const next = nextUpcoming({ days: [day] }, today)
    expect(Option.map(next, (found) => found.session.plannedSession.name)).toEqual(
      Option.some("First"),
    )
  })
})
