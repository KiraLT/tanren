import { describe, expect, it } from "vitest"
import { exerciseStats, loggedVolumeKg } from "./exerciseStats"

const set = (weightKg: number, reps: number) => ({ weightKg, reps })

describe("loggedVolumeKg", () => {
  it("is zero with no logged sets", () => {
    expect(loggedVolumeKg([])).toBe(0)
  })

  it("sums weight x reps", () => {
    expect(loggedVolumeKg([set(100, 5), set(102.5, 4)])).toBe(910)
  })
})

describe("exerciseStats", () => {
  it("shows rest, done n/N and volume", () => {
    expect(
      exerciseStats({
        plannedSets: [1, 2, 3, 4, 5],
        loggedSets: [set(100, 5), set(100, 5)],
        restSeconds: 180,
      }),
    ).toEqual([
      { label: "Rest", value: "3:00" },
      { label: "Done", value: "2/5" },
      { label: "Volume", value: "1,000 kg" },
    ])
  })

  it("starts at 0/N and 0 kg", () => {
    const stats = exerciseStats({ plannedSets: [1, 2, 3], loggedSets: [], restSeconds: 90 })
    expect(stats.map((s) => s.value)).toEqual(["1:30", "0/3", "0 kg"])
  })

  it("shows the plain count when nothing is planned", () => {
    const stats = exerciseStats({ plannedSets: [], loggedSets: [set(20, 10)], restSeconds: 60 })
    expect(stats.map((s) => s.value)).toEqual(["1:00", "1", "200 kg"])
  })

  it("keeps counting past the plan", () => {
    const stats = exerciseStats({
      plannedSets: [1],
      loggedSets: [set(50, 10), set(50, 10)],
      restSeconds: 60,
    })
    expect(stats[1]?.value).toBe("2/1")
  })
})
