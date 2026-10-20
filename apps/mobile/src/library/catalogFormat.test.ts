import { describe, expect, it } from "@effect/vitest"
import { CatalogExercise } from "@tanren/shared"
import { Option, Schema } from "effect"
import {
  ALL,
  EQUIPMENT_OPTIONS,
  entrySubtitle,
  equipmentFromValue,
  equipmentLabel,
  humanize,
  KIND_OPTIONS,
  MUSCLE_OPTIONS,
  muscleFromValue,
  musclesLine,
  resultCount,
  segmentValue,
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
