import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { type Auth, BetterAuth } from "./BetterAuth"
import { Sessions } from "./Sessions"
import { SessionsLive } from "./SessionsLive"

/**
 * A Better Auth whose `getSession` rejects, as it does when D1 is unreachable. `Auth` is Better
 * Auth's full inferred instance type (hundreds of endpoints); `SessionsLive` reads only
 * `api.getSession`, so the double cast is confined to this test fake.
 */
const unreachable = {
  api: { getSession: () => Promise.reject(new Error("D1_ERROR: network connection lost")) },
} as unknown as Auth

const failingAuth = Layer.succeed(BetterAuth, BetterAuth.of({ auth: Effect.succeed(unreachable) }))

describe("SessionsLive", () => {
  it.effect("fails with SessionStoreUnavailable when getSession rejects", () =>
    Effect.gen(function* () {
      const sessions = yield* Sessions
      const error = yield* Effect.flip(sessions.current(new Headers({ cookie: "any" })))
      expect(error._tag).toBe("SessionStoreUnavailable")
    }).pipe(Effect.provide(SessionsLive.pipe(Layer.provide(failingAuth)))),
  )
})
