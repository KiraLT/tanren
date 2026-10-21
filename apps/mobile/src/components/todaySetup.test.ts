import { describe, expect, it } from "@effect/vitest"
import { Location } from "@tanren/shared"
import { Option, Schema } from "effect"
import { needsEquipmentSetup } from "./todaySetup"

const home = Schema.decodeUnknownSync(Location)({
  id: "2d2d2d2d-2d2d-4d2d-8d2d-2d2d2d2d2d2d",
  name: "Home",
  equipment: [],
})

describe("needsEquipmentSetup", () => {
  it("hides the card while the profile is loading", () => {
    expect(needsEquipmentSetup({ _tag: "Loading" })).toBe(false)
  })

  it("shows the card when there is no profile yet", () => {
    expect(needsEquipmentSetup({ _tag: "Loaded", profile: Option.none() })).toBe(true)
  })

  it("shows the card while the profile has no location", () => {
    expect(needsEquipmentSetup({ _tag: "Loaded", profile: Option.some({ locations: [] }) })).toBe(
      true,
    )
  })

  it("hides the card once a location exists, even a bodyweight one", () => {
    expect(
      needsEquipmentSetup({ _tag: "Loaded", profile: Option.some({ locations: [home] }) }),
    ).toBe(false)
  })
})
