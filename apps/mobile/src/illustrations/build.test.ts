import { describe, expect, it } from "@effect/vitest"
import { CATALOG } from "@tanren/shared"
import { Option } from "effect"
import {
  batchModule,
  buildOutputs,
  contactSheet,
  isBatchFile,
  muscleFor,
  renderBatches,
} from "./build"
import { scenes } from "./scenes/b00"

const batches = [{ name: "b00", scenes }]

describe("build", () => {
  it("discovers batch files by name only", () => {
    expect(["b00.ts", "b13.ts", "b00.test.ts", "index.ts", "b1.ts"].filter(isBatchFile)).toEqual([
      "b00.ts",
      "b13.ts",
    ])
  })

  it("takes the accent muscle from the catalog's first primary muscle", () => {
    expect(muscleFor(CATALOG, "barbell-back-squat")).toEqual(Option.some("quads"))
    expect(muscleFor(CATALOG, "no-such-id")).toEqual(Option.none())
  })

  it("writes one SVG per scene, one module per batch and the index", () => {
    const paths = buildOutputs(batches, CATALOG).map((file) => file.path)
    expect(paths).toContain("assets/exercises/plank.svg")
    expect(paths).toContain("src/illustrations/generated/b00.ts")
    expect(paths).toContain("src/illustrations/generated/index.ts")
    expect(paths).toHaveLength(scenes.length + 2)
  })

  it("quotes only non-identifier keys and breaks long entries after the colon (Biome shape)", () => {
    const module = batchModule("b99", [
      { id: "plank", batch: "b99", muscle: Option.none(), svg: "<svg/>" },
      { id: "pull-up", batch: "b99", muscle: Option.none(), svg: `<svg>${"x".repeat(100)}</svg>` },
    ])
    expect(module).toContain("  plank: '<svg/>',\n")
    expect(module).toContain(`  "pull-up":\n    '<svg>`)
  })

  it("labels every contact-sheet card with id, batch and muscle", () => {
    const sheet = contactSheet(renderBatches(batches, CATALOG))
    expect(sheet).toContain("plank · b00 · core")
    expect(sheet.match(/<figure>/g)).toHaveLength(scenes.length)
  })
})
