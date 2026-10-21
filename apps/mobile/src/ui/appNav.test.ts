import { describe, expect, it } from "@effect/vitest"
import { APP_NAV, isActivePath } from "./appNav"
import { iconPaths } from "./iconPaths"

describe("APP_NAV", () => {
  it("lists the five destinations in tab order", () => {
    expect(APP_NAV.map((link) => link.label)).toEqual([
      "Today",
      "Plan",
      "Programs",
      "Library",
      "Progress",
    ])
  })
})

describe("APP_NAV glyphs", () => {
  it("gives the tabs their glyphs in order, and each route name is its href", () => {
    expect(APP_NAV.map((link) => link.icon)).toEqual(["zap", "calendar", "grid", "book", "chart"])
    expect(APP_NAV.every((link) => link.href === `/${link.name}`)).toBe(true)
  })

  it("only names glyphs that exist", () => {
    expect(APP_NAV.filter((link) => !(link.icon in iconPaths))).toEqual([])
  })
})

describe("isActivePath", () => {
  it("matches the route and its children, not a sibling with the same prefix", () => {
    expect(isActivePath("/plan", "/plan")).toBe(true)
    expect(isActivePath("/progress/exercise/abc", "/progress")).toBe(true)
    expect(isActivePath("/planner", "/plan")).toBe(false)
    expect(isActivePath("/today", "/plan")).toBe(false)
  })
})
