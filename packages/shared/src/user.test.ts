import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import { failingPaths, roundTrips, wireRoundTrips } from "./testing"
import { Goal, Location, Profile, ProfileInsert, ProfilePatch } from "./user"

const userId = "0b9f5c1e-6d43-4c1a-9a3e-2f4f1a2b3c4d"
const gymId = "1c1c1c1c-1c1c-4c1c-8c1c-1c1c1c1c1c1c"
const homeId = "2d2d2d2d-2d2d-4d2d-8d2d-2d2d2d2d2d2d"

const profileFields = {
  goals: [
    { kind: "strength", note: null },
    { kind: "other", note: "climb 7a" },
  ],
  constraints: ["no overhead pressing, left shoulder"],
  availableDays: ["mon", "wed", "fri"],
  locations: [
    { id: gymId, name: "Gym", equipment: ["barbell", "rack", "legPress"] },
    { id: homeId, name: "Home", equipment: [] },
  ],
  activeLocationId: homeId,
  timezone: "Europe/Berlin",
}

const profileWire = {
  id: userId,
  userId,
  createdAt: "2026-10-19T08:00:00.000Z",
  updatedAt: "2026-10-19T09:30:00.000Z",
  deletedAt: null,
  ...profileFields,
}

describe("Goal", () => {
  it.effect("rejects kind other without a note at path note", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(Goal, { kind: "other", note: null })).toEqual([["note"]])
    }),
  )
})

describe("Profile", () => {
  it.effect("round-trips the wire shape, with null decoded as None", () =>
    Effect.gen(function* () {
      const profile = yield* Schema.decodeUnknownEffect(Profile)(profileWire)
      expect(Option.isNone(profile.deletedAt)).toBe(true)
      expect(profile.goals.map((goal) => Option.isNone(goal.note))).toEqual([true, false])
      expect(yield* Schema.encodeEffect(Profile)(profile)).toEqual(profileWire)
    }),
  )

  it.effect("decode(encode(profile)) equals the original", () =>
    Effect.gen(function* () {
      const profile = yield* Schema.decodeUnknownEffect(Profile)(profileWire)
      yield* roundTrips(Profile, profile)
    }),
  )

  it.effect("rejects duplicate available days", () =>
    Effect.gen(function* () {
      const paths = yield* failingPaths(Profile, { ...profileWire, availableDays: ["mon", "mon"] })
      expect(paths).toEqual([["availableDays"]])
    }),
  )
})

describe("Location", () => {
  const home: (typeof Location)["Encoded"] = {
    id: homeId,
    name: "Home",
    equipment: ["dumbbell", "bench"],
  }

  it.effect("decodes and round-trips a location", () =>
    Effect.gen(function* () {
      yield* wireRoundTrips(Location, home)
    }),
  )

  it.effect("rejects an unknown equipment literal at its index", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(Location, { ...home, equipment: ["bench", "machine"] })).toEqual([
        ["equipment", 1],
      ])
    }),
  )

  it.effect("rejects duplicate equipment and an empty name at their paths", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(Location, { ...home, equipment: ["bench", "bench"] })).toEqual([
        ["equipment"],
      ])
      expect(yield* failingPaths(Location, { ...home, name: "  " })).toEqual([["name"]])
    }),
  )

  it.effect("rejects a non-UUID id at id", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(Location, { ...home, id: "home" })).toEqual([["id"]])
    }),
  )
})

describe("Profile locations (ADR-0016)", () => {
  it.effect("an active id that is not one of the locations fails at activeLocationId", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(Profile, { ...profileWire, activeLocationId: userId })).toEqual([
        ["activeLocationId"],
      ])
    }),
  )

  it.effect("duplicate location ids fail at locations", () =>
    Effect.gen(function* () {
      const twice = { id: homeId, name: "Home", equipment: [] }
      expect(yield* failingPaths(Profile, { ...profileWire, locations: [twice, twice] })).toEqual([
        ["locations"],
      ])
    }),
  )

  it.effect("eleven locations fail at locations", () =>
    Effect.gen(function* () {
      const many = Array.from({ length: 11 }, (_, n) => ({
        id: `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`,
        name: `Place ${n}`,
        equipment: [],
      }))
      const paths = yield* failingPaths(Profile, {
        ...profileWire,
        locations: many,
        activeLocationId: null,
      })
      expect(paths).toEqual([["locations"]])
    }),
  )

  it.effect("a pre-v3 wire row without the keys decodes to no locations and no active one", () =>
    Effect.gen(function* () {
      const { locations: _l, activeLocationId: _a, ...legacy } = profileWire
      const profile = yield* Schema.decodeUnknownEffect(Profile)(legacy)
      expect(profile.locations).toEqual([])
      expect(Option.isNone(profile.activeLocationId)).toBe(true)
    }),
  )

  it.effect("a pre-v3 wire row still carrying equipment decodes and encodes without it", () =>
    Effect.gen(function* () {
      const legacy = { ...profileWire, equipment: [{ kind: "barbell", note: null }] }
      const profile = yield* Schema.decodeUnknownEffect(Profile)(legacy)
      expect("equipment" in (yield* Schema.encodeEffect(Profile)(profile))).toBe(false)
    }),
  )

  it.effect("a null active id decodes to None and encodes back to null", () =>
    Effect.gen(function* () {
      const wire = { ...profileWire, activeLocationId: null }
      const profile = yield* Schema.decodeUnknownEffect(Profile)(wire)
      expect(Option.isNone(profile.activeLocationId)).toBe(true)
      expect(yield* Schema.encodeEffect(Profile)(profile)).toEqual(wire)
    }),
  )
})

describe("ProfileInsert", () => {
  it.effect("round-trips the payload without row columns", () =>
    Effect.gen(function* () {
      const insert = yield* Schema.decodeUnknownEffect(ProfileInsert)(profileFields)
      expect(yield* Schema.encodeEffect(ProfileInsert)(insert)).toEqual(profileFields)
    }),
  )
})

describe("ProfilePatch", () => {
  it.effect("decodes an absent key as no key and a present key as the value", () =>
    Effect.gen(function* () {
      const empty = yield* Schema.decodeUnknownEffect(ProfilePatch)({})
      const set = yield* Schema.decodeUnknownEffect(ProfilePatch)({ timezone: "Europe/Vilnius" })
      expect("timezone" in empty).toBe(false)
      expect(set.timezone).toBe("Europe/Vilnius")
    }),
  )

  it.effect("leaves locations and activeLocationId absent unless sent; null clears", () =>
    Effect.gen(function* () {
      const other = yield* Schema.decodeUnknownEffect(ProfilePatch)({ constraints: ["x"] })
      expect(Object.keys(other)).toEqual(["constraints"])
      const cleared = yield* Schema.decodeUnknownEffect(ProfilePatch)({ activeLocationId: null })
      expect(cleared.activeLocationId).toEqual(Option.none())
    }),
  )
})
