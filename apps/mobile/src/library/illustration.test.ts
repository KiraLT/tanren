import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { illustrationXml, placeholderSvg } from "./illustration"
import { ILLUSTRATIONS } from "./illustrationMap"

describe("illustration", () => {
  it("finds a drawn id and reports a missing one as none", () => {
    const map = { plank: "<svg/>" }
    expect(illustrationXml(map, "plank")).toEqual(Option.some("<svg/>"))
    expect(illustrationXml(map, "squat")).toEqual(Option.none())
  })

  it("the generated map draws plank as an svg and leaves an undrawn id to the placeholder", () => {
    const plank = illustrationXml(ILLUSTRATIONS, "plank")
    expect(Option.isSome(plank) && plank.value.startsWith("<svg")).toBe(true)
    expect(illustrationXml(ILLUSTRATIONS, "no-such-exercise")).toEqual(Option.none())
  })

  it("placeholder is a single self-contained svg in the given colour", () => {
    const svg = placeholderSvg("#71717A")
    expect(svg.startsWith("<svg ")).toBe(true)
    expect(svg.endsWith("</svg>")).toBe(true)
    expect(svg).toContain('viewBox="0 0 120 120"')
    expect(svg).toContain('stroke="#71717A"')
    expect(svg).not.toMatch(/<script|<image|style=/)
  })
})
