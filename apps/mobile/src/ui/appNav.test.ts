import { describe, expect, it } from "@effect/vitest"
import { APP_NAV, isActivePath } from "./appNav"

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

describe("isActivePath", () => {
  it("matches the route and its children, not a sibling with the same prefix", () => {
    expect(isActivePath("/plan", "/plan")).toBe(true)
    expect(isActivePath("/progress/exercise/abc", "/progress")).toBe(true)
    expect(isActivePath("/planner", "/plan")).toBe(false)
    expect(isActivePath("/today", "/plan")).toBe(false)
  })
})
