import { describe, expect, it } from "@effect/vitest"
import { type DayTotals, LocalDate, type WeekReview } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import { shiftDate } from "../../services/progressMath"
import { avgBalanceText, dayBarColumns, weekStartFor } from "./dayBarMath"

const MONDAY = LocalDate.make("2026-10-26")
/** Thursday of the same week. */
const TODAY = LocalDate.make("2026-10-29")

const day = (offset: number, patch: Partial<DayTotals> = {}): DayTotals => ({
  date: LocalDate.make(shiftDate(MONDAY, offset)),
  eaten: { kcal: 1420, proteinG: 96, carbsG: 150, fatG: 50 },
  burned: Option.some(1840),
  activeBurned: Option.some(420),
  steps: Option.none(),
  burnedAsOf: Option.none(),
  targets: Option.some({ kcal: 2040, proteinG: 170, goal: "lose_weight" }),
  budgetKcal: Option.some(2040),
  kcalLeft: Option.some(620),
  proteinLeftG: Option.some(74),
  entries: [],
  ...patch,
})

const nothing: Partial<DayTotals> = {
  eaten: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  burned: Option.none(),
}

/** Mon 1,420/1,840 · Tue 2,400/2,100 (week max) · Wed eaten, no Garmin · Thu nothing · Fri–Sun. */
const WEEK: ReadonlyArray<DayTotals> = [
  day(0),
  day(1, { eaten: { kcal: 2400, proteinG: 170, carbsG: 0, fatG: 0 }, burned: Option.some(2100) }),
  day(2, { burned: Option.none() }),
  day(3, nothing),
  day(4, { eaten: { kcal: 9000, proteinG: 0, carbsG: 0, fatG: 0 } }),
  day(5),
  day(6),
]

describe("dayBarColumns", () => {
  const columns = dayBarColumns(WEEK, TODAY, 120)

  it("returns one column per day, Monday first", () => {
    expect(Arr.map(columns, (c) => c.letter)).toEqual(["M", "T", "W", "T", "F", "S", "S"])
  })

  it("scales heights to the week's largest value up to today, zero to 0", () => {
    // Tuesday's 2,400 eaten is the largest value on or before Thursday (Friday's 9,000 is future).
    expect(columns[1]?.eatenHeight).toBe(120)
    expect(columns[1]?.burnedHeight).toBe(105) // 2,100 / 2,400 × 120
    expect(columns[0]?.eatenHeight).toBe(71) // 1,420 / 2,400 × 120 = 71.0
    expect(columns[3]?.eatenHeight).toBe(0)
    expect(columns[3]?.burnedHeight).toBe(0)
  })

  it("counts the budget into the scale", () => {
    const quiet = dayBarColumns(
      [day(0, { eaten: { kcal: 1000, proteinG: 0, carbsG: 0, fatG: 0 }, burned: Option.none() })],
      TODAY,
      100,
    )
    expect(quiet[0]?.eatenHeight).toBe(49) // 1,000 / 2,040 budget × 100
  })

  it("draws no burned bar and says so when Garmin has no row", () => {
    expect(columns[2]?.burnedHeight).toBe(0)
    expect(columns[2]?.accessibilityLabel).toBe("Wednesday: eaten 1,420 kcal, burned: no data")
  })

  it("labels logged, empty and upcoming days", () => {
    expect(columns[0]?.accessibilityLabel).toBe("Monday: eaten 1,420 kcal, burned 1,840 kcal")
    expect(columns[3]?.accessibilityLabel).toBe("Today, Thursday: nothing logged")
    expect(columns[6]?.accessibilityLabel).toBe("Sunday: upcoming")
  })

  it("flags today and the future, and leaves future bars empty", () => {
    expect(Arr.map(columns, (c) => c.isToday)).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
      false,
    ])
    expect(Arr.map(columns, (c) => c.isFuture)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
    ])
    expect(columns[4]?.eatenHeight).toBe(0)
    expect(columns[4]?.burnedHeight).toBe(0)
  })

  it("gives seven distinct labels", () => {
    expect(new Set(Arr.map(columns, (c) => c.accessibilityLabel)).size).toBe(7)
  })

  it("draws nothing when the week is empty so far", () => {
    const empty = dayBarColumns([day(0, { ...nothing, budgetKcal: Option.none() })], TODAY, 120)
    expect(empty[0]?.eatenHeight).toBe(0)
  })
})

describe("weekStartFor", () => {
  it("returns the Monday on or before the date", () => {
    expect(weekStartFor(TODAY)).toBe("2026-10-26")
    expect(weekStartFor(MONDAY)).toBe("2026-10-26")
    expect(weekStartFor(LocalDate.make("2026-11-01"))).toBe("2026-10-26") // Sunday
  })
})

describe("avgBalanceText", () => {
  const review = (
    netKcal: Option.Option<number>,
    daysWithBurn: number,
  ): Pick<WeekReview, "netKcal" | "daysWithBurn"> => ({ netKcal, daysWithBurn })

  it("divides the net by the days with a Garmin total, with a true minus", () => {
    expect(avgBalanceText(review(Option.some(-1240), 4))).toBe("−310 kcal/day")
  })

  it("shows a dash when no day has a Garmin total", () => {
    expect(avgBalanceText(review(Option.none(), 0))).toBe("—")
  })

  it("groups positive balances without a sign", () => {
    expect(avgBalanceText(review(Option.some(3000), 2))).toBe("1,500 kcal/day")
  })
})
