import { describe, expect, it } from "@effect/vitest"
import { APP_NAV, isActivePath } from "./appNav"
import { iconPaths } from "./iconPaths"

describe("APP_NAV", () => {
  it("lists the five destinations in tab order", () => {
    expect(APP_NAV.map((link) => link.label)).toEqual([
      "Feed",
      "Today",
      "Plan",
      "Programs",
      "Library",
    ])
  })
})

describe("APP_NAV glyphs", () => {
  it("gives the tabs their glyphs in order, and each route name is its href", () => {
    expect(APP_NAV.map((link) => link.icon)).toEqual(["flame", "zap", "calendar", "grid", "book"])
    expect(APP_NAV.every((link) => link.href === `/${link.name}`)).toBe(true)
  })

  it("only names glyphs that exist", () => {
    expect(APP_NAV.filter((link) => !(link.icon in iconPaths))).toEqual([])
  })
})

describe("isActivePath", () => {
  it("matches the route and its children, not a sibling with the same prefix", () => {
    expect(isActivePath("/plan", "/plan")).toBe(true)
    expect(isActivePath("/feed", "/feed")).toBe(true)
    expect(isActivePath("/feed/x", "/feed")).toBe(true)
    expect(isActivePath("/feedback", "/feed")).toBe(false)
    expect(isActivePath("/planner", "/plan")).toBe(false)
    expect(isActivePath("/today", "/plan")).toBe(false)
  })
})
