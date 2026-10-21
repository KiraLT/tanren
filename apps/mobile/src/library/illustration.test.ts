import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import { CATALOG } from "@tanren/shared"
import { Array as Arr, Option, Order } from "effect"
import { IMAGE_DIR, IMAGE_MAP_FILE } from "../illustrations/imagePrompt"
import { illustrationImage, placeholderSvg } from "./illustration"

const packageRoot = join(import.meta.dirname, "../..")

describe("illustration image", () => {
  it("finds the webp for a catalog id and leaves a missing id to the placeholder", () => {
    const images = { plank: 7 }
    expect(illustrationImage(images, "plank")).toEqual(Option.some(7))
    expect(illustrationImage(images, "no-such-exercise")).toEqual(Option.none())
  })

  // images.ts holds Metro `require`s of .webp files, which Node cannot load: read it as text.
  it("the generated map has one require per webp on disk, each a catalog id", () => {
    const source = readFileSync(join(packageRoot, IMAGE_MAP_FILE), "utf8")
    const keys = [
      // Biome unquotes identifier keys (`plank:`) and may wrap a long entry, hence `"?` and `\s*`.
      ...source.matchAll(/"?([a-z0-9-]+)"?:\s*require\(\s*"[^"]+\/\1\.webp",?\s*\)/g),
    ].flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
    const files = readdirSync(join(packageRoot, IMAGE_DIR))
      .filter((file) => file.endsWith(".webp"))
      .map((file) => file.replace(/\.webp$/, ""))
    expect(Arr.sort(keys, Order.String)).toEqual(Arr.sort(files, Order.String))
    const catalogIds = CATALOG.map((entry): string => entry.catalogId)
    expect(keys.filter((id) => !catalogIds.includes(id))).toEqual([])
  })
})

describe("illustration", () => {
  it("placeholder is a single self-contained svg in the given colour", () => {
    const svg = placeholderSvg("#71717A")
    expect(svg.startsWith("<svg ")).toBe(true)
    expect(svg.endsWith("</svg>")).toBe(true)
    expect(svg).toContain('viewBox="0 0 120 120"')
    expect(svg).toContain('stroke="#71717A"')
    expect(svg).not.toMatch(/<script|<image|style=/)
  })
})
