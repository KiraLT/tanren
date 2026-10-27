import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Effect, Layer, MutableRef, Option, Redacted } from "effect"
import { type Auth, BetterAuth } from "./BetterAuth"
import { Sessions } from "./Sessions"
import { bearerJwt, SessionsLiveNoDeps } from "./SessionsLive"
import { Tokens } from "./Tokens"

const USER = UserId.make("00000000-0000-4000-8000-0000000000a1")
const config = {
  betterAuthUrl: "http://localhost:8787",
  betterAuthSecret: Redacted.make("sessions-live-test-secret-0123456789abcdef"),
  mcpResourceUrl: "http://localhost:8787/mcp",
}

/**
 * A Better Auth fake. `Auth` is Better Auth's full inferred instance type (hundreds of endpoints);
 * `SessionsLive` reads only `api.getSession`, so the double cast is confined to this test fake.
 */
const authWith = (getSession: () => Promise<unknown>) =>
  ({ api: { getSession } }) as unknown as Auth

/** Counts `getSession` calls; answers "signed out". */
const countingAuth = () => {
  const calls = MutableRef.make(0)
  const auth = authWith(() => {
    MutableRef.update(calls, (n) => n + 1)
    return Promise.resolve(null)
  })
  return { calls, auth }
}

const sessionsWith = (auth: Auth) =>
  SessionsLiveNoDeps.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(BetterAuth, BetterAuth.of({ auth: Effect.succeed(auth) })),
        Tokens.layerWith(config),
      ),
    ),
  )

const unreachable = authWith(() => Promise.reject(new Error("D1_ERROR: network connection lost")))

const bearer = (token: string) => new Headers({ authorization: `Bearer ${token}` })

describe("SessionsLive", () => {
  it.effect("fails with SessionStoreUnavailable when getSession rejects", () =>
    Effect.gen(function* () {
      const sessions = yield* Sessions
      const error = yield* Effect.flip(sessions.current(new Headers({ cookie: "any" })))
      expect(error._tag).toBe("SessionStoreUnavailable")
    }).pipe(Effect.provide(sessionsWith(unreachable))),
  )

  it.live("a valid app access JWT resolves to its user without calling Better Auth", () => {
    const { calls, auth } = countingAuth()
    return Effect.gen(function* () {
      const pair = yield* (yield* Tokens).issueAppPair(USER, 0)
      const current = yield* (yield* Sessions).current(bearer(pair.accessToken))
      expect(current).toEqual(Option.some(USER))
      expect(MutableRef.get(calls)).toBe(0)
    }).pipe(Effect.provide(Layer.merge(sessionsWith(auth), Tokens.layerWith(config))))
  })

  it.live("a forged JWT is signed out, not 503, and never reaches Better Auth", () => {
    return Effect.gen(function* () {
      const current = yield* (yield* Sessions).current(bearer("eyJhbGciOiJIUzI1NiJ9.e30.c2ln"))
      expect(current).toEqual(Option.none())
    }).pipe(Effect.provide(sessionsWith(unreachable)))
  })

  it.live("an app refresh JWT (wrong audience) is signed out without a Better Auth call", () => {
    const { calls, auth } = countingAuth()
    return Effect.gen(function* () {
      const pair = yield* (yield* Tokens).issueAppPair(USER, 0)
      const current = yield* (yield* Sessions).current(bearer(pair.refreshToken))
      expect(current).toEqual(Option.none())
      expect(MutableRef.get(calls)).toBe(0)
    }).pipe(Effect.provide(Layer.merge(sessionsWith(auth), Tokens.layerWith(config))))
  })

  it.live("a non-JWT bearer (Better Auth session token) still goes to Better Auth", () => {
    const { calls, auth } = countingAuth()
    return Effect.gen(function* () {
      const current = yield* (yield* Sessions).current(bearer("opaque-session-token.signature"))
      expect(current).toEqual(Option.none())
      expect(MutableRef.get(calls)).toBe(1)
    }).pipe(Effect.provide(sessionsWith(auth)))
  })
})

describe("bearerJwt", () => {
  it("takes a three-part bearer token only", () => {
    expect(bearerJwt(bearer("a.b.c"))).toEqual(Option.some("a.b.c"))
    expect(bearerJwt(new Headers({ authorization: "bearer a.b.c" }))).toEqual(Option.some("a.b.c"))
    expect(bearerJwt(bearer("a.b"))).toEqual(Option.none())
    expect(bearerJwt(new Headers({ authorization: "Basic a.b.c" }))).toEqual(Option.none())
    expect(bearerJwt(new Headers())).toEqual(Option.none())
  })
})
