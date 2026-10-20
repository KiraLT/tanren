import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import { failingPaths, roundTrips } from "./testing"
import { Equipment, Goal, Profile, ProfileInsert, ProfilePatch } from "./user"

const userId = "0b9f5c1e-6d43-4c1a-9a3e-2f4f1a2b3c4d"

const profileFields = {
  goals: [
    { kind: "strength", note: null },
    { kind: "other", note: "climb 7a" },
  ],
  constraints: ["no overhead pressing, left shoulder"],
  availableDays: ["mon", "wed", "fri"],
  equipment: [{ kind: "dumbbells", note: "adjustable 2×32 kg" }],
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

describe("Equipment", () => {
  it.effect("rejects kind other without a note at path note", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(Equipment, { kind: "other", note: null })).toEqual([["note"]])
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
})
