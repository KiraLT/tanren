import { DateTime, Option } from "effect"
import { describe, expect, it } from "vitest"
import {
  bestSetParts,
  e1RmText,
  formatE1Rm,
  formatLoggedDate,
  formatSetText,
  formatVolume,
  formatWeekStart,
  hasE1RmTrend,
  latestE1RmText,
  sparklineEndLabels,
  trendLabel,
  volumeLabel,
  weekBarsHeading,
  weekSeries,
} from "./progressFormat"

const week = (volumeKg: number, reps: number) => ({
  weekStart: "2026-10-19",
  volumeKg,
  sets: reps > 0 ? 1 : 0,
  reps,
})

describe("bestSetParts", () => {
  it("splits a loaded set into the numeral and a unit line", () => {
    expect(bestSetParts(127.5, 5)).toEqual({ value: "127.5", unit: "kg × 5" })
    expect(bestSetParts(100, 3)).toEqual({ value: "100", unit: "kg × 3" })
  })

  it("shows reps as the numeral for a bodyweight set", () => {
    expect(bestSetParts(0, 12)).toEqual({ value: "12", unit: "reps" })
  })
})

describe("formatting", () => {
  it("rounds e1RM to 0.1 kg", () => {
    expect(formatE1Rm(116.6666)).toBe("e1RM 116.7 kg")
    expect(formatE1Rm(100)).toBe("e1RM 100 kg")
  })

  it("prints a weighted set as kg × reps and a bodyweight set as reps", () => {
    expect(formatSetText(100, 5)).toBe("100 kg × 5")
    expect(formatSetText(82.5, 8)).toBe("82.5 kg × 8")
    expect(formatSetText(0, 12)).toBe("12 reps")
  })

  it("re-exports formatVolume from the leaf module", () => {
    expect(formatVolume(4230)).toBe("4,230 kg")
  })

  it("prints a week by its Monday", () => {
    expect(formatWeekStart("2026-09-07")).toBe("7 Sep")
    expect(formatWeekStart("not a date")).toBe("not a date")
  })

  it("prints the local day and month of a timestamp", () => {
    expect(formatLoggedDate(DateTime.makeUnsafe("2026-10-21T12:00:00.000Z"))).toBe("21 Oct")
  })
})

describe("bodyweight e1RM guard", () => {
  it("prints the e1RM for a loaded best set", () => {
    expect(e1RmText(100, 116.6666)).toEqual(Option.some("e1RM 116.7 kg"))
  })

  it("omits the e1RM for a bodyweight best set (weight 0)", () => {
    expect(e1RmText(0, 0)).toEqual(Option.none())
    expect(e1RmText(0, 13.3)).toEqual(Option.none())
  })

  it("has an e1RM trend only when some week is above 0", () => {
    const none = { weekStart: "a", e1Rm: Option.none<number>() }
    expect(hasE1RmTrend([none, { weekStart: "b", e1Rm: Option.some(0) }])).toBe(false)
    expect(hasE1RmTrend([none, { weekStart: "b", e1Rm: Option.some(116.7) }])).toBe(true)
    expect(hasE1RmTrend([])).toBe(false)
  })

  it("names the weekly bars after the plotted unit", () => {
    expect(weekBarsHeading("kg")).toBe("Volume, last 8 weeks")
    expect(weekBarsHeading("reps")).toBe("Reps, last 8 weeks")
  })
})

describe("weekSeries", () => {
  it("plots volume in kg when any week has weighted work", () => {
    expect(weekSeries([week(0, 10), week(500, 5)])).toEqual({ unit: "kg", values: [0, 500] })
  })

  it("plots reps when all work is bodyweight", () => {
    expect(weekSeries([week(0, 10), week(0, 15)])).toEqual({ unit: "reps", values: [10, 15] })
  })

  it("stays in kg with all zeros when nothing was logged", () => {
    expect(weekSeries([week(0, 0), week(0, 0)])).toEqual({ unit: "kg", values: [0, 0] })
  })
})

describe("chart labels", () => {
  it("summarises the 8 weeks for assistive tech", () => {
    const series = { unit: "kg", values: [0, 0, 0, 0, 0, 0, 120, 1250.4] } as const
    expect(volumeLabel(series)).toBe("Volume last 8 weeks: 0, 0, 0, 0, 0, 0, 120, 1250 kg")
  })

  it("names reps for bodyweight work", () => {
    expect(volumeLabel({ unit: "reps", values: [10, 15] })).toBe("Reps last 2 weeks: 10, 15 reps")
  })

  it("marks weeks without sets in the e1RM trend", () => {
    const trend = [
      { weekStart: "a", e1Rm: Option.none<number>() },
      { weekStart: "b", e1Rm: Option.some(116.666) },
    ]
    expect(trendLabel(trend)).toBe("Estimated 1RM, last 2 weeks: no sets, 116.7 kg")
  })
})

const trendOf = (values: ReadonlyArray<Option.Option<number>>) =>
  values.map((e1Rm, index) => ({
    weekStart: `2026-09-${String(7 + 7 * index).padStart(2, "0")}`,
    e1Rm,
  }))
const none = Option.none<number>()

describe("sparklineEndLabels", () => {
  it("gives no caption when no week has sets", () => {
    expect(sparklineEndLabels(trendOf([none, none, none]))).toEqual([])
    expect(sparklineEndLabels([])).toEqual([])
  })

  it("gives one caption for a lone week", () => {
    expect(sparklineEndLabels(trendOf([none, Option.some(100), none]))).toEqual([
      { index: 1, text: "14 Sep" },
    ])
  })

  it("captions the first and last week with sets, and the current week as 'This week'", () => {
    const trend = trendOf([none, Option.some(90), Option.some(95), none, Option.some(105)])
    expect(sparklineEndLabels(trend)).toEqual([
      { index: 1, text: "14 Sep" },
      { index: 4, text: "This week" },
    ])
    const early = trendOf([Option.some(90), none, Option.some(95), none])
    expect(sparklineEndLabels(early)).toEqual([
      { index: 0, text: "7 Sep" },
      { index: 2, text: "21 Sep" },
    ])
  })
})

describe("latestE1RmText", () => {
  it("is the newest week's e1RM as kg, or None without sets", () => {
    expect(latestE1RmText(trendOf([Option.some(90), Option.some(105), none]))).toEqual(
      Option.some("105 kg"),
    )
    expect(latestE1RmText(trendOf([none, none]))).toEqual(Option.none())
  })
})
