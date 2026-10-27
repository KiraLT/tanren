import { describe, expect, it } from "@effect/vitest"
import { PersistenceError, UserTokens } from "@tanren/db"
import { SessionStoreUnavailable, UserId } from "@tanren/shared"
import { Effect, Layer, Option } from "effect"
import { makeApp, memoryPersistence } from "../app"
import { BetterAuth } from "../auth/BetterAuth"
import { EmailSender } from "../auth/EmailSender"
import { Sessions } from "../auth/Sessions"
import { Tokens } from "../auth/Tokens"
import { WorkerConfig } from "../Config"
import { MemoryStore } from "../repos"
import { envVars as env } from "../testing/fixtures"
import { isWriteMethod, rateBucket, USER_RATE_LIMITS } from "./Authentication"

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
      email: () => Effect.fail(new PersistenceError({ operation: "email", cause: "D1 down" })),
      bumpAppTokenGen: () =>
        Effect.fail(new PersistenceError({ operation: "bump", cause: "D1 down" })),
      bumpMcpTokenGen: () =>
        Effect.fail(new PersistenceError({ operation: "bump", cause: "D1 down" })),
      burnRefresh: () => Effect.fail(new PersistenceError({ operation: "burn", cause: "D1 down" })),
      purgeBurnedRefresh: () =>
        Effect.fail(new PersistenceError({ operation: "purge", cause: "D1 down" })),
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

describe("Authentication app token generation on writes (STLS-F7)", () => {
  const user = UserId.make("00000000-0000-4000-8000-0000000f7d01")
  /** `UserTokens` whose `user` row is at app generation `app`. */
  const rowAt = (app: number) =>
    Layer.succeed(
      UserTokens,
      UserTokens.of({
        tokenGens: () => Effect.succeed({ app, mcp: 0 }),
        email: () => Effect.die("unused"),
        bumpAppTokenGen: () => Effect.die("unused"),
        bumpMcpTokenGen: () => Effect.die("unused"),
        burnRefresh: () => Effect.die("unused"),
        purgeBurnedRefresh: () => Effect.die("unused"),
      }),
    )
  /** An app access token for `user` minted at generation 0, sent to a row at `rowGen`. */
  const send = async (rowGen: number, method: "GET" | "POST", path: string) => {
    const app = makeApp(env, {
      auth: {
        _tag: "BetterAuth",
        betterAuth: BetterAuth.layerMemory.pipe(Layer.provide(EmailSender.layerConsole)),
      },
      persistence: Layer.mergeAll(memoryPersistence(MemoryStore.layer), rowAt(rowGen)),
    })
    const pair = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Tokens).issueAppPair(user, 0)
      }).pipe(Effect.provide(Tokens.layer), Effect.provide(WorkerConfig.layerFromEnv(env))),
    )
    const response = await app.handler(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${pair.accessToken}`,
        },
        ...(method === "GET" ? {} : { body: JSON.stringify({ changes: [] }) }),
      }),
    )
    await app.dispose()
    return response
  }

  it("rejects a write with 401 when the token's gen is behind the user's appTokenGen", async () => {
    const response = await send(1, "POST", "/sync/push")
    expect(response.status).toBe(401)
  })

  it("accepts a write when the token's gen equals the user's appTokenGen", async () => {
    const response = await send(0, "POST", "/sync/push")
    expect(response.status).toBe(200)
  })

  it("keeps reads stateless: a stale-gen token still reads until it expires", async () => {
    const response = await send(1, "GET", "/exercises")
    expect(response.status).toBe(200)
  })
})

describe("Authentication per-user limiter and no-store (SEC-1 B5, G1)", () => {
  const userA = "00000000-0000-4000-8000-0000000000a1"
  const userB = "00000000-0000-4000-8000-0000000000b1"
  /** One app per test; the user comes from the `x-user` header (none → signed out). */
  const headerApp = () =>
    makeApp(env, {
      auth: {
        _tag: "Fixed",
        sessions: Layer.succeed(
          Sessions,
          Sessions.of({
            current: (headers) =>
              Effect.succeed(Option.map(Option.fromNullishOr(headers.get("x-user")), UserId.make)),
          }),
        ),
      },
    })
  const send = (app: ReturnType<typeof headerApp>, user: string, method: string, path: string) =>
    app.handler(
      new Request(`http://localhost${path}`, {
        method,
        headers: { "content-type": "application/json", "x-user": user },
        ...(method === "GET" ? {} : { body: JSON.stringify({ changes: [] }) }),
      }),
    )
  const statuses = (responses: ReadonlyArray<Response>) => responses.map((r) => r.status)

  it("answers the 61st /sync/push in a minute 429 with Retry-After, per user", async () => {
    const app = headerApp()
    const first = await Promise.all(
      Array.from({ length: USER_RATE_LIMITS.push.max }, () =>
        send(app, userA, "POST", "/sync/push"),
      ),
    )
    expect(statuses(first)).not.toContain(429)
    const over = await send(app, userA, "POST", "/sync/push")
    expect(over.status).toBe(429)
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0)
    expect(await over.json()).toMatchObject({ _tag: "NativeRateLimited" })
    const other = await send(app, userB, "POST", "/sync/push")
    expect(other.status).not.toBe(429)
  })

  it("keeps reads unlimited (GET and POST /sync/pull)", async () => {
    const app = headerApp()
    const reads = await Promise.all(
      Array.from({ length: USER_RATE_LIMITS.write.max + 5 }, () =>
        send(app, userA, "GET", "/exercises"),
      ),
    )
    expect(statuses(reads)).not.toContain(429)
    expect(rateBucket("POST", "/sync/pull?x=1")).toEqual(Option.none())
    expect(rateBucket("POST", "/exercises")).toEqual(Option.some("write"))
    expect(rateBucket("POST", "/sync/push")).toEqual(Option.some("push"))
  })

  it("sends Cache-Control: no-store on an authenticated route, not on /health", async () => {
    const app = headerApp()
    const listed = await send(app, userA, "GET", "/exercises")
    expect(listed.status).toBe(200)
    expect(listed.headers.get("cache-control")).toBe("no-store")
    const health = await app.handler(new Request("http://localhost/health"))
    expect(health.headers.get("cache-control")).toBeNull()
  })
})
