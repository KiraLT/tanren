import { describe, expect, it } from "@effect/vitest"
import { CatalogExercise, Location, Session, WorkoutSet } from "@tanren/shared"
import { Option, Schema } from "effect"
import {
  ALL,
  atLocationLabel,
  clampSubtitle,
  EQUIPMENT_OPTIONS,
  entrySubtitle,
  equipmentFromValue,
  equipmentLabel,
  facetLabel,
  humanize,
  KIND_OPTIONS,
  lastDoneText,
  MUSCLE_OPTIONS,
  muscleFromValue,
  musclesLine,
  needsLine,
  resultCount,
  segmentValue,
  subtitleMaxChars,
} from "./catalogFormat"

const decodeEntry = Schema.decodeUnknownSync(CatalogExercise)

const squat = decodeEntry({
  catalogId: "barbell-back-squat",
  name: "Barbell Back Squat",
  aliases: ["Back Squat"],
  kind: "reps",
  primaryMuscles: ["quads", "glutes"],
  secondaryMuscles: ["adductors", "lowerBack"],
  equipment: ["barbell", "smithMachine"],
  movement: "squat",
  instructions: ["Brace.", "Sit down between your hips.", "Drive up."],
  illustrationId: "barbell-back-squat",
})

const plank = decodeEntry({
  ...squat,
  name: "Plank",
  aliases: [],
  primaryMuscles: ["core"],
  secondaryMuscles: [],
  equipment: [],
})

describe("catalogFormat", () => {
  it("humanizes camelCase keys", () => {
    expect(humanize("upperBack")).toBe("Upper back")
    expect(humanize("smithMachine")).toBe("Smith machine")
    expect(humanize("core")).toBe("Core")
  })

  it("starts every facet with All and lists every schema value", () => {
    expect(MUSCLE_OPTIONS[0]).toEqual({ value: ALL, label: "All" })
    expect(MUSCLE_OPTIONS.map((o) => o.label)).toContain("Core")
    expect(EQUIPMENT_OPTIONS).toContainEqual({ value: "pullUpBar", label: "Pull-up bar" })
    expect(EQUIPMENT_OPTIONS).toContainEqual({ value: "ezBar", label: "EZ bar" })
    expect(KIND_OPTIONS.map((o) => o.label)).toEqual(["All", "Reps", "Timed", "Distance"])
  })

  it("maps segment values back to facets; All and junk are none", () => {
    expect(muscleFromValue("core")).toEqual(Option.some("core"))
    expect(muscleFromValue(ALL)).toEqual(Option.none())
    expect(equipmentFromValue("spaceship")).toEqual(Option.none())
    expect(segmentValue(Option.some("core"))).toBe("core")
    expect(segmentValue(Option.none())).toBe(ALL)
  })

  it("formats rows and detail lines", () => {
    expect(entrySubtitle(squat)).toBe("Quads, Glutes · Barbell, Smith machine")
    expect(entrySubtitle(plank)).toBe("Core · Bodyweight")
    expect(equipmentLabel([])).toBe("Bodyweight")
    expect(musclesLine(squat)).toBe("Quads, Glutes (also Adductors, Lower back)")
    expect(musclesLine(plank)).toBe("Core")
    expect(resultCount(1)).toBe("1 exercise")
    expect(resultCount(0)).toBe("0 exercises")
  })
})

const location = (name: string, equipment: ReadonlyArray<string>) =>
  Schema.decodeUnknownSync(Location)({
    id: "2d2d2d2d-2d2d-4d2d-8d2d-2d2d2d2d2d2d",
    name,
    equipment,
  })

describe("location copy", () => {
  it("the chip reads 'At <name>'", () => {
    expect(atLocationLabel(location("Home", []))).toBe("At Home")
  })

  it("an unavailable entry lists what is missing, in the entry's tag order", () => {
    const legPress = { equipment: ["legPress", "plate"] as const }
    expect(needsLine(legPress, Option.some(location("Home", ["plate"])))).toEqual(
      Option.some("Needs: Leg press"),
    )
    expect(needsLine(squat, Option.some(location("Home", [])))).toEqual(
      Option.some("Needs: Barbell, Smith machine"),
    )
  })

  it("no line when available, bodyweight, or no active location", () => {
    expect(needsLine(squat, Option.some(location("Gym", ["barbell", "smithMachine"])))).toEqual(
      Option.none(),
    )
    expect(needsLine({ equipment: [] }, Option.some(location("Home", [])))).toEqual(Option.none())
    expect(needsLine(squat, Option.none())).toEqual(Option.none())
  })

  it("hyphenated gym spellings override humanize", () => {
    expect(facetLabel("pecDeck")).toBe("Pec deck")
    expect(facetLabel("ezBar")).toBe("EZ bar")
    expect(facetLabel("assistedPullUpMachine")).toBe("Assisted pull-up machine")
    expect(facetLabel("gluteHamDeveloper")).toBe("Glute-ham developer")
  })
})

describe("clampSubtitle", () => {
  it("keeps a subtitle that fits and ends a long one with an ellipsis within the cap", () => {
    const max = subtitleMaxChars(390)
    expect(max).toBe(33)
    expect(clampSubtitle("Core · Bodyweight", max)).toBe("Core · Bodyweight")
    const long = "Chest, Triceps · Smith machine, Bench"
    const cut = clampSubtitle(long, max)
    expect(cut.length).toBeLessThanOrEqual(max)
    expect(cut.endsWith("…")).toBe(true)
    expect(long.startsWith(cut.slice(0, -1))).toBe(true)
  })

  it("subtitleMaxChars narrows with the window and never drops below 16", () => {
    expect(subtitleMaxChars(320)).toBe(24)
    expect(subtitleMaxChars(360)).toBe(30)
    expect(subtitleMaxChars(600)).toBeGreaterThan(subtitleMaxChars(390))
    expect(subtitleMaxChars(240)).toBe(16)
    expect(subtitleMaxChars(0)).toBe(16)
  })

  it("cuts at the last boundary, dropping the trailing equipment, never mid-word", () => {
    const max = subtitleMaxChars(390)
    expect(clampSubtitle("Chest, Triceps · Smith machine, Bench", max)).toBe(
      "Chest, Triceps · Smith machine…",
    )
    expect(clampSubtitle("Chest, Triceps · Chest press machine", max)).toBe("Chest, Triceps…")
  })

  it("falls back to a hard cut only when no boundary fits", () => {
    expect(clampSubtitle("Supercalifragilistic", 10)).toBe("Supercali…")
    expect(clampSubtitle("Upper back, Lats · Seated row", 8)).toBe("Upper b…")
  })

  it("keeps a short subtitle whole", () => {
    expect(clampSubtitle("Chest · Plate", 33)).toBe("Chest · Plate")
  })

  it("does not cut a subtitle that is exactly at the cap", () => {
    expect(clampSubtitle("abcde", 5)).toBe("abcde")
    expect(clampSubtitle("abcdef", 5)).toBe("abcd…")
  })
})

describe("lastDoneText", () => {
  const sessionId = "00000000-0000-4000-8000-000000000001"
  const userId = "00000000-0000-4000-8000-000000000002"
  const exerciseId = "00000000-0000-4000-8000-000000000003"
  const stamp = "2026-10-18T10:00:00.000Z"
  const decodeSession = Schema.decodeUnknownSync(Session)
  const decodeSet = Schema.decodeUnknownSync(WorkoutSet)

  /** One `ExerciseHistory["recent"]` element: a real `Session` and real `MarkedSet`s. */
  const recentOf = (day: number, loads: ReadonlyArray<readonly [number, number]>) => ({
    session: decodeSession({
      id: sessionId,
      userId,
      createdAt: stamp,
      updatedAt: stamp,
      deletedAt: null,
      startedAt: new Date(2026, 9, day, 12).toISOString(),
      finishedAt: null,
      plannedSessionId: null,
      notes: null,
    }),
    sets: loads.map(([weightKg, reps], index) => ({
      ...decodeSet({
        id: `00000000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`,
        userId,
        createdAt: stamp,
        updatedAt: stamp,
        deletedAt: null,
        sessionId,
        exerciseId,
        order: index,
        weightKg,
        reps,
        rpe: null,
        note: null,
        plannedSetId: null,
        loggedAt: stamp,
      }),
      isPr: false,
    })),
  })

  it("is None without history", () => {
    expect(lastDoneText([], "kg")).toEqual(Option.none())
    expect(lastDoneText([recentOf(18, [])], "kg")).toEqual(Option.none())
  })

  it("names the newest session's date and its heaviest set", () => {
    const recent = [
      recentOf(18, [
        [100, 5],
        [105, 5],
        [105, 3],
      ]),
      recentOf(11, [[120, 1]]),
    ]
    expect(lastDoneText(recent, "kg")).toEqual(Option.some("Last done 18 Oct · 105 kg × 5"))
  })

  it("skips a newer session that has no sets", () => {
    expect(lastDoneText([recentOf(20, []), recentOf(11, [[120, 1]])], "kg")).toEqual(
      Option.some("Last done 11 Oct · 120 kg × 1"),
    )
  })

  it("reads a bodyweight set as reps", () => {
    expect(lastDoneText([recentOf(18, [[0, 12]])], "reps")).toEqual(
      Option.some("Last done 18 Oct · 12 reps"),
    )
  })

  it("reads a timed exercise's set as seconds", () => {
    expect(lastDoneText([recentOf(18, [[0, 45]])], "s")).toEqual(
      Option.some("Last done 18 Oct · 45 s"),
    )
  })
})
