import { describe, expect, it } from "@effect/vitest"
import { CatalogExercise, Location } from "@tanren/shared"
import { DateTime, Option, Schema } from "effect"
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

  it("does not cut a subtitle that is exactly at the cap", () => {
    expect(clampSubtitle("abcde", 5)).toBe("abcde")
    expect(clampSubtitle("abcdef", 5)).toBe("abcd…")
  })
})

describe("lastDoneText", () => {
  const at = (day: number) => DateTime.makeUnsafe(new Date(2026, 9, day, 12))

  it("is None without history", () => {
    expect(lastDoneText([])).toEqual(Option.none())
    expect(lastDoneText([{ session: { startedAt: at(18) }, sets: [] }])).toEqual(Option.none())
  })

  it("names the newest session's date and its heaviest set", () => {
    const recent = [
      {
        session: { startedAt: at(18) },
        sets: [
          { weightKg: 100, reps: 5 },
          { weightKg: 105, reps: 5 },
          { weightKg: 105, reps: 3 },
        ],
      },
      { session: { startedAt: at(11) }, sets: [{ weightKg: 120, reps: 1 }] },
    ]
    expect(lastDoneText(recent)).toEqual(Option.some("Last done 18 Oct · 105 kg × 5"))
  })

  it("reads a bodyweight set as reps", () => {
    expect(
      lastDoneText([{ session: { startedAt: at(18) }, sets: [{ weightKg: 0, reps: 12 }] }]),
    ).toEqual(Option.some("Last done 18 Oct · 12 reps"))
  })
})
