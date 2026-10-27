import { env } from "cloudflare:workers"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect } from "effect"
import { TestLayer } from "../testing/fixtures"
import { OAuthCodeUseRepo } from "./OAuthCodeUse"

const at = (iso: string) => DateTime.makeUnsafe(iso)
const T0 = at("2026-10-27T10:00:00.000Z")
const T1 = at("2026-10-27T10:01:00.000Z")
const T2 = at("2026-10-27T10:02:00.000Z")

const jtis = Effect.promise(() =>
  env.DB.prepare(`SELECT jti FROM oauth_code_use WHERE jti LIKE 'purge-%' ORDER BY jti`)
    .all<{ readonly jti: string }>()
    .then((r) => r.results.map((row) => row.jti)),
)

describe("OAuthCodeUseRepo", () => {
  it.effect("burn is true the first time and false for the same jti again", () =>
    Effect.gen(function* () {
      const repo = yield* OAuthCodeUseRepo
      expect(yield* repo.burn("burn-1", T1)).toBe(true)
      expect(yield* repo.burn("burn-1", T1)).toBe(false)
      expect(yield* repo.burn("burn-1", T2)).toBe(false)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("burn of a different jti is independent", () =>
    Effect.gen(function* () {
      const repo = yield* OAuthCodeUseRepo
      expect(yield* repo.burn("burn-2a", T1)).toBe(true)
      expect(yield* repo.burn("burn-2b", T1)).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("purge deletes only rows with expiresAt strictly before now", () =>
    Effect.gen(function* () {
      const repo = yield* OAuthCodeUseRepo
      yield* repo.burn("purge-a-old", T0)
      yield* repo.burn("purge-b-edge", T1)
      yield* repo.burn("purge-c-new", T2)
      yield* repo.purge(T1)
      expect(yield* jtis).toEqual(["purge-b-edge", "purge-c-new"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a purged jti can be burned again", () =>
    Effect.gen(function* () {
      const repo = yield* OAuthCodeUseRepo
      expect(yield* repo.burn("burn-4", T0)).toBe(true)
      yield* repo.purge(T2)
      expect(yield* repo.burn("burn-4", T2)).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )
})
