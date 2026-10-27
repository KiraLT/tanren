import { describe, expect, it } from "@effect/vitest"
import { APP_NAV, isActivePath } from "./appNav"
import { iconPaths } from "./iconPaths"

describe("APP_NAV", () => {
  it("lists Home, Train, Activity and You in tab order", () => {
    expect(APP_NAV.map((link) => link.label)).toEqual(["Home", "Train", "Activity", "You"])
    expect(APP_NAV.map((link) => link.href)).toEqual(["/home", "/train", "/activity", "/you"])
  })
})

describe("APP_NAV glyphs", () => {
  it("gives the tabs their glyphs in order, and each route name is its href", () => {
    expect(APP_NAV.map((link) => link.icon)).toEqual(["home", "dumbbell", "flame", "user"])
    expect(APP_NAV.every((link) => link.href === `/${link.name}`)).toBe(true)
  })

  it("only names glyphs that exist", () => {
    expect(APP_NAV.filter((link) => !(link.icon in iconPaths))).toEqual([])
  })
})

describe("isActivePath", () => {
  it("matches the route and its children, not a sibling with the same prefix", () => {
    expect(isActivePath("/train", "/train")).toBe(true)
    expect(isActivePath("/activity", "/activity")).toBe(true)
    expect(isActivePath("/activity/x", "/activity")).toBe(true)
    expect(isActivePath("/activityx", "/activity")).toBe(false)
    expect(isActivePath("/trainer", "/train")).toBe(false)
    expect(isActivePath("/home", "/train")).toBe(false)
    expect(isActivePath("/you", "/you")).toBe(true)
    expect(isActivePath("/you/x", "/you")).toBe(true)
    expect(isActivePath("/young", "/you")).toBe(false)
  })
})
