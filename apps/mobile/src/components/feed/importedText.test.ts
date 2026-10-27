import { describe, expect, it } from "@effect/vitest"
import { DailyHealth, ImportedActivity, ImportedSport } from "@tanren/shared"
import { DateTime, Option, Schema } from "effect"
import { iconPaths } from "../../ui/iconPaths"
import {
  cardStats,
  formatDistance,
  formatDistanceCompact,
  grouped,
  healthLine,
  importedDetailStats,
  importedLabel,
  importedOn,
  importedStamp,
  importedStats,
  MISSING,
  sourceLine,
  sportIcon,
} from "./importedText"

const VILNIUS = DateTime.zoneMakeNamedUnsafe("Europe/Vilnius")
const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

interface RunOverrides {
  readonly sport?: string
  readonly distanceMeters?: number | null
  readonly calories?: number | null
  readonly avgHeartRate?: number | null
}

/** Sat 25 Oct 2025 07:12 in Vilnius (UTC+3, summer time), decoded from the wire. */
const run = (o: RunOverrides = {}): ImportedActivity =>
  Schema.decodeUnknownSync(ImportedActivity)({
    id: uuid(1),
    userId: uuid(99),
    createdAt: "2026-10-27T06:00:00.000Z",
    updatedAt: "2026-10-27T06:00:00.000Z",
    deletedAt: null,
    provider: "garmin",
    externalId: "g-1",
    sport: o.sport ?? "running",
    title: "Morning Run",
    startedAt: "2025-10-25T04:12:00.000Z",
    durationSeconds: 48 * 60,
    distanceMeters: o.distanceMeters === undefined ? 6200 : o.distanceMeters,
    calories: o.calories === undefined ? 412 : o.calories,
    avgHeartRate: o.avgHeartRate === undefined ? 148 : o.avgHeartRate,
    maxHeartRate: 171,
  })

const health = (o: {
  readonly totalCalories: number | null
  readonly steps: number | null
  readonly restingHeartRate: number | null
}): DailyHealth =>
  Schema.decodeUnknownSync(DailyHealth)({
    id: uuid(2),
    userId: uuid(99),
    createdAt: "2026-10-27T06:00:00.000Z",
    updatedAt: "2026-10-27T06:00:00.000Z",
    deletedAt: null,
    provider: "garmin",
    date: "2026-10-27",
    activeCalories: null,
    ...o,
  })

describe("importedStats", () => {
  it("formats duration, distance, calories and average heart rate", () => {
    expect(
      importedStats(run())
        .map((s) => s.value)
        .join(" · "),
    ).toBe("48 min · 6.2 km · 412 kcal · 148 bpm")
  })

  it("labels the four stats in card order", () => {
    expect(importedStats(run()).map((s) => s.label)).toEqual([
      "Duration",
      "Distance",
      "Calories",
      "Avg HR",
    ])
  })

  it("shows a dash for a missing distance and keeps its label", () => {
    expect(importedStats(run({ sport: "strength", distanceMeters: null }))[1]).toEqual({
      value: MISSING,
      label: "Distance",
    })
  })

  it("adds the maximum heart rate on the detail", () => {
    expect(importedDetailStats(run()).at(-1)).toEqual({ value: "171 bpm", label: "Max HR" })
  })

  it("groups thousands of calories and keeps one distance decimal", () => {
    expect(grouped(1840)).toBe("1,840")
    expect(formatDistance(42195)).toBe("42.2 km")
    expect(formatDistance(0)).toBe("0.0 km")
  })
})

describe("importedStamp and source lines", () => {
  it("prints the start as weekday, date and clock in the zone", () => {
    expect(importedStamp(run(), VILNIUS)).toBe("Sat 25 Oct · 07:12")
  })

  it("names the provider", () => {
    expect(sourceLine(run())).toBe("from Garmin")
    expect(importedOn(run(), VILNIUS)).toBe("Imported from Garmin on 27 Oct")
  })

  it("reads reported stats with their labels and skips missing ones", () => {
    expect(importedLabel(run({ calories: null }), VILNIUS)).toBe(
      "Morning Run, 25 Oct 07:12, Duration 48 min, Distance 6.2 km, Avg HR 148 bpm, from Garmin",
    )
  })
})

describe("sportIcon", () => {
  it("gives every sport a glyph that exists", () => {
    const missing = ImportedSport.literals.filter((sport) => !(sportIcon(sport) in iconPaths))
    expect(missing).toEqual([])
  })

  it("reuses zap for cardio and more for other", () => {
    expect([sportIcon("cardio"), sportIcon("other"), sportIcon("hiking")]).toEqual([
      "zap",
      "more",
      "walk",
    ])
  })
})

describe("healthLine", () => {
  it("joins calories, steps and resting heart rate", () => {
    const line = healthLine(health({ totalCalories: 1840, steps: 8420, restingHeartRate: 52 }))
    expect(line).toEqual(Option.some("1,840 kcal · 8,420 steps · 52 bpm resting"))
  })

  it("drops a missing value instead of showing a dash", () => {
    const line = healthLine(health({ totalCalories: null, steps: 8420, restingHeartRate: 52 }))
    expect(line).toEqual(Option.some("8,420 steps · 52 bpm resting"))
  })

  it("is None when every value is missing, so the strip hides", () => {
    const line = healthLine(health({ totalCalories: null, steps: null, restingHeartRate: null }))
    expect(Option.isNone(line)).toBe(true)
  })
})

describe("cardStats", () => {
  it("keeps every card value within 7 characters, units moved to the label", () => {
    const long = run({ calories: 1240, avgHeartRate: 152, distanceMeters: 42195 })
    expect(cardStats(long)).toEqual([
      { value: "48 min", label: "Duration" },
      { value: "42.2 km", label: "Distance" },
      { value: "1,240", label: "Calories" },
      { value: "152", label: "Avg HR" },
    ])
    expect(cardStats(long).every((stat) => stat.value.length <= 7)).toBe(true)
  })

  it("drops the distance decimal from 100 km on the card only", () => {
    const ride = run({ sport: "cycling", distanceMeters: 100_500 })
    expect(cardStats(ride)[1]).toEqual({ value: "101 km", label: "Distance" })
    expect(importedDetailStats(ride)[1]).toEqual({ value: "100.5 km", label: "Distance" })
    expect([formatDistanceCompact(99_940), formatDistanceCompact(99_960)]).toEqual([
      "99.9 km",
      "100 km",
    ])
  })
})
