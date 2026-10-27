import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { AccountDeleted } from "./account"

describe("AccountDeleted", () => {
  it.effect("decodes { deleted: true }", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(AccountDeleted)({ deleted: true })
      expect(decoded).toEqual({ deleted: true })
    }),
  )

  it.effect("rejects deleted: false at the deleted path", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        Schema.decodeUnknownEffect(AccountDeleted)({ deleted: false }),
      )
      expect(error._tag).toBe("SchemaError")
      expect(error.message).toContain('["deleted"]')
    }),
  )

  it.effect("round-trips through its encoded form", () =>
    Effect.gen(function* () {
      const encoded = yield* Schema.encodeEffect(AccountDeleted)({ deleted: true })
      const decoded = yield* Schema.decodeUnknownEffect(AccountDeleted)(encoded)
      expect(decoded).toEqual({ deleted: true })
    }),
  )
})
