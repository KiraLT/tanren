import { describe, expect, it } from "@effect/vitest"
import { PkceVerifier } from "@tanren/shared"
import { Effect, Option, Redacted, Schema } from "effect"
import {
  BeginState,
  challengeOf,
  isAllowedReturnTo,
  signBegin,
  signCode,
  verifyBegin,
  verifyCode,
} from "./nativeCode"

// RFC 7636 Appendix B.
const RFC_VERIFIER = PkceVerifier.make("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
const OTHER_VERIFIER = PkceVerifier.make("A".repeat(43))
const SECRET = Redacted.make("test-secret-0000000000000000000000000000")
const OTT = "Ab3dEf6hIj9kLm2nOp5qRs8tUv1wX-_z"

describe("challengeOf", () => {
  it.effect("matches the RFC 7636 Appendix B vector", () =>
    Effect.gen(function* () {
      expect(yield* challengeOf(RFC_VERIFIER)).toBe(RFC_CHALLENGE)
    }),
  )
})

describe("signCode / verifyCode", () => {
  it.effect("gives back the OTT for the verifier the code was bound to", () =>
    Effect.gen(function* () {
      const code = yield* signCode(SECRET, OTT, yield* challengeOf(RFC_VERIFIER))
      expect(code.startsWith(`${OTT}.`)).toBe(true)
      expect(code.split(".")[1]).toHaveLength(43)
      expect(yield* verifyCode(SECRET, code, RFC_VERIFIER)).toEqual(Option.some(OTT))
    }),
  )

  it.effect("rejects another verifier (mac mismatch)", () =>
    Effect.gen(function* () {
      const code = yield* signCode(SECRET, OTT, yield* challengeOf(RFC_VERIFIER))
      expect(yield* verifyCode(SECRET, code, OTHER_VERIFIER)).toEqual(Option.none())
    }),
  )

  it.effect("rejects a code signed with another secret", () =>
    Effect.gen(function* () {
      const code = yield* signCode(Redacted.make("other"), OTT, yield* challengeOf(RFC_VERIFIER))
      expect(yield* verifyCode(SECRET, code, RFC_VERIFIER)).toEqual(Option.none())
    }),
  )
})

describe("isAllowedReturnTo (pinned prefixes)", () => {
  const allowed = isAllowedReturnTo([
    "exp://192.168.1.5:",
    "exps://u.expo.dev/tanren-project-id/",
    "exp://localhost:",
    "tanren://",
  ])

  it.each([
    "exp://192.168.1.5:8081/--/auth/callback",
    "exps://u.expo.dev/tanren-project-id/--/auth/callback",
    "exp://localhost:8081/--/auth/callback",
    "tanren://auth/callback",
    "tanren:///auth/callback",
  ])("accepts %s", (url) => {
    expect(allowed(url)).toBe(true)
  })

  it.each([
    "exps://u.expo.dev/other-project/--/auth/callback", // another EAS project on the shared host
    "exps://u.expo.dev/tanren-project-id/../evil/--/auth/callback", // dot segment escapes the prefix
    "exps://u.expo.dev/tanren-project-id/%2e%2e/evil/--/auth/callback",
    "exp://localhost:evil.com/--/auth/callback", // non-numeric port
    "exps://u.expo.dev/tanren-project-idx/--/auth/callback",
    "exp://evil.example:8081/--/auth/callback", // attacker's Expo dev server
    "exp://192.168.1.6:8081/--/auth/callback",
    "exp://192.168.1.5.evil.example:8081/--/auth/callback",
    "exp://user@192.168.1.5:8081/--/auth/callback",
    "https://evil.example/--/auth/callback",
    "exp://192.168.1.5/--/auth/callback/x",
    "exp://192.168.1.5/--/auth/callback?code=x",
    "javascript:alert(1)//--/auth/callback",
    "javascript:alert(1)",
    "",
  ])("rejects %s", (url) => {
    expect(allowed(url)).toBe(false)
  })

  it("allows tanren:// only when listed (production leaves it out until universal links)", () => {
    expect(isAllowedReturnTo(["exp://localhost:"])("tanren://auth/callback")).toBe(false)
    expect(isAllowedReturnTo([])("exp://localhost:8081/--/auth/callback")).toBe(false)
  })
})

describe("signBegin / verifyBegin", () => {
  const state = Schema.decodeUnknownSync(BeginState)({
    email: "Lukas@Example.com",
    challenge: RFC_CHALLENGE,
    returnTo: "exp://192.168.1.5:8081/--/auth/callback",
    expiresAt: 1_800_000_000,
  })

  it.effect("verifies the same state (email case-insensitive)", () =>
    Effect.gen(function* () {
      const sig = yield* signBegin(SECRET, state)
      const lower = Schema.decodeUnknownSync(BeginState)({ ...state, email: "lukas@example.com" })
      expect(yield* verifyBegin(SECRET, lower, sig)).toBe(true)
    }),
  )

  it.effect("refuses another email, challenge, returnTo, expiry or a tampered signature", () =>
    Effect.gen(function* () {
      const sig = yield* signBegin(SECRET, state)
      const variants = [
        { ...state, email: "other@example.com" },
        { ...state, challenge: "A".repeat(43) },
        { ...state, returnTo: "exp://localhost:8081/--/auth/callback" },
        { ...state, expiresAt: state.expiresAt + 1 },
      ].map((variant) => Schema.decodeUnknownSync(BeginState)(variant))
      const results = yield* Effect.forEach(variants, (variant) =>
        verifyBegin(SECRET, variant, sig),
      )
      expect(results).toEqual([false, false, false, false])
      // First char: the last one carries 2 padding bits that a decoder ignores.
      const tampered = `${sig.startsWith("A") ? "B" : "A"}${sig.slice(1)}`
      expect(yield* verifyBegin(SECRET, state, tampered)).toBe(false)
      expect(yield* verifyBegin(SECRET, state, "not base64url!")).toBe(false)
    }),
  )
})
