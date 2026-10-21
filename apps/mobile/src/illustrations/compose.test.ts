import { describe, expect, it } from "@effect/vitest"
import { CATALOG, MuscleGroup } from "@tanren/shared"
import { Option } from "effect"
import { muscleFor } from "./build"
import { MUSCLE_REGIONS, renderScene } from "./compose"
import { scenes } from "./scenes/b00"
import { MAX_BYTES } from "./style"
import { byteLength, validateSvg } from "./validate"

const plank = scenes.find((scene) => scene.id === "plank")

describe("renderScene", () => {
  it("is deterministic: the same scene renders the same string", () => {
    scenes.forEach((scene) => {
      expect(renderScene(scene, "core")).toBe(renderScene(scene, "core"))
    })
  })

  it.each(scenes.map((scene) => [scene.id, scene] as const))(
    "b00 %s passes the validator and stays under MAX_BYTES",
    (id, scene) => {
      const svg = renderScene(scene, Option.getOrUndefined(muscleFor(CATALOG, id)))
      expect(validateSvg(id, svg)).toEqual([])
      expect(byteLength(svg)).toBeLessThanOrEqual(MAX_BYTES)
    },
  )

  it("every b00 id has a catalog entry with a primary muscle", () => {
    scenes.forEach((scene) => {
      expect(muscleFor(CATALOG, scene.id)._tag).toBe("Some")
    })
  })

  it("maps every MuscleGroup to a region and draws exactly one accent region for each", () => {
    expect(Object.keys(MUSCLE_REGIONS).length).toBe(MuscleGroup.literals.length)
    expect(plank).toBeDefined()
    MuscleGroup.literals.forEach((muscle) => {
      expect(MUSCLE_REGIONS[muscle]).toBeDefined()
      scenes.forEach((scene) => {
        const svg = renderScene(scene, muscle)
        expect(svg.match(/stroke="#F0632A"/g)?.length).toBe(1)
        expect(validateSvg(scene.id, svg)).toEqual([])
      })
    })
  })

  it("renders Scene.accent paths neutral at stroke 1.5 and no region without a muscle", () => {
    const base = scenes[0]
    expect(base).toBeDefined()
    const svg = base === undefined ? "" : renderScene({ ...base, accent: ["M10 10L20 20"] })
    expect(svg).toContain('<path d="M10 10L20 20" stroke-width="1.5"/>')
    expect(svg).not.toContain("#F0632A")
  })
})
