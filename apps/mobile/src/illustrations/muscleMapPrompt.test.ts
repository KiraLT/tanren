import { Result } from "effect"
import { describe, expect, it } from "vitest"
import { MUSCLE_ANATOMY, muscleMapPrompt, parseMuscleArgs, SAMPLE_MAPS } from "./muscleMapPrompt"

describe("muscleMapPrompt", () => {
  const prompt = muscleMapPrompt({
    name: "x",
    view: "back",
    primary: ["lats"],
    secondary: ["biceps", "fullBody"],
  })

  it("states the view", () => {
    expect(prompt).toContain("back view, seen from behind")
    expect(muscleMapPrompt({ name: "x", view: "front", primary: [], secondary: [] })).toContain(
      "front view, facing the viewer",
    )
  })

  it("puts primary muscles in the accent and secondary in the tint, dropping undrawable ones", () => {
    expect(prompt).toContain("Primary muscles (burnt orange): latissimus dorsi")
    expect(prompt).toContain(
      "Secondary muscles (light peach): biceps on the front of the upper arms.",
    )
  })

  it("asks for a transparent background and no text", () => {
    expect(prompt).toContain("fully transparent")
    expect(prompt).toContain("no text")
  })

  it("says none for an empty list", () => {
    expect(
      muscleMapPrompt({ name: "x", view: "front", primary: ["chest"], secondary: [] }),
    ).toContain("Secondary muscles (light peach): none.")
  })

  it("names every drawable catalog muscle", () => {
    const drawable = Object.values(MUSCLE_ANATOMY).filter((a) => a._tag === "Some")
    expect(drawable).toHaveLength(15)
  })

  it("samples cover both views with unique names", () => {
    expect(new Set(SAMPLE_MAPS.map((s) => s.view))).toEqual(new Set(["front", "back"]))
    expect(new Set(SAMPLE_MAPS.map((s) => s.name)).size).toBe(SAMPLE_MAPS.length)
  })
})

describe("parseMuscleArgs", () => {
  it("requires --out <dir>", () => {
    expect(parseMuscleArgs(["--", "--out", "/tmp/m"])).toEqual(Result.succeed("/tmp/m"))
    expect(Result.isFailure(parseMuscleArgs([]))).toBe(true)
    expect(Result.isFailure(parseMuscleArgs(["--out"]))).toBe(true)
    expect(Result.isFailure(parseMuscleArgs(["--out", "/tmp/m", "--all"]))).toBe(true)
  })
})
