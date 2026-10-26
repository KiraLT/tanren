import { describe, expect, it } from "@effect/vitest"
import { Activity, ActivityExercise } from "@tanren/shared"
import { DateTime, Schema } from "effect"
import {
  activityLabel,
  exerciseMapSource,
  feedRows,
  formatClock,
  formatDuration,
  formatStamp,
  groupByWeek,
  statTiles,
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

describe("groupByWeek", () => {
  it("gives this week, last week and an older week their labels and keys", () => {
    const sections = groupByWeek([today1, today2, lastWeek, older], NOW)
    expect(sections.map((s) => [s.key, s.label])).toEqual([
      ["2026-10-26", "This week"],
      ["2026-10-19", "Last week"],
      ["2026-10-12", "Week of 12 Oct"],
    ])
  })

  it("counts workouts and sums volume per week", () => {
    const [first, second] = groupByWeek([today1, today2, lastWeek], NOW)
    expect(first?.summary).toBe("2 workouts · 12,400 kg")
    expect(second?.summary).toBe("1 workout · 1,000 kg")
  })

  it("sums reps when the whole week is bodyweight", () => {
    const a = activity({ n: 5, startedAt: "2026-10-27T16:00:00.000Z", volumeKg: 0, reps: 100 })
    const b = activity({ n: 6, startedAt: "2026-10-26T16:00:00.000Z", volumeKg: 0, reps: 24 })
    expect(groupByWeek([a, b], NOW)[0]?.summary).toBe("2 workouts · 124 reps")
  })

  it("keeps the input order inside a week", () => {
    const [first] = groupByWeek([today2, today1], NOW)
    expect(first?.items.map((item) => item.sessionId)).toEqual([today2.sessionId, today1.sessionId])
  })

  it("returns no sections for no activities", () => {
    expect(groupByWeek([], NOW)).toEqual([])
  })

  it("reads the week in the device zone: Sunday 22:30 UTC is already Monday in Vilnius", () => {
    const lateSunday = activity({ n: 7, startedAt: "2026-10-25T22:30:00.000Z" })
    expect(groupByWeek([lateSunday], NOW)[0]?.label).toBe("This week")
  })
})

describe("feedRows", () => {
  it("lists each header before its cards", () => {
    const rows = feedRows(groupByWeek([today1, lastWeek], NOW))
    expect(rows.map((row) => row._tag)).toEqual(["Header", "Card", "Header", "Card"])
    expect(new Set(rows.map((row) => row.key)).size).toBe(4)
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
