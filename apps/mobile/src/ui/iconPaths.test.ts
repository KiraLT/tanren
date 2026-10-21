import { describe, expect, it } from "@effect/vitest"
import { type IconName, iconPaths } from "./iconPaths"

/** ui-direction-final §6: every glyph the screens and chrome name. */
const REQUIRED: ReadonlyArray<IconName> = [
  "zap",
  "calendar",
  "grid",
  "book",
  "chart",
  "home",
  "dumbbell",
  "kettlebell",
  "band",
  "bodyweight",
  "target",
  "repeat",
  "timer",
  "clock",
  "flame",
  "check",
  "plus",
  "minus",
  "swap",
  "chevronRight",
  "chevronLeft",
  "more",
  "info",
  "warning",
  "search",
  "filter",
  "mapPin",
  "settings",
  "logout",
  "sun",
  "moon",
  "close",
  "play",
  "pause",
  "skip",
]

/** Path data: a command letter starts every segment; only numbers, separators and commands. */
const PATH_DATA = /^M[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]*$/

describe("iconPaths", () => {
  it("has every glyph in the design list", () => {
    const names = new Set<string>(Object.keys(iconPaths))
    expect(REQUIRED.filter((name) => !names.has(name))).toEqual([])
  })

  it("draws each glyph as a non-empty path string", () => {
    const bad = Object.entries(iconPaths).filter(
      ([, d]) => typeof d !== "string" || d.length < 4 || !PATH_DATA.test(d),
    )
    expect(bad).toEqual([])
  })

  it("keeps the extra glyphs the app already used", () => {
    expect(Object.keys(iconPaths)).toEqual(expect.arrayContaining(["chevronDown", "list", "user"]))
  })
})
