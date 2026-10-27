import { describe, expect, it } from "@effect/vitest"
import { Activity, ActivityExercise } from "@tanren/shared"
import { Schema } from "effect"
import {
  dateLine,
  detailTiles,
  exerciseSubtitle,
  musclesLabel,
  setLine,
  tilesPerRow,
} from "./detailText"

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

interface SetSpec {
  readonly weightKg: number
  readonly reps: number
  readonly rpe?: number
  readonly isPr?: boolean
}

/** Decoded from the wire shape, like the feedGroups fixtures, so the values are real. */
const wireExercise = (specs: ReadonlyArray<SetSpec>, best: SetSpec) => ({
  exerciseId: uuid(500),
  name: "Bench press",
  catalogId: null,
  muscleGroups: [],
  sets: specs.map((spec, i) => ({
    setId: uuid(900 + i),
    weightKg: spec.weightKg,
    reps: spec.reps,
    rpe: spec.rpe ?? null,
    loggedAt: "2026-10-26T16:00:00.000Z",
    isPr: spec.isPr ?? false,
  })),
  best: { weightKg: best.weightKg, reps: best.reps },
  prs: specs.filter((spec) => spec.isPr === true).length,
})

const activityOf = (
  o: {
    readonly durationSeconds?: number | null
    readonly volumeKg?: number
    readonly reps?: number
    readonly prs?: number
  } = {},
): Activity =>
  Schema.decodeUnknownSync(Activity)({
    sessionId: uuid(1),
    kind: "free",
    status: "done",
    title: "Workout",
    startedAt: "2026-10-26T16:40:00.000Z",
    durationSeconds: o.durationSeconds === undefined ? 2880 : o.durationSeconds,
    sets: 3,
    reps: o.reps ?? 24,
    volumeKg: o.volumeKg ?? 4230,
    prs: o.prs ?? 1,
    program: null,
    exercises: [wireExercise([{ weightKg: 80, reps: 8 }], { weightKg: 80, reps: 8 })],
    muscles: { primary: ["chest"], secondary: [] },
  })

const exercise = (specs: ReadonlyArray<SetSpec>, best: SetSpec) =>
  Schema.decodeUnknownSync(ActivityExercise)(wireExercise(specs, best))

describe("exerciseSubtitle", () => {
  it("counts sets and names the best set", () => {
    const three = exercise(
      [
        { weightKg: 80, reps: 8 },
        { weightKg: 85, reps: 8 },
        { weightKg: 87.5, reps: 8 },
      ],
      { weightKg: 87.5, reps: 8 },
    )
    expect(exerciseSubtitle(three)).toBe("3 sets · best 87.5 kg × 8")
  })

  it("says '1 set' for a single set", () => {
    const one = exercise([{ weightKg: 60, reps: 10 }], { weightKg: 60, reps: 10 })
    expect(exerciseSubtitle(one)).toBe("1 set · best 60 kg × 10")
  })

  it("prints a bodyweight best (0 kg) as reps, like formatSetText", () => {
    const body = exercise(
      [
        { weightKg: 0, reps: 12 },
        { weightKg: 0, reps: 15 },
      ],
      { weightKg: 0, reps: 15 },
    )
    expect(exerciseSubtitle(body)).toBe("2 sets · best 15 reps")
  })
})

describe("setLine", () => {
  it("lists the sets, marks the PR and appends the RPE", () => {
    const line = exercise(
      [
        { weightKg: 80, reps: 8, rpe: 8 },
        { weightKg: 85, reps: 8, rpe: 8 },
        { weightKg: 87.5, reps: 8, rpe: 8, isPr: true },
      ],
      { weightKg: 87.5, reps: 8 },
    )
    expect(setLine(line)).toBe("80 kg × 8 · 85 kg × 8 · 87.5 kg × 8 PR · RPE 8")
  })

  it("shows the RPE range when the sets differ", () => {
    const line = exercise(
      [
        { weightKg: 80, reps: 8, rpe: 7 },
        { weightKg: 85, reps: 8 },
        { weightKg: 87.5, reps: 8, rpe: 8.5 },
      ],
      { weightKg: 87.5, reps: 8 },
    )
    expect(setLine(line)).toBe("80 kg × 8 · 85 kg × 8 · 87.5 kg × 8 · RPE 7–8.5")
  })

  it("has no RPE or PR segment when none was logged", () => {
    const line = exercise([{ weightKg: 60, reps: 10 }], { weightKg: 60, reps: 10 })
    expect(setLine(line)).toBe("60 kg × 10")
  })

  it("writes bodyweight sets as reps", () => {
    const line = exercise(
      [
        { weightKg: 0, reps: 12 },
        { weightKg: 0, reps: 15, isPr: true },
      ],
      { weightKg: 0, reps: 15 },
    )
    expect(setLine(line)).toBe("12 reps · 15 reps PR")
  })

  it("writes a timed exercise's sets and best as seconds (a plank reads 45 s, not 45 reps)", () => {
    const plank = Schema.decodeUnknownSync(ActivityExercise)({
      ...wireExercise(
        [
          { weightKg: 0, reps: 30 },
          { weightKg: 0, reps: 45, isPr: true },
        ],
        { weightKg: 0, reps: 45 },
      ),
      name: "Plank",
      catalogId: "plank",
    })
    expect(setLine(plank)).toBe("30 s · 45 s PR")
    expect(exerciseSubtitle(plank)).toBe("2 sets · best 45 s")
  })
})

describe("musclesLabel", () => {
  it("names primary and secondary muscles", () => {
    expect(musclesLabel(["chest", "triceps"], ["shoulders"])).toBe(
      "Muscles worked: chest, triceps; secondary: shoulders",
    )
  })

  it("drops the secondary part when there are no secondary muscles", () => {
    expect(musclesLabel(["upperBack", "lats"], [])).toBe("Muscles worked: upper back, lats")
  })

  it("says so when nothing is recorded", () => {
    expect(musclesLabel([], [])).toBe("Muscles worked: none recorded")
  })
})

describe("detailTiles", () => {
  it("is Duration, Volume, Sets, PRs", () => {
    expect(detailTiles(activityOf())).toEqual([
      { value: "48 min", caption: "Duration" },
      { value: "4,230 kg", caption: "Volume" },
      { value: "3", caption: "Sets" },
      { value: "1", caption: "PRs" },
    ])
  })

  it("swaps Volume for Reps on a bodyweight activity and dashes an unknown duration", () => {
    expect(
      detailTiles(activityOf({ durationSeconds: null, volumeKg: 0, reps: 124, prs: 0 })),
    ).toEqual([
      { value: "—", caption: "Duration" },
      { value: "124 reps", caption: "Reps" },
      { value: "3", caption: "Sets" },
      { value: "0", caption: "PRs" },
    ])
  })
})

describe("dateLine", () => {
  it("has no end time when the duration is unknown", () => {
    const line = dateLine(activityOf({ durationSeconds: null }))
    expect(line).toMatch(/^Mon 26 Oct · \d{2}:\d{2}$/)
  })

  it("adds the end time (start + duration) when it is known", () => {
    const line = dateLine(activityOf({ durationSeconds: 2880 }))
    expect(line).toMatch(/^Mon 26 Oct · \d{2}:\d{2} – \d{2}:\d{2}$/)
  })
})

describe("tilesPerRow", () => {
  it("puts the four tiles in one row in the 632 px desktop column and the 480 px minimum", () => {
    expect(tilesPerRow(632)).toBe(4)
    expect(tilesPerRow(480)).toBe(4)
  })

  it("falls back to a 2 x 2 grid in the 344 px column of a 900 px window", () => {
    expect(tilesPerRow(344)).toBe(2)
    expect(tilesPerRow(479)).toBe(2)
  })
})
