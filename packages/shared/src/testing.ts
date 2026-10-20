/**
 * Test-only helpers for schema tests. Not exported from `index.ts`; import it from `./testing` in
 * colocated `*.test.ts` files only.
 */
import { expect } from "@effect/vitest"
import { Effect, Equal, Schema } from "effect"
import { ValidationError } from "./errors"

/** A schema that decodes without services. */
export type Decodable = Schema.Top & { readonly DecodingServices: never }

/** A schema that decodes and encodes without services. */
export type Codec = Decodable & { readonly EncodingServices: never }

export const accepts = (schema: Decodable, input: unknown) =>
  Effect.gen(function* () {
    const decoded = yield* Effect.result(Schema.decodeUnknownEffect(schema)(input))
    expect(decoded._tag).toBe("Success")
  })

export const rejects = (schema: Decodable, input: unknown) =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(Schema.decodeUnknownEffect(schema)(input))
    expect(error).toBeInstanceOf(Schema.SchemaError)
  })

/** The issue paths of a failed decode, as `ValidationError.fromSchemaError` reports them. */
export const failingPaths = (schema: Decodable, input: unknown) =>
  Effect.flip(Schema.decodeUnknownEffect(schema)(input)).pipe(
    Effect.map((error) => ValidationError.fromSchemaError(error).issues.map((i) => i.path)),
  )

/** `decode(encode(value))` is `Equal.equals` to `value`. */
export const roundTrips = <S extends Codec>(schema: S, value: S["Type"]) =>
  Effect.gen(function* () {
    const encoded = yield* Schema.encodeUnknownEffect(schema)(value)
    const decoded = yield* Schema.decodeUnknownEffect(schema)(encoded)
    expect(Equal.equals(decoded, value)).toBe(true)
  })

/** wire → decode → encode yields the same wire (`roundTrips` goes value → wire → value). */
export const wireRoundTrips = <T, E>(schema: Schema.Codec<T, E>, wire: E) =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknownEffect(schema)(wire)
    const encoded = yield* Schema.encodeEffect(schema)(decoded)
    expect(encoded).toEqual(wire)
  })
