import { describe, expect, it } from "@effect/vitest"
import { OAuthCodeUseRepo, UserTokens } from "@tanren/db"
import { UserId } from "@tanren/shared"
import { DateTime, Effect } from "effect"
import { MemoryTokens } from "./MemoryTokens"

const USER = UserId.make("00000000-0000-4000-8000-0000000000d1")
const at = (iso: string) => DateTime.makeUnsafe(iso)

describe("MemoryTokens", () => {
  it.effect("every user starts at generation 0 and each bump moves only its own counter", () =>
    Effect.gen(function* () {
      const users = yield* UserTokens
      expect(yield* users.tokenGens(USER)).toEqual({ app: 0, mcp: 0 })
      yield* users.bumpAppTokenGen(USER)
      yield* users.bumpMcpTokenGen(USER)
      yield* users.bumpMcpTokenGen(USER)
      expect(yield* users.tokenGens(USER)).toEqual({ app: 1, mcp: 2 })
    }).pipe(Effect.provide(MemoryTokens.layer)),
  )

  it.effect("burn is true once per jti; purge drops only expired rows", () =>
    Effect.gen(function* () {
      const codes = yield* OAuthCodeUseRepo
      expect(yield* codes.burn("old", at("2026-10-27T10:00:00.000Z"))).toBe(true)
      expect(yield* codes.burn("old", at("2026-10-27T10:00:00.000Z"))).toBe(false)
      expect(yield* codes.burn("new", at("2026-10-27T12:00:00.000Z"))).toBe(true)
      yield* codes.purge(at("2026-10-27T11:00:00.000Z"))
      expect(yield* codes.burn("old", at("2026-10-27T10:00:00.000Z"))).toBe(true)
      expect(yield* codes.burn("new", at("2026-10-27T12:00:00.000Z"))).toBe(false)
    }).pipe(Effect.provide(MemoryTokens.layer)),
  )
})
