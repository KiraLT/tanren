import { describe, expect, it } from "@effect/vitest"
import {
  APPEARANCE_OPTIONS,
  aboutTitle,
  signOutFailureBody,
  signOutFailureTitle,
} from "./settingsCopy"

describe("signOutFailureTitle", () => {
  it("says sign-out needs a connection when offline", () => {
    expect(signOutFailureTitle("offline")).toBe("Sign-out needs a connection")
  })

  it("says sign-out failed when the server refused", () => {
    expect(signOutFailureTitle("server")).toBe("Sign-out failed")
  })
})

describe("signOutFailureBody", () => {
  it("reassures that nothing changed offline", () => {
    expect(signOutFailureBody("offline")).toContain("Nothing on this device changed")
  })
})

describe("aboutTitle", () => {
  it("appends the app version", () => {
    expect(aboutTitle("0.1.0")).toBe("Tanren 0.1.0")
  })

  it("is just the name without a version", () => {
    expect(aboutTitle(undefined)).toBe("Tanren")
    expect(aboutTitle("")).toBe("Tanren")
  })
})

describe("APPEARANCE_OPTIONS", () => {
  it("offers System, Light and Dark in that order", () => {
    expect(APPEARANCE_OPTIONS.map((option) => option.value)).toEqual(["system", "light", "dark"])
  })
})
