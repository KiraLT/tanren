import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import { Exercise, ExerciseInsert, ExercisePatch, MuscleGroup } from "./exercise"
import { failingPaths, roundTrips, wireRoundTrips } from "./testing"

const exerciseWire = {
  id: "1b9f5c1e-6d43-4c1a-9a3e-2f4f1a2b3c4d",
  userId: "0b9f5c1e-6d43-4c1a-9a3e-2f4f1a2b3c4d",
  createdAt: "2026-10-19T08:00:00.000Z",
  updatedAt: "2026-10-19T08:00:00.000Z",
  deletedAt: null,
  name: "Squat",
  aliases: ["Back Squat", "High-bar"],
  muscleGroups: ["quads", "glutes"],
  notes: null,
  catalogId: null,
}

describe("Exercise.catalogId", () => {
  it.effect("decodes a catalog slug as Some", () =>
    Effect.gen(function* () {
      const input = { ...exerciseWire, catalogId: "barbell-back-squat" }
      const exercise = yield* Schema.decodeUnknownEffect(Exercise)(input)
      expect(exercise.catalogId).toEqual(Option.some("barbell-back-squat"))
      expect(yield* Schema.encodeEffect(Exercise)(exercise)).toEqual(input)
    }),
  )

  it.effect("decodes a missing key (pre-v2 row) as None and encodes it back as null", () =>
    Effect.gen(function* () {
      const { catalogId: _omitted, ...preV2 } = exerciseWire
      const exercise = yield* Schema.decodeUnknownEffect(Exercise)(preV2)
      expect(Option.isNone(exercise.catalogId)).toBe(true)
      expect((yield* Schema.encodeEffect(Exercise)(exercise)).catalogId).toBeNull()
    }),
  )

  it.effect("rejects a catalogId that is not a slug", () =>
    Effect.gen(function* () {
      const input = { ...exerciseWire, catalogId: "Back Squat" }
      expect(yield* failingPaths(Exercise, input)).toEqual([["catalogId"]])
    }),
  )

  it("defaults to None in the constructor", () => {
    const { catalogId: _omitted, ...fields } = Schema.decodeUnknownSync(Exercise)(exerciseWire)
    expect(Option.isNone(Exercise.make(fields).catalogId)).toBe(true)
  })
})

describe("Exercise", () => {
  it.effect("round-trips the wire shape, with null decoded as None", () =>
    Effect.gen(function* () {
      const exercise = yield* Schema.decodeUnknownEffect(Exercise)(exerciseWire)
      expect(Option.isNone(exercise.notes)).toBe(true)
      expect(Option.isNone(exercise.deletedAt)).toBe(true)
      expect(yield* Schema.encodeEffect(Exercise)(exercise)).toEqual(exerciseWire)
    }),
  )

  it.effect("decode(encode(exercise)) equals the original", () =>
    Effect.gen(function* () {
      const exercise = yield* Schema.decodeUnknownEffect(Exercise)(exerciseWire)
      yield* roundTrips(Exercise, exercise)
    }),
  )

  it.effect("rejects an alias that repeats another alias case-insensitively", () =>
    Effect.gen(function* () {
      const input = { ...exerciseWire, aliases: ["Back Squat", "back squat"] }
      expect(yield* failingPaths(Exercise, input)).toEqual([["aliases", 1]])
    }),
  )

  it.effect("rejects an alias equal to the name case-insensitively", () =>
    Effect.gen(function* () {
      const input = { ...exerciseWire, aliases: ["squat"] }
      expect(yield* failingPaths(Exercise, input)).toEqual([["aliases", 0]])
    }),
  )
})

describe("ExerciseInsert", () => {
  it.effect("keeps the alias rule after omitting the row columns", () =>
    Effect.gen(function* () {
      const input = { name: "Squat", aliases: ["SQUAT"], muscleGroups: [], notes: null }
      expect(yield* failingPaths(ExerciseInsert, input)).toEqual([["aliases", 0]])
    }),
  )
})

describe("UniqueArray(MuscleGroup)", () => {
  it.effect("rejects a duplicate muscle group", () =>
    Effect.gen(function* () {
      const paths = yield* failingPaths(Schema.UniqueArray(MuscleGroup), ["chest", "chest"])
      expect(paths).toEqual([[]])
    }),
  )
})

describe("ExercisePatch", () => {
  it.effect("decodes absent, null and a value as keep, clear and set", () =>
    Effect.gen(function* () {
      const decode = Schema.decodeUnknownEffect(ExercisePatch)
      const keep = yield* decode({})
      const clear = yield* decode({ notes: null })
      const set = yield* decode({ notes: "brace, then sit back" })
      expect("notes" in keep).toBe(false)
      expect(clear.notes).toEqual(Option.none())
      expect(set.notes).toEqual(Option.some("brace, then sit back"))
    }),
  )

  it.effect("decodes {} to no keys and {name} without a catalogId key", () =>
    Effect.gen(function* () {
      const decode = Schema.decodeUnknownEffect(ExercisePatch)
      expect(Object.keys(yield* decode({}))).toEqual([])
      expect(Object.keys(yield* decode({ name: "Bench" }))).toEqual(["name"])
    }),
  )

  it.effect("catalogId: a slug links, null unlinks", () =>
    Effect.gen(function* () {
      const decode = Schema.decodeUnknownEffect(ExercisePatch)
      expect((yield* decode({ catalogId: "barbell-back-squat" })).catalogId).toEqual(
        Option.some("barbell-back-squat"),
      )
      expect((yield* decode({ catalogId: null })).catalogId).toEqual(Option.none())
    }),
  )

  it.effect("rejects a bad field with its path", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(ExercisePatch, { catalogId: "Back Squat" })).toEqual([
        ["catalogId"],
      ])
      expect(yield* failingPaths(ExercisePatch, { muscleGroups: ["chest", "chest"] })).toEqual([
        ["muscleGroups"],
      ])
    }),
  )

  it.effect("round-trips the wire shape (wire, decode, encode)", () =>
    Effect.gen(function* () {
      yield* wireRoundTrips(ExercisePatch, {
        name: "Squat",
        aliases: ["Back Squat"],
        muscleGroups: ["quads"],
        notes: null,
        catalogId: "barbell-back-squat",
      })
      yield* wireRoundTrips(ExercisePatch, { catalogId: null })
      yield* wireRoundTrips(ExercisePatch, {})
    }),
  )
})
