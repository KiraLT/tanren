import { describe, expect, it } from "@effect/vitest"
import { MuscleGroup } from "@tanren/shared"
import { MUSCLE_REGION_MAP, muscleMapLabel, REGION_IDS, regionsFor, regionTone } from "./regions"

describe("MUSCLE_REGION_MAP", () => {
  it("maps every taxonomy literal to at least one region", () => {
    const uncovered = MuscleGroup.literals.filter(
      (muscle) => MUSCLE_REGION_MAP[muscle].length === 0,
    )
    expect(uncovered).toEqual([])
  })

  it("only names known regions and draws every region for some literal", () => {
    const used = new Set(Object.values(MUSCLE_REGION_MAP).flat())
    expect([...used].filter((id) => !REGION_IDS.includes(id))).toEqual([])
    expect(REGION_IDS.filter((id) => !used.has(id))).toEqual([])
  })

  it("splits the coarse literals into their drawn heads", () => {
    expect(regionsFor(["shoulders"])).toEqual(["frontDelts", "sideDelts", "rearDelts"])
    expect(regionsFor(["core"])).toEqual(["abs", "obliques"])
    expect(regionsFor(["cardio"])).toEqual(["heart"])
    expect(regionsFor(["fullBody"])).not.toContain("heart")
  })

  it("deduplicates regions shared by several literals", () => {
    expect(regionsFor(["fullBody", "chest"]).filter((id) => id === "chest")).toEqual(["chest"])
  })
})

describe("regionTone", () => {
  const tone = regionTone(["quads", "glutes"], ["hamstrings", "quads"])

  it("paints primary, then secondary, else idle", () => {
    expect(tone("quads")).toBe("primary")
    expect(tone("glutes")).toBe("primary")
    expect(tone("hamstrings")).toBe("secondary")
    expect(tone("chest")).toBe("idle")
  })

  it("leaves every region idle with no muscles", () => {
    const none = regionTone([], [])
    expect(REGION_IDS.filter((id) => none(id) !== "idle")).toEqual([])
  })
})

describe("muscleMapLabel", () => {
  it("lists primary and secondary muscles in sentence case", () => {
    expect(muscleMapLabel(["quads", "glutes"], ["upperBack"])).toBe(
      "Muscle map. Primary: quads, glutes. Secondary: upper back.",
    )
  })

  it("omits an empty group and says when nothing is highlighted", () => {
    expect(muscleMapLabel(["biceps"], [])).toBe("Muscle map. Primary: biceps.")
    expect(muscleMapLabel([], [])).toBe("Muscle map, no muscles highlighted.")
  })
})
