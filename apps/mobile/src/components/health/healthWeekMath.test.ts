import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { restingHrText, restingHrWeak, restingHrWeek } from "./healthWeekMath"

const row = (bpm: number | undefined) => ({
  restingHeartRate: bpm === undefined ? Option.none() : Option.some(bpm),
})

describe("restingHrWeek", () => {
  it("averages the days that have a value and rounds", () => {
    const week = restingHrWeek([row(52), row(54), row(undefined), row(55)])
    expect(week).toEqual({ averageBpm: Option.some(54), days: 3 }) // 161 / 3 = 53.67
    expect(restingHrText(week)).toBe("54")
    expect(restingHrWeak(week)).toBe(false)
  })

  it("is None with a dash when no row has a value", () => {
    const week = restingHrWeek([row(undefined), row(undefined)])
    expect(week).toEqual({ averageBpm: Option.none(), days: 0 })
    expect(restingHrText(week)).toBe("—")
    expect(restingHrWeak(week)).toBe(true)
  })

  it("is weak with fewer than three days", () => {
    const week = restingHrWeek([row(48), row(50)])
    expect(week.averageBpm).toEqual(Option.some(49))
    expect(restingHrWeak(week)).toBe(true)
  })

  it("reads an empty week as no data", () => {
    expect(restingHrWeek([])).toEqual({ averageBpm: Option.none(), days: 0 })
  })
})
