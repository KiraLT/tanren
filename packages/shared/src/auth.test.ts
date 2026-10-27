import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { AppTokenPair, RefreshRequest, TokenRejected } from "./auth"
import { failingPaths, rejects, wireRoundTrips } from "./testing"

const pair = {
  accessToken: "aaa.bbb.ccc",
  refreshToken: "ddd.eee.fff",
  expiresAt: "2026-10-27T13:15:00.000Z",
}

describe("AppTokenPair", () => {
  it.effect("round-trips the wire", () => wireRoundTrips(AppTokenPair, pair))
  it.effect("rejects an empty access token at accessToken", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(AppTokenPair, { ...pair, accessToken: "" })).toEqual([
        ["accessToken"],
      ])
    }),
  )
  it.effect("rejects an empty refresh token at refreshToken", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(AppTokenPair, { ...pair, refreshToken: "" })).toEqual([
        ["refreshToken"],
      ])
    }),
  )
  it.effect("rejects a bad expiresAt at expiresAt", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(AppTokenPair, { ...pair, expiresAt: "tomorrow" })).toEqual([
        ["expiresAt"],
      ])
    }),
  )
  it.effect("rejects a missing refresh token at refreshToken", () =>
    Effect.gen(function* () {
      expect(
        yield* failingPaths(AppTokenPair, {
          accessToken: pair.accessToken,
          expiresAt: pair.expiresAt,
        }),
      ).toEqual([["refreshToken"]])
    }),
  )
})

describe("RefreshRequest", () => {
  it.effect("round-trips the wire", () => wireRoundTrips(RefreshRequest, { refreshToken: "x.y.z" }))
  it.effect("rejects an empty token at refreshToken", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(RefreshRequest, { refreshToken: "" })).toEqual([["refreshToken"]])
    }),
  )
  it.effect("rejects a missing token at refreshToken", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(RefreshRequest, {})).toEqual([["refreshToken"]])
    }),
  )
})

describe("TokenRejected", () => {
  it.effect.each(["expired", "revoked", "invalid"] as const)("round-trips reason %s", (reason) =>
    Effect.gen(function* () {
      const wire = { _tag: "TokenRejected", reason } as const
      const decoded = yield* Schema.decodeUnknownEffect(TokenRejected)(wire)
      expect(decoded).toBeInstanceOf(TokenRejected)
      expect(decoded.reason).toBe(reason)
      expect(yield* Schema.encodeEffect(TokenRejected)(decoded)).toEqual(wire)
    }),
  )
  it.effect("rejects an unknown reason", () =>
    rejects(TokenRejected, { _tag: "TokenRejected", reason: "stale" }),
  )
  it.effect("failing path for an unknown reason is reason", () =>
    Effect.gen(function* () {
      expect(
        yield* failingPaths(TokenRejected, { _tag: "TokenRejected", reason: "stale" }),
      ).toEqual([["reason"]])
    }),
  )
})
