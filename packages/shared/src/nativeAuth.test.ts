import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import {
  NativeCode,
  NativeCodeRejected,
  NativeSessionRequest,
  NativeSessionResponse,
  PendingNativeSignIn,
  PkceChallenge,
  PkceVerifier,
  SessionToken,
} from "./nativeAuth"
import { accepts, rejects, wireRoundTrips } from "./testing"

const b64url43 = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
const ott = "Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z"
const code = `${ott}.E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`

describe("PkceVerifier / PkceChallenge", () => {
  it.effect("accept 43 base64url chars", () =>
    Effect.gen(function* () {
      yield* accepts(PkceVerifier, b64url43)
      yield* accepts(PkceChallenge, b64url43)
    }),
  )
  it.effect("reject 42 and 44 chars, padding and non-url alphabet", () =>
    Effect.gen(function* () {
      yield* rejects(PkceVerifier, b64url43.slice(1))
      yield* rejects(PkceVerifier, `${b64url43}A`)
      yield* rejects(PkceChallenge, `${b64url43.slice(1)}=`)
      yield* rejects(PkceChallenge, `${b64url43.slice(1)}+`)
    }),
  )
})

describe("NativeCode", () => {
  it.effect("accepts <32 token chars>.<43 b64url>", () => accepts(NativeCode, code))
  it.effect("accepts an ott with - and _ (Better Auth's generateRandomString alphabet)", () =>
    accepts(NativeCode, `${ott.slice(2)}-_.${b64url43}`),
  )
  it.effect("rejects a code without `.`, a short ott, a padded mac, or a bare ott", () =>
    Effect.gen(function* () {
      yield* rejects(NativeCode, code.replace(".", ""))
      yield* rejects(NativeCode, code.slice(1))
      yield* rejects(NativeCode, `${ott}.${b64url43.slice(1)}=`)
      yield* rejects(NativeCode, ott)
    }),
  )
})

describe("SessionToken", () => {
  it.effect("rejects an empty token", () => rejects(SessionToken, ""))
})

describe("wire shapes", () => {
  it.effect("NativeSessionRequest decodes code + verifier", () =>
    accepts(NativeSessionRequest, { code, verifier: b64url43 }),
  )
  it.effect("NativeSessionRequest rejects a missing verifier", () =>
    rejects(NativeSessionRequest, { code }),
  )
  it.effect("NativeSessionResponse round-trips the wire", () =>
    wireRoundTrips(NativeSessionResponse, {
      token: "aB3x",
      userId: "00000000-0000-4000-8000-000000000001",
      expiresAt: "2026-10-28T07:02:11.000Z",
    }),
  )
  it.effect("PendingNativeSignIn round-trips the stored JSON", () =>
    wireRoundTrips(PendingNativeSignIn, {
      verifier: b64url43,
      createdAt: "2026-10-21T07:02:11.000Z",
    }),
  )
})

describe("NativeCodeRejected", () => {
  it.effect("round-trips as _tag + reason", () =>
    Effect.gen(function* () {
      const wire = { _tag: "NativeCodeRejected", reason: "mismatch" } as const
      const decoded = yield* Schema.decodeUnknownEffect(NativeCodeRejected)(wire)
      expect(decoded).toBeInstanceOf(NativeCodeRejected)
      expect(decoded.reason).toBe("mismatch")
      expect(yield* Schema.encodeEffect(NativeCodeRejected)(decoded)).toEqual(wire)
    }),
  )
  it.effect("rejects an unknown reason", () =>
    rejects(NativeCodeRejected, { _tag: "NativeCodeRejected", reason: "expired" }),
  )
})
