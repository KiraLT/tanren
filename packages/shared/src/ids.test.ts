import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { IdGenerator, LocationId, newId, SetId, Uuid } from "./ids"

describe("SetId", () => {
  it.effect("accepts a UUID", () =>
    Effect.gen(function* () {
      const id = yield* Schema.decodeUnknownEffect(SetId)("0b9f5c1e-6d43-4c1a-9a3e-2f4f1a2b3c4d")
      expect(id).toBe("0b9f5c1e-6d43-4c1a-9a3e-2f4f1a2b3c4d")
    }),
  )
  it.effect("rejects a non-UUID string", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(Schema.decodeUnknownEffect(SetId)("set-1"))
      expect(error).toBeInstanceOf(Schema.SchemaError)
    }),
  )
})

describe("LocationId", () => {
  it.effect("accepts a UUID and encodes it back unchanged", () =>
    Effect.gen(function* () {
      const raw = "2d2d2d2d-2d2d-4d2d-8d2d-2d2d2d2d2d2d"
      const id = yield* Schema.decodeUnknownEffect(LocationId)(raw)
      expect(yield* Schema.encodeEffect(LocationId)(id)).toBe(raw)
    }),
  )
  it.effect("rejects a non-UUID string", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(Schema.decodeUnknownEffect(LocationId)("home"))
      expect(error).toBeInstanceOf(Schema.SchemaError)
    }),
  )
})

describe("IdGenerator", () => {
  it.effect("layer yields a valid UUID", () =>
    Effect.gen(function* () {
      const id = yield* (yield* IdGenerator).next
      expect(Schema.is(Uuid)(id)).toBe(true)
    }).pipe(Effect.provide(IdGenerator.layer)),
  )
  it.effect("layerTest yields a fixed sequence", () =>
    Effect.gen(function* () {
      const generator = yield* IdGenerator
      const first = yield* generator.next
      const second = yield* generator.next
      expect([first, second]).toEqual([
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      ])
    }).pipe(Effect.provide(IdGenerator.layerTest)),
  )
  it.effect("newId(SetId) yields a branded SetId", () =>
    Effect.gen(function* () {
      const id = yield* newId(SetId)
      expectTypeOf(id).toEqualTypeOf<SetId>()
      expect(id).toBe("00000000-0000-4000-8000-000000000001")
    }).pipe(Effect.provide(IdGenerator.layerTest)),
  )
})
