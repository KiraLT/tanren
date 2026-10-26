import { describe, expect, it } from "@effect/vitest"
import { Effect, Redacted } from "effect"
import { SealedToken, TokenSeal, TokenSealError } from "./TokenSeal"

const KEY_A = Redacted.make("AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=") // 32 x 0x01, test only
const KEY_B = Redacted.make("AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI=") // 32 x 0x02, test only
const PLAIN = "strava-access-token-0123456789abcdef"

const withSeal = <A, E>(
  body: (seal: TokenSeal["Service"]) => Effect.Effect<A, E>,
  key: Redacted.Redacted<string> = KEY_A,
) =>
  Effect.gen(function* () {
    return yield* body(yield* TokenSeal)
  }).pipe(Effect.provide(TokenSeal.layerWithKey(key)))

/** Replaces the sealed value's third segment (the ciphertext) after `edit`. */
const mapCiphertext = (sealed: SealedToken, edit: (ciphertext: string) => string): SealedToken => {
  const [version, iv, ciphertext] = sealed.split(".")
  return SealedToken.make(`${version}.${iv}.${edit(ciphertext ?? "")}`)
}

describe("TokenSeal", () => {
  it.effect("opens what it sealed", () =>
    withSeal((seal) =>
      Effect.gen(function* () {
        const sealed = yield* seal.seal(Redacted.make(PLAIN))
        expect(sealed.startsWith("v1.")).toBe(true)
        expect(sealed).not.toContain(PLAIN)
        expect(Redacted.value(yield* seal.open(sealed))).toBe(PLAIN)
      }),
    ),
  )

  it.effect("seals the same plain text differently each time (random IV)", () =>
    withSeal((seal) =>
      Effect.gen(function* () {
        const first = yield* seal.seal(Redacted.make(PLAIN))
        const second = yield* seal.seal(Redacted.make(PLAIN))
        expect(first).not.toBe(second)
        expect(Redacted.value(yield* seal.open(second))).toBe(PLAIN)
      }),
    ),
  )

  it.effect("rejects a tampered ciphertext", () =>
    withSeal((seal) =>
      Effect.gen(function* () {
        const sealed = yield* seal.seal(Redacted.make(PLAIN))
        // Flip the first character so the ciphertext still decodes but no longer authenticates.
        const tampered = mapCiphertext(
          sealed,
          (c) => `${c.startsWith("A") ? "B" : "A"}${c.slice(1)}`,
        )
        const error = yield* Effect.flip(seal.open(tampered))
        expect(error).toBeInstanceOf(TokenSealError)
        expect(error.reason).toBe("authentication")
      }),
    ),
  )

  it.effect("rejects a truncated authentication tag", () =>
    withSeal((seal) =>
      Effect.gen(function* () {
        const sealed = yield* seal.seal(Redacted.make(PLAIN))
        const error = yield* Effect.flip(seal.open(mapCiphertext(sealed, (c) => c.slice(0, -8))))
        expect(error.reason).toBe("authentication")
      }),
    ),
  )

  it.effect("rejects a token sealed under another key", () =>
    Effect.gen(function* () {
      const sealed = yield* withSeal((seal) => seal.seal(Redacted.make(PLAIN)), KEY_A)
      const error = yield* Effect.flip(withSeal((seal) => seal.open(sealed), KEY_B))
      expect(error).toBeInstanceOf(TokenSealError)
      expect(error.reason).toBe("authentication")
    }),
  )

  it.effect("rejects malformed strings", () =>
    withSeal((seal) =>
      Effect.gen(function* () {
        const sealed = yield* seal.seal(Redacted.make(PLAIN))
        const [, iv, ciphertext] = sealed.split(".")
        const malformed = [
          "",
          "not a sealed token",
          `v2.${iv}.${ciphertext}`, // unknown version
          `${iv}.${ciphertext}`, // no version prefix
          `v1.${iv}`, // missing ciphertext segment
          `v1.${iv}.${ciphertext}.extra`, // extra segment
          `v1.!!!.${ciphertext}`, // bad base64 in the IV
          `v1.${iv}.***`, // bad base64 in the ciphertext
          `v1.AAAA.${ciphertext}`, // IV of the wrong length
        ]
        const errors = yield* Effect.forEach(malformed, (raw) =>
          Effect.flip(seal.open(SealedToken.make(raw))),
        )
        expect(errors.map((error) => error.reason)).toEqual(malformed.map(() => "malformed"))
      }),
    ),
  )
})
