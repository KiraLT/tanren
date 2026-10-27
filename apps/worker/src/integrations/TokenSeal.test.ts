import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Effect, Redacted } from "effect"
import { deriveSubKey } from "../auth/Tokens"
import { STATE_KEY_INFO } from "./connect"
import {
  SEAL_KEY_INFO,
  type SealBinding,
  SealedToken,
  TokenSeal,
  TokenSealError,
} from "./TokenSeal"

const KEY_A = Redacted.make("AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=") // 32 x 0x01, test only
const KEY_B = Redacted.make("AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI=") // 32 x 0x02, test only
const PLAIN = "strava-access-token-0123456789abcdef"
const USER_A = UserId.make("00000000-0000-4000-8000-0000000000a1")
const USER_B = UserId.make("00000000-0000-4000-8000-0000000000b2")
const BOUND: SealBinding = { userId: USER_A, provider: "strava", slot: "access" }

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
  it.effect("opens what it sealed under the same binding", () =>
    withSeal((seal) =>
      Effect.gen(function* () {
        const sealed = yield* seal.seal(Redacted.make(PLAIN), BOUND)
        expect(sealed.startsWith("v1.")).toBe(true)
        expect(sealed).not.toContain(PLAIN)
        expect(Redacted.value(yield* seal.open(sealed, BOUND))).toBe(PLAIN)
      }),
    ),
  )

  it.effect("seals the same plain text differently each time (random IV)", () =>
    withSeal((seal) =>
      Effect.gen(function* () {
        const first = yield* seal.seal(Redacted.make(PLAIN), BOUND)
        const second = yield* seal.seal(Redacted.make(PLAIN), BOUND)
        expect(first).not.toBe(second)
        expect(Redacted.value(yield* seal.open(second, BOUND))).toBe(PLAIN)
      }),
    ),
  )

  it.effect("refuses a value opened for another user, provider or slot", () =>
    withSeal((seal) =>
      Effect.gen(function* () {
        const sealed = yield* seal.seal(Redacted.make(PLAIN), BOUND)
        const others: ReadonlyArray<SealBinding> = [
          { ...BOUND, userId: USER_B },
          { ...BOUND, provider: "garmin" },
          { ...BOUND, slot: "refresh" },
        ]
        const errors = yield* Effect.forEach(others, (binding) =>
          Effect.flip(seal.open(sealed, binding)),
        )
        expect(errors.every((error) => error instanceof TokenSealError)).toBe(true)
        expect(errors.map((error) => error.reason)).toEqual([
          "authentication",
          "authentication",
          "authentication",
        ])
      }),
    ),
  )

  it.effect("rejects a tampered ciphertext", () =>
    withSeal((seal) =>
      Effect.gen(function* () {
        const sealed = yield* seal.seal(Redacted.make(PLAIN), BOUND)
        // Flip the first character so the ciphertext still decodes but no longer authenticates.
        const tampered = mapCiphertext(
          sealed,
          (c) => `${c.startsWith("A") ? "B" : "A"}${c.slice(1)}`,
        )
        const error = yield* Effect.flip(seal.open(tampered, BOUND))
        expect(error).toBeInstanceOf(TokenSealError)
        expect(error.reason).toBe("authentication")
      }),
    ),
  )

  it.effect("rejects a truncated authentication tag", () =>
    withSeal((seal) =>
      Effect.gen(function* () {
        const sealed = yield* seal.seal(Redacted.make(PLAIN), BOUND)
        const error = yield* Effect.flip(
          seal.open(
            mapCiphertext(sealed, (c) => c.slice(0, -8)),
            BOUND,
          ),
        )
        expect(error.reason).toBe("authentication")
      }),
    ),
  )

  it.effect("rejects a token sealed under another key", () =>
    Effect.gen(function* () {
      const sealed = yield* withSeal((seal) => seal.seal(Redacted.make(PLAIN), BOUND), KEY_A)
      const error = yield* Effect.flip(withSeal((seal) => seal.open(sealed, BOUND), KEY_B))
      expect(error).toBeInstanceOf(TokenSealError)
      expect(error.reason).toBe("authentication")
    }),
  )

  it.effect("derives the AES key and the state HMAC key as different sub-keys", () =>
    Effect.gen(function* () {
      expect(SEAL_KEY_INFO).not.toBe(STATE_KEY_INFO)
      const sealKey = yield* deriveSubKey(KEY_A, SEAL_KEY_INFO)
      const stateKey = yield* deriveSubKey(KEY_A, STATE_KEY_INFO)
      // Compares bytes without printing them: only the boolean reaches the test output.
      const same =
        sealKey.bytes.length === stateKey.bytes.length &&
        sealKey.bytes.every((byte, index) => byte === stateKey.bytes[index])
      expect(same).toBe(false)
    }),
  )

  it.effect("rejects malformed strings", () =>
    withSeal((seal) =>
      Effect.gen(function* () {
        const sealed = yield* seal.seal(Redacted.make(PLAIN), BOUND)
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
          Effect.flip(seal.open(SealedToken.make(raw), BOUND)),
        )
        expect(errors.map((error) => error.reason)).toEqual(malformed.map(() => "malformed"))
      }),
    ),
  )
})
