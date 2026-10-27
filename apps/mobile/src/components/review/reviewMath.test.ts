import { describe, expect, it } from "@effect/vitest"
import {
  type Activity,
  type DayTotals,
  Kcal,
  LocalDate,
  SessionId,
  type WeekReview,
} from "@tanren/shared"
import { DateTime, Option } from "effect"
import { shiftDate } from "../../services/progressMath"
import {
  kcalTone,
  nextWeekStart,
  previousWeekStart,
  reviewSummary,
  sessionRatio,
  sessionsCentre,
  targetFraction,
  weekHasNutritionData,
} from "./reviewMath"

const MONDAY = LocalDate.make("2026-10-19")

const ZERO = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }

/** A day with nothing logged, no tracker row and tracking off. */
const blank = (offset: number, patch: Partial<DayTotals> = {}): DayTotals => ({
  date: LocalDate.make(shiftDate(MONDAY, offset)),
  eaten: ZERO,
  burned: Option.none(),
  activeBurned: Option.none(),
  steps: Option.none(),
  burnedAsOf: Option.none(),
  targets: Option.none(),
  budgetKcal: Option.none(),
  kcalLeft: Option.none(),
  proteinLeftG: Option.none(),
  entries: [],
  ...patch,
})

const review = (days: ReadonlyArray<DayTotals>, patch: Partial<WeekReview> = {}): WeekReview => ({
  weekStart: MONDAY,
  days,
  eatenKcal: 0,
  burnedKcal: Option.none(),
  daysWithBurn: 0,
  netKcal: Option.none(),
  proteinAvgG: 0,
  daysOnKcalTarget: 0,
  daysOnProteinTarget: 0,
  daysLogged: 0,
  workoutsDone: 0,
  workoutsPlanned: 0,
  insights: [],
  ...patch,
})

const session = (
  n: number,
  patch: Pick<Activity, "volumeKg" | "prs"> & Partial<Activity>,
): Activity => ({
  sessionId: SessionId.make(`00000000-0000-4000-8000-00000000000${n}`),
  kind: "planned",
  status: "done",
  title: `Session ${n}`,
  startedAt: DateTime.makeUnsafe(`${shiftDate(MONDAY, n)}T08:00:00.000Z`),
  durationSeconds: Option.some(3600),
  sets: 12,
  reps: 96,
  program: Option.none(),
  exercises: [],
  muscles: { primary: [], secondary: [] },
  ...patch,
})

const WEEK_OF_BLANKS = [0, 1, 2, 3, 4, 5, 6].map((offset) => blank(offset))

describe("reviewSummary", () => {
  it("an empty week: zero training, no nutrition card, no tracker card", () => {
    const summary = reviewSummary({
      review: review(WEEK_OF_BLANKS),
      sessionsDone: 0,
      sessions: [],
      programDays: 0,
    })
    expect(summary.weekEnd).toBe("2026-10-25")
    expect(summary.training).toEqual({ done: 0, planned: 0, volumeKg: 0, prs: 0, programDays: 0 })
    expect(Option.isNone(summary.nutrition)).toBe(true)
    expect(Option.isNone(summary.tracker)).toBe(true)
    expect(summary.insights).toEqual([])
  })

  it("a week of 3 sessions, food and Garmin", () => {
    const target = { kcal: 2400, proteinG: 160, goal: "gain_muscle" as const }
    const days = [
      blank(0, {
        targets: Option.some(target),
        steps: Option.some(8000),
        burned: Option.some(2500),
      }),
      blank(1, {
        targets: Option.some(target),
        steps: Option.some(10000),
        burned: Option.some(2700),
      }),
      blank(2, { targets: Option.some({ ...target, kcal: 2100 }), steps: Option.some(6001) }),
      blank(3, { targets: Option.some(target) }),
      blank(4, { targets: Option.some(target) }),
      blank(5, { targets: Option.some(target) }),
      blank(6, { targets: Option.some(target) }),
    ]
    const summary = reviewSummary({
      review: review(days, {
        eatenKcal: 7000,
        daysLogged: 3,
        proteinAvgG: 151.6,
        daysOnKcalTarget: 2,
        daysOnProteinTarget: 1,
        workoutsPlanned: 4,
        insights: [{ rule: "week_streak", text: "3 days logged" }],
      }),
      // 4 finished sessions; one has no sets, so it has no activity: counted, 0 volume.
      sessionsDone: 4,
      sessions: [
        session(0, { volumeKg: 5200.5, prs: 2 }),
        session(2, { volumeKg: 4100, prs: 0 }),
        session(4, { volumeKg: 3000, prs: 1 }),
      ],
      programDays: 1,
    })
    expect(summary.training).toEqual({
      done: 4,
      planned: 4,
      volumeKg: 12301, // 12,300.5 rounded
      prs: 3,
      programDays: 1,
    })
    expect(summary.nutrition).toEqual(
      Option.some({
        avgKcal: 2333, // 7,000 / 3
        targetKcal: Option.some(2357), // (6 × 2,400 + 2,100) / 7
        avgProteinG: 152,
        targetProteinG: Option.some(160),
        daysOnKcalTarget: 2,
        daysOnProteinTarget: 1,
        daysLogged: 3,
      }),
    )
    expect(summary.tracker).toEqual(
      Option.some({ avgSteps: Option.some(8000), avgBurnKcal: Option.some(2600), days: 3 }),
    )
    expect(summary.insights).toHaveLength(1)
  })

  it("tracking on with nothing logged still draws nutrition at 0", () => {
    const days = WEEK_OF_BLANKS.map((day) => ({
      ...day,
      targets: Option.some({ kcal: 2000, proteinG: 150, goal: "maintain" as const }),
    }))
    const summary = reviewSummary({
      review: review(days),
      sessionsDone: 0,
      sessions: [],
      programDays: 0,
    })
    expect(Option.map(summary.nutrition, (n) => [n.avgKcal, n.targetKcal])).toEqual(
      Option.some([0, Option.some(2000)]),
    )
  })
})

describe("week navigation", () => {
  it("the previous week crosses a month boundary", () => {
    const monday = LocalDate.make("2026-11-02")
    expect(previousWeekStart(monday)).toBe("2026-10-26")
    const summary = reviewSummary({
      review: review(WEEK_OF_BLANKS, { weekStart: previousWeekStart(monday) }),
      sessionsDone: 0,
      sessions: [],
      programDays: 0,
    })
    expect(summary.weekEnd).toBe("2026-11-01")
  })

  it("the next week crosses a year boundary and undoes previous", () => {
    const monday = LocalDate.make("2026-12-28")
    expect(nextWeekStart(monday)).toBe("2027-01-04")
    expect(previousWeekStart(nextWeekStart(monday))).toBe(monday)
  })
})

describe("ring helpers", () => {
  it("fills the sessions ring by plan, or fully for any session without one", () => {
    expect(sessionRatio(3, 4)).toBe(0.75)
    expect(sessionRatio(0, 0)).toBe(0)
    expect(sessionRatio(2, 0)).toBe(1)
    expect(sessionsCentre(3, 4)).toBe("3/4")
    expect(sessionsCentre(2, 0)).toBe("2")
  })

  it("measures against an optional, positive target", () => {
    expect(targetFraction(1500, Option.some(2000))).toBe(0.75)
    expect(targetFraction(1500, Option.none())).toBe(0)
    expect(targetFraction(1500, Option.some(0))).toBe(0)
  })

  it("turns the kcal ring danger only above 110 %", () => {
    expect(kcalTone(1.1)).toBe("accent")
    expect(kcalTone(1.11)).toBe("danger")
    expect(kcalTone(0)).toBe("accent")
  })
})

describe("weekHasNutritionData", () => {
  const week = (patch: (offset: number) => Partial<DayTotals>) =>
    [0, 1, 2, 3, 4, 5, 6].map((offset) => blank(offset, patch(offset)))

  it("is false for a week with no food and no burn row", () => {
    expect(weekHasNutritionData(week(() => ({})))).toBe(false)
    expect(weekHasNutritionData([])).toBe(false)
  })

  it("is true when one day has food logged", () => {
    expect(
      weekHasNutritionData(week((o) => (o === 3 ? { eaten: { ...ZERO, kcal: 420 } } : {}))),
    ).toBe(true)
  })

  it("is true when one day has a burn row, even at zero food", () => {
    expect(
      weekHasNutritionData(week((o) => (o === 6 ? { burned: Option.some(Kcal.make(2100)) } : {}))),
    ).toBe(true)
  })
})
