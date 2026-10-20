import { describe, expect, it } from "@effect/vitest"
import { PkceVerifier } from "@tanren/shared"
import { Effect, Option, Redacted } from "effect"
import { challengeOf, isAllowedReturnTo, signCode, verifyCode } from "./nativeCode"

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

describe("isAllowedReturnTo", () => {
  it.each([
    "exp://192.168.1.5:8081/--/auth/callback",
    "exps://u.expo.dev/x/--/auth/callback",
    "tanren://auth/callback",
    "tanren:///auth/callback",
  ])("accepts %s", (url) => {
    expect(isAllowedReturnTo(url)).toBe(true)
  })

  it.each([
    "https://evil.example/--/auth/callback",
    "exp://h/--/auth/callback/x",
    "exp://h/--/auth/callback?code=x",
    "javascript:alert(1)//--/auth/callback",
    "javascript:alert(1)",
    "",
  ])("rejects %s", (url) => {
    expect(isAllowedReturnTo(url)).toBe(false)
  })
})
