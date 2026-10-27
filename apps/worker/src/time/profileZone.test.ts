import { describe, expect, it } from "@effect/vitest"
import { Profile, TimeZone, UserId } from "@tanren/shared"
import { DateTime, Option } from "effect"
import { liveProfile, zoneOfProfile } from "./profileZone"

const USER = UserId.make("00000000-0000-4000-8000-000000000001")
const NOW = DateTime.makeUnsafe("2026-10-27T10:00:00.000Z")

const profile = (deletedAt: Option.Option<DateTime.Utc>): Profile =>
  Profile.make({
    id: USER,
    userId: USER,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt,
    goals: [],
    constraints: [],
    availableDays: [],
    locations: [],
    activeLocationId: Option.none(),
    timezone: TimeZone.make("Europe/Vilnius"),
    nutrition: Option.none(),
  })

describe("profileZone", () => {
  it("a live profile gives its own zone", () => {
    const stored = Option.some(profile(Option.none()))
    expect(zoneOfProfile(stored)).toBe("Europe/Vilnius")
    expect(Option.isSome(liveProfile(stored))).toBe(true)
  })

  it("no profile falls back to UTC", () => {
    expect(zoneOfProfile(Option.none())).toBe("UTC")
    expect(liveProfile(Option.none())).toEqual(Option.none())
  })

  it("a deleted profile counts as absent: UTC", () => {
    const stored = Option.some(profile(Option.some(NOW)))
    expect(zoneOfProfile(stored)).toBe("UTC")
    expect(liveProfile(stored)).toEqual(Option.none())
  })
})
