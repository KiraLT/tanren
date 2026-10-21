import { CATALOG } from "@tanren/shared"
import { Array as Arr, Order, Result } from "effect"
import { describe, expect, it } from "vitest"
import {
  DRAWABLE_MUSCLES,
  MUSCLE_ANATOMY,
  muscleMapPrompt,
  muscleTiers,
  parseMuscleArgs,
  SAMPLE_IDS,
  selectMaps,
} from "./muscleMapPrompt"

const latPulldown = {
  catalogId: "lat-pulldown",
  primaryMuscles: ["lats"],
  secondaryMuscles: ["upperBack", "biceps", "forearms", "cardio"],
} as const

describe("muscleMapPrompt", () => {
  const prompt = muscleMapPrompt(latPulldown)

  it("asks for both views side by side in one image", () => {
    expect(prompt).toContain("LEFT figure is the FRONT view")
    expect(prompt).toContain("RIGHT figure is the BACK view")
  })

  const line = (prefix: string) => prompt.split("\n").find((l) => l.startsWith(prefix)) ?? ""
  const front = line("LEFT figure (front view)")
  const back = line("RIGHT figure (back view)")

  it("lists every listed muscle on the figure it is visible on, dropping undrawable ones", () => {
    expect(front).toContain(
      "No primary muscles on this figure. Pale peach #FDBA74 on biceps (front of the upper arms); forearms.",
    )
    expect(back).toContain(
      "Solid ember #C2410C on latissimus dorsi (the wide wing-shaped muscles on the sides of the mid back, below the armpits). Pale peach #FDBA74 on rhomboids and middle trapezius (between the shoulder blades); forearms.",
    )
    expect(prompt).not.toContain("cardio")
  })

  it("names the grey neighbours per figure, traps included on the back", () => {
    const backGrey = back.split("NOT coloured:")[1] ?? ""
    expect(backGrey).toContain("upper trapezius")
    expect(backGrey).not.toContain("latissimus")
    expect(front).toContain("NOT coloured: chest (pectorals)")
  })

  it("says only these are coloured", () => {
    expect(prompt).toContain(
      "Only these muscles are coloured. Every other muscle stays the neutral grey; do not colour neighbouring muscles.",
    )
  })

  it("uses the neutral body grey, a transparent background and no text", () => {
    expect(prompt).toContain("#8A919B")
    expect(prompt).toContain("fully transparent")
    expect(prompt).toContain("no text")
  })

  it("names an empty tier explicitly instead of listing nothing", () => {
    expect(
      muscleMapPrompt({ catalogId: "x", primaryMuscles: ["chest"], secondaryMuscles: [] }),
    ).toContain("No secondary muscles on this figure.")
  })
})

describe("muscleTiers", () => {
  it("partitions every drawable muscle exactly once", () => {
    const tiers = muscleTiers(latPulldown)
    expect(tiers.primary).toEqual(["lats"])
    expect(tiers.secondary).toEqual(["upperBack", "biceps", "forearms"])
    const sorted = Arr.sort(Order.String)
    expect(sorted([...tiers.primary, ...tiers.secondary, ...tiers.grey])).toEqual(
      sorted(DRAWABLE_MUSCLES),
    )
  })

  it("expands fullBody to every drawable muscle and keeps primary over secondary", () => {
    const tiers = muscleTiers({
      catalogId: "x",
      primaryMuscles: ["fullBody"],
      secondaryMuscles: ["core"],
    })
    expect(tiers.primary).toEqual(DRAWABLE_MUSCLES)
    expect(tiers.secondary).toEqual([])
    expect(tiers.grey).toEqual([])
  })

  it("knows 15 drawable muscles", () => {
    expect(DRAWABLE_MUSCLES).toHaveLength(15)
    expect(MUSCLE_ANATOMY.fullBody._tag).toBe("None")
  })
})

describe("parseMuscleArgs", () => {
  it("requires --out <dir> and defaults to the samples", () => {
    expect(parseMuscleArgs(["--", "--out", "/tmp/m"])).toEqual(
      Result.succeed({ out: "/tmp/m", selection: { _tag: "Samples" } }),
    )
    expect(Result.isFailure(parseMuscleArgs([]))).toBe(true)
    expect(Result.isFailure(parseMuscleArgs(["--out"]))).toBe(true)
    expect(Result.isFailure(parseMuscleArgs(["--out", "/tmp/m", "--bogus"]))).toBe(true)
  })

  it("reads --catalog <id,…> in any order", () => {
    expect(parseMuscleArgs(["--catalog", "plank, face-pull", "--out", "o"])).toEqual(
      Result.succeed({ out: "o", selection: { _tag: "Ids", ids: ["plank", "face-pull"] } }),
    )
  })

  it("reads --catalog --all and rejects half-forms", () => {
    expect(parseMuscleArgs(["--catalog", "--all", "--out", "o"])).toEqual(
      Result.succeed({ out: "o", selection: { _tag: "All" } }),
    )
    expect(Result.isFailure(parseMuscleArgs(["--out", "o", "--all"]))).toBe(true)
    expect(Result.isFailure(parseMuscleArgs(["--out", "o", "--catalog"]))).toBe(true)
    expect(Result.isFailure(parseMuscleArgs(["--out", "o", "--catalog", ","]))).toBe(true)
    expect(Result.isFailure(parseMuscleArgs(["--out", "o", "--catalog", "a", "--all"]))).toBe(true)
  })
})

describe("selectMaps", () => {
  it("finds every sample id in the catalog", () => {
    const samples = Result.getOrThrow(selectMaps({ _tag: "Samples" }, CATALOG))
    expect(samples.map((e) => e.catalogId)).toEqual(SAMPLE_IDS)
  })

  it("returns the whole catalog for --all and fails on unknown ids", () => {
    expect(Result.getOrThrow(selectMaps({ _tag: "All" }, CATALOG))).toHaveLength(CATALOG.length)
    expect(selectMaps({ _tag: "Ids", ids: ["plank", "nope"] }, CATALOG)).toEqual(
      Result.fail("unknown catalog id nope"),
    )
  })
})
