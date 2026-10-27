import { describe, expect, it } from "@effect/vitest"
import { PersistenceError, UserTokens } from "@tanren/db"
import { SessionStoreUnavailable, UserId } from "@tanren/shared"
import { Effect, Layer } from "effect"
import { makeApp, memoryPersistence } from "../app"
import { BetterAuth } from "../auth/BetterAuth"
import { EmailSender } from "../auth/EmailSender"
import { Sessions } from "../auth/Sessions"
import { Tokens } from "../auth/Tokens"
import { WorkerConfig } from "../Config"
import { MemoryStore } from "../repos"
import { envVars as env } from "../testing/fixtures"
import { isWriteMethod } from "./Authentication"

/** The session store is down: every lookup fails. */
const failingSessions = Layer.succeed(
  Sessions,
  Sessions.of({
    current: () => Effect.fail(new SessionStoreUnavailable({ message: "D1 unreachable" })),
  }),
)

describe("Authentication", () => {
  it("answers 503 SessionStoreUnavailable, not 500, when the session store fails", async () => {
    const app = makeApp(env, { auth: { _tag: "Fixed", sessions: failingSessions } })
    const response = await app.handler(new Request("http://localhost/exercises"))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      _tag: "SessionStoreUnavailable",
      message: "D1 unreachable",
    })
  })

  it("leaves public routes alone when the session store fails", async () => {
    const app = makeApp(env, { auth: { _tag: "Fixed", sessions: failingSessions } })
    const response = await app.handler(new Request("http://localhost/health"))
    expect(response.status).toBe(200)
  })
})

describe("isWriteMethod (STLS-F3: only writes read the user row)", () => {
  it("treats GET, HEAD and OPTIONS as reads, in any case", () => {
    expect(["GET", "head", "OPTIONS"].map(isWriteMethod)).toEqual([false, false, false])
  })

  it("treats POST, PUT, PATCH and DELETE as writes", () => {
    expect(["POST", "PUT", "patch", "DELETE"].map(isWriteMethod)).toEqual([true, true, true, true])
  })
})

describe("Authentication user-row check (STLS-F3)", () => {
  /** `UserTokens` whose D1 read fails: the write check cannot answer. */
  const failingUserTokens = Layer.succeed(
    UserTokens,
    UserTokens.of({
      tokenGens: () =>
        Effect.fail(new PersistenceError({ operation: "userTokens.tokenGens", cause: "D1 down" })),
      bumpAppTokenGen: () =>
        Effect.fail(new PersistenceError({ operation: "bump", cause: "D1 down" })),
      bumpMcpTokenGen: () =>
        Effect.fail(new PersistenceError({ operation: "bump", cause: "D1 down" })),
    }),
  )

  it("answers 503 SessionStoreUnavailable on a write when the user-row check fails", async () => {
    const app = makeApp(env, {
      auth: {
        _tag: "BetterAuth",
        betterAuth: BetterAuth.layerMemory.pipe(Layer.provide(EmailSender.layerConsole)),
      },
      // Later members of `mergeAll` win: the memory store's `UserTokens` is replaced by the failing one.
      persistence: Layer.mergeAll(memoryPersistence(MemoryStore.layer), failingUserTokens),
    })
    const pair = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Tokens).issueAppPair(
          UserId.make("00000000-0000-4000-8000-0000000f3d01"),
          0,
        )
      }).pipe(Effect.provide(Tokens.layer), Effect.provide(WorkerConfig.layerFromEnv(env))),
    )
    const response = await app.handler(
      new Request("http://localhost/sync/push", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${pair.accessToken}`,
        },
        body: JSON.stringify({ changes: [] }),
      }),
    )
    await app.dispose()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      _tag: "SessionStoreUnavailable",
      message: "session store unavailable",
    })
  })
})
