import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import type { CatalogEquipment } from "@tanren/shared"
import { Option } from "effect"
import {
  APPEARANCE_OPTIONS,
  aboutTitle,
  equipmentGlyph,
  presetItemsLabel,
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

describe("presetItemsLabel", () => {
  it("counts items and says bodyweight only for none", () => {
    expect(presetItemsLabel(0)).toBe("Bodyweight only")
    expect(presetItemsLabel(1)).toBe("1 item")
    expect(presetItemsLabel(24)).toBe("24 items")
  })
})

describe("equipmentGlyph", () => {
  it("maps equipment with a drawn glyph and leaves the rest bare", () => {
    expect(equipmentGlyph("kettlebell")).toEqual(Option.some("kettlebell"))
    expect(equipmentGlyph("barbell")).toEqual(Option.some("dumbbell"))
    expect(equipmentGlyph("cable")).toEqual(Option.none())
  })

  it("leaves bench bare (the home glyph was the wrong picture)", () => {
    expect(equipmentGlyph("bench")).toEqual(Option.none())
  })

  it("takes only catalog equipment literals", () => {
    expectTypeOf(equipmentGlyph).parameter(0).toEqualTypeOf<CatalogEquipment>()
  })
})
