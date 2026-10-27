import { describe, expect, it } from "@effect/vitest"
import { Activity, ActivityExercise, ImportedActivity } from "@tanren/shared"
import { DateTime, Schema } from "effect"
import type { FeedItem } from "../../services/FeedRepo"
import {
  activityLabel,
  exerciseMapSource,
  feedRows,
  formatClock,
  formatDuration,
  formatDurationCompact,
  formatStamp,
  groupByWeek,
  sessionOnly,
  statTiles,
  statValueVariant,
  TILE_VALUE_MAX_CHARS,
} from "./feedGroups"

const vilnius = (iso: string) => DateTime.makeZonedUnsafe(iso, { timeZone: "Europe/Vilnius" })

/** Wednesday 28 Oct 2026, 10:00 in Vilnius; its Monday-based week starts 2026-10-26. */
const NOW = vilnius("2026-10-28T08:00:00.000Z")

interface Overrides {
  readonly n: number
  readonly startedAt: string
  readonly volumeKg?: number
  readonly reps?: number
  readonly sets?: number
  readonly durationSeconds?: number | null
  readonly prs?: number
  readonly program?: boolean
  readonly exercises?: number
}

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

const exercise = (n: number) => ({
  exerciseId: uuid(500 + n),
  name: `Exercise ${n}`,
  catalogId: null,
  muscleGroups: [],
  sets: [
    {
      setId: uuid(900 + n),
      weightKg: 50,
      reps: 5,
      rpe: null,
      loggedAt: "2026-10-26T10:00:00.000Z",
      isPr: false,
    },
  ],
  best: { weightKg: 50, reps: 5 },
  prs: 0,
})

/** Decoded from the wire shape, so the fixture is a real `Activity`. */
const activity = (o: Overrides): Activity =>
  Schema.decodeUnknownSync(Activity)({
    sessionId: uuid(o.n),
    kind: o.program === true ? "program" : "free",
    status: "done",
    title: o.program === true ? "Core 30 · Day 12" : "Workout",
    startedAt: o.startedAt,
    durationSeconds: o.durationSeconds === undefined ? 2880 : o.durationSeconds,
    sets: o.sets ?? 18,
    reps: o.reps ?? 124,
    volumeKg: o.volumeKg ?? 4230,
    prs: o.prs ?? 0,
    program: o.program === true ? { programId: "core-30", dayNumber: 12 } : null,
    exercises: Array.from({ length: o.exercises ?? 6 }, (_, i) => exercise(i)),
    muscles: { primary: [], secondary: [] },
  })

const today1 = activity({ n: 1, startedAt: "2026-10-27T16:00:00.000Z", volumeKg: 4000 })
const today2 = activity({ n: 2, startedAt: "2026-10-26T16:00:00.000Z", volumeKg: 8400 })
const lastWeek = activity({ n: 3, startedAt: "2026-10-20T16:00:00.000Z", volumeKg: 1000 })
const older = activity({ n: 4, startedAt: "2026-10-13T16:00:00.000Z", volumeKg: 500 })

const session = (a: Activity): FeedItem => ({ _tag: "session", activity: a })
const sessions = (list: ReadonlyArray<Activity>): ReadonlyArray<FeedItem> => list.map(session)

/** A pulled Garmin run, decoded from the wire shape. */
const imported = (n: number, startedAt: string): ImportedActivity =>
  Schema.decodeUnknownSync(ImportedActivity)({
    id: uuid(700 + n),
    userId: uuid(99),
    createdAt: "2026-10-27T06:00:00.000Z",
    updatedAt: "2026-10-27T06:00:00.000Z",
    deletedAt: null,
    provider: "garmin",
    externalId: `g-${n}`,
    sport: "running",
    title: "Morning Run",
    startedAt,
    durationSeconds: 2880,
    distanceMeters: 6200,
    calories: 412,
    avgHeartRate: 148,
    maxHeartRate: 171,
  })
const run = imported(1, "2026-10-27T05:12:00.000Z")
const runItem: FeedItem = { _tag: "imported", activity: run }

describe("groupByWeek", () => {
  it("gives this week, last week and an older week their labels and keys", () => {
    const sections = groupByWeek(sessions([today1, today2, lastWeek, older]), NOW)
    expect(sections.map((s) => [s.key, s.label])).toEqual([
      ["2026-10-26", "This week"],
      ["2026-10-19", "Last week"],
      ["2026-10-12", "Week of 12 Oct"],
    ])
  })

  it("counts workouts and sums volume per week", () => {
    const [first, second] = groupByWeek(sessions([today1, today2, lastWeek]), NOW)
    expect(first?.summary).toBe("2 workouts · 12,400 kg")
    expect(second?.summary).toBe("1 workout · 1,000 kg")
  })

  it("sums reps when the whole week is bodyweight", () => {
    const a = activity({ n: 5, startedAt: "2026-10-27T16:00:00.000Z", volumeKg: 0, reps: 100 })
    const b = activity({ n: 6, startedAt: "2026-10-26T16:00:00.000Z", volumeKg: 0, reps: 24 })
    expect(groupByWeek(sessions([a, b]), NOW)[0]?.summary).toBe("2 workouts · 124 reps")
  })

  it("keeps the input order inside a week", () => {
    const [first] = groupByWeek(sessions([today2, today1]), NOW)
    expect(first?.items).toEqual([session(today2), session(today1)])
  })

  it("returns no sections for no activities", () => {
    expect(groupByWeek([], NOW)).toEqual([])
  })

  it("reads the week in the device zone: Sunday 22:30 UTC is already Monday in Vilnius", () => {
    const lateSunday = activity({ n: 7, startedAt: "2026-10-25T22:30:00.000Z" })
    expect(groupByWeek(sessions([lateSunday]), NOW)[0]?.label).toBe("This week")
  })

  it("puts an imported activity in its week and counts only sessions in the summary", () => {
    const [first] = groupByWeek([session(today1), runItem, session(today2)], NOW)
    expect(first?.items).toEqual([session(today1), runItem, session(today2)])
    expect(first?.summary).toBe("2 workouts · 12,400 kg")
  })

  it("counts activities when a week holds only imported ones", () => {
    const other: FeedItem = { _tag: "imported", activity: imported(2, "2026-10-20T05:00:00.000Z") }
    const [, second] = groupByWeek([runItem, other], NOW)
    expect(second?.summary).toBe("1 activity")
  })
})

describe("feedRows", () => {
  it("lists each header before its cards", () => {
    const rows = feedRows(groupByWeek(sessions([today1, lastWeek]), NOW))
    expect(rows.map((row) => row._tag)).toEqual(["Header", "Card", "Header", "Card"])
    expect(new Set(rows.map((row) => row.key)).size).toBe(4)
  })

  it("gives an imported item an Imported row keyed by its id", () => {
    const rows = feedRows(groupByWeek([session(today1), runItem], NOW))
    expect(rows.slice(1)).toEqual([
      { _tag: "Card", key: `activity-${today1.sessionId}`, activity: today1 },
      { _tag: "Imported", key: `imported-${run.id}`, activity: run },
    ])
  })
})

describe("sessionOnly", () => {
  it("keeps sessions and drops imported items", () => {
    expect([session(today1), runItem].flatMap(sessionOnly)).toEqual([today1])
  })
})

describe("formatDuration", () => {
  it("prints whole minutes and hours", () => {
    expect(formatDuration(48 * 60)).toBe("48 min")
    expect(formatDuration(72 * 60)).toBe("1 h 12 min")
    expect(formatDuration(60 * 60)).toBe("1 h")
  })

  it("floors, and never rounds a sub-minute duration up to a minute", () => {
    expect(formatDuration(0)).toBe("0 min")
    expect(formatDuration(59)).toBe("< 1 min")
    expect(formatDuration(48 * 60 + 59)).toBe("48 min")
  })
})

describe("formatClock and formatStamp", () => {
  it("prints the local HH:mm of the zone", () => {
    expect(formatClock(vilnius("2026-10-26T16:40:00.000Z"))).toBe("18:40")
    expect(formatClock(vilnius("2026-10-26T22:05:00.000Z"))).toBe("00:05")
  })

  it("prints weekday, day, month and clock", () => {
    expect(formatStamp(vilnius("2026-10-26T16:40:00.000Z"))).toBe("Mon 26 Oct · 18:40")
  })
})

describe("statTiles", () => {
  it("shows duration, volume and sets over exercises", () => {
    expect(statTiles(today1)).toEqual([
      { value: "48 min", caption: "Duration" },
      { value: "4,000 kg", caption: "Volume" },
      { value: "18 sets", caption: "6 exercises" },
    ])
  })

  it("shows a dash without duration and reps without volume", () => {
    const tiles = statTiles(
      activity({ n: 8, startedAt: "2026-10-26T16:00:00.000Z", durationSeconds: null, volumeKg: 0 }),
    )
    expect(tiles[0]).toEqual({ value: "—", caption: "Duration" })
    expect(tiles[1]).toEqual({ value: "124 reps", caption: "Reps" })
  })

  it("shows an hour-plus duration compactly so the tile keeps its size", () => {
    const tiles = statTiles(
      activity({ n: 13, startedAt: "2026-10-26T16:00:00.000Z", durationSeconds: 70 * 60 }),
    )
    expect(tiles[0]).toEqual({ value: "1h 10m", caption: "Duration" })
  })

  it("uses the singular for one set and one exercise", () => {
    const tiles = statTiles(
      activity({ n: 12, startedAt: "2026-10-26T16:00:00.000Z", sets: 1, exercises: 1 }),
    )
    expect(tiles[2]).toEqual({ value: "1 set", caption: "1 exercise" })
  })
})

describe("formatDurationCompact", () => {
  it("writes hours and minutes without the long units", () => {
    expect(formatDurationCompact(9 * 60 + 3600)).toBe("1h 9m")
    expect(formatDurationCompact(70 * 60)).toBe("1h 10m")
    expect(formatDurationCompact(2 * 3600)).toBe("2h")
    expect(formatDurationCompact(12 * 3600 + 59 * 60)).toBe("12h 59m")
  })

  it("keeps the under-an-hour forms of formatDuration", () => {
    expect(formatDurationCompact(35 * 60)).toBe("35 min")
    expect(formatDurationCompact(0)).toBe("0 min")
    expect(formatDurationCompact(30)).toBe("< 1 min")
  })

  it("is at most 7 characters up to 99 hours", () => {
    expect(formatDurationCompact(12 * 3600 + 59 * 60).length).toBeLessThanOrEqual(7)
    expect(formatDurationCompact(99 * 3600 + 59 * 60).length).toBeLessThanOrEqual(7)
  })
})

describe("statValueVariant", () => {
  it("keeps title2 for short values (17 sets, 8,111 kg, 124 reps, 1 h)", () => {
    const values = ["17 sets", "8,111 kg", "124 reps", "4,230 kg", "1 h", "—", "48 min"]
    expect(values.map(statValueVariant)).toEqual(values.map(() => "title2"))
  })

  it("keeps title2 for every compact duration, two-digit minutes and hours included", () => {
    expect(statValueVariant("1h 10m")).toBe("title2")
    expect(statValueVariant(formatDurationCompact(76 * 60))).toBe("title2") // "1h 16m"
    expect(statValueVariant(formatDurationCompact(12 * 3600 + 59 * 60))).toBe("title2") // "12h 59m"
  })

  it("steps to headline for the long form and long volumes (safety net)", () => {
    expect(statValueVariant(formatDuration(70 * 60))).toBe("headline") // "1 h 10 min"
    expect(statValueVariant("10,000 kg")).toBe("headline")
    expect(statValueVariant("100,000 kg")).toBe("headline")
  })

  it("changes exactly at the limit", () => {
    expect(statValueVariant("x".repeat(TILE_VALUE_MAX_CHARS))).toBe("title2")
    expect(statValueVariant("x".repeat(TILE_VALUE_MAX_CHARS + 1))).toBe("headline")
  })
})

describe("activityLabel", () => {
  it("ends with the records and the program title when present", () => {
    const withExtras = activity({
      n: 9,
      startedAt: "2026-10-26T16:40:00.000Z",
      prs: 2,
      program: true,
    })
    const label = activityLabel(withExtras)
    expect(label.startsWith("Core 30 · Day 12, ")).toBe(true)
    expect(label.endsWith("4,230 kg, 2 personal records, Core 30 · Day 12")).toBe(true)
  })

  it("says '1 personal record' for a single record", () => {
    const one = activity({ n: 11, startedAt: "2026-10-26T16:40:00.000Z", prs: 1 })
    expect(activityLabel(one).endsWith("4,230 kg, 1 personal record")).toBe(true)
  })

  it("says duration unknown and omits optional parts", () => {
    const plain = activity({ n: 10, startedAt: "2026-10-26T16:40:00.000Z", durationSeconds: null })
    expect(activityLabel(plain)).toMatch(
      /^Workout, 26 Oct \d\d:\d\d, duration unknown, 18 sets, 6 exercises, 4,230 kg$/,
    )
  })
})

describe("exerciseMapSource", () => {
  const wire = (catalogId: string | null, muscleGroups: ReadonlyArray<string>) =>
    Schema.decodeUnknownSync(ActivityExercise)({ ...exercise(1), catalogId, muscleGroups })

  it("a custom exercise with muscle groups draws them as primary", () => {
    expect(exerciseMapSource(wire(null, ["quads", "glutes"]))).toEqual({
      _tag: "Custom",
      primary: ["quads", "glutes"],
    })
  })

  it("a custom exercise without muscle groups draws an empty map", () => {
    expect(exerciseMapSource(wire(null, []))).toEqual({ _tag: "Custom", primary: [] })
  })

  it("a catalog exercise uses the catalog image and the entry's muscles, not its row groups", () => {
    expect(exerciseMapSource(wire("barbell-bench-press", ["calves"]))).toEqual({
      _tag: "Catalog",
      catalogId: "barbell-bench-press",
      primary: ["chest", "triceps"],
      secondary: ["shoulders"],
    })
  })
})

describe("exerciseMapSource, stale catalog link", () => {
  it("a catalogId the catalog lacks draws the row's muscle groups, like the hero map", () => {
    const stale = Schema.decodeUnknownSync(ActivityExercise)({
      ...exercise(1),
      catalogId: "no-such-catalog-entry",
      muscleGroups: ["calves"],
    })
    expect(exerciseMapSource(stale)).toEqual({ _tag: "Custom", primary: ["calves"] })
  })
})
