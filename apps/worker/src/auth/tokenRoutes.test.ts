import { describe, expect, it } from "@effect/vitest"
import { UserTokens } from "@tanren/db"
import { AppTokenPair, UserId } from "@tanren/shared"
import { Context, DateTime, Effect, Layer, Option, Redacted, Schema } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import { MemoryTokens } from "../repos/MemoryTokens"
import { verdictOf } from "./refreshRotation"
import { Sessions } from "./Sessions"
import { Tokens } from "./Tokens"
import { tokenRoutes } from "./tokenRoutes"

const USER = UserId.make("00000000-0000-4000-8000-0000000000b1")
const config = {
  betterAuthUrl: "http://localhost:8787",
  betterAuthSecret: Redacted.make("token-routes-test-secret-0123456789abcdef"),
  mcpResourceUrl: "http://localhost:8787/mcp",
}

/**
 * `tokenRoutes` as a Web handler on memory token generations. `cookieUser` is what the web cookie
 * session (`Sessions.current`) answers. The handler runs on its own runtime with the real clock.
 */
const setup = (cookieUser: Option.Option<UserId> = Option.none()) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      Layer.mergeAll(MemoryTokens.layer, Tokens.layerWith(config), Sessions.layerFixed(cookieUser)),
    )
    const { handler, dispose } = HttpRouter.toWebHandler(
      tokenRoutes.pipe(
        Layer.provide(Layer.succeedContext(context)),
        Layer.provide(HttpServer.layerServices),
      ),
      { disableLogger: true },
    )
    yield* Effect.addFinalizer(() => Effect.promise(dispose))
    const post = (path: string, init: RequestInit = {}) =>
      Effect.promise(() =>
        handler(new Request(`http://localhost:8787${path}`, { method: "POST", ...init })),
      )
    const refresh = (refreshToken: string) =>
      post("/api/token/refresh", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      })
    const withBearer = (path: string, token: string) =>
      post(path, { headers: { authorization: `Bearer ${token}` } })
    const json = (response: Response): Effect.Effect<unknown> =>
      Effect.promise(() => response.json())
    return {
      tokens: Context.get(context, Tokens),
      users: Context.get(context, UserTokens),
      post,
      refresh,
      withBearer,
      json,
    }
  })

type Harness = Effect.Success<ReturnType<typeof setup>>

const expectRejected = (harness: Harness, response: Response, reason: string) =>
  Effect.gen(function* () {
    expect(response.status).toBe(401)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(yield* harness.json(response)).toEqual({ _tag: "TokenRejected", reason })
  })

describe("POST /api/token/refresh", () => {
  it.live("trades a live refresh token for a new pair whose access token verifies", () =>
    Effect.gen(function* () {
      const harness = yield* setup()
      const pair = yield* harness.tokens.issueAppPair(USER, 0)
      const response = yield* harness.refresh(pair.refreshToken)
      expect(response.status).toBe(200)
      expect(response.headers.get("cache-control")).toBe("no-store")
      const next = yield* Schema.decodeUnknownEffect(AppTokenPair)(yield* harness.json(response))
      expect(next.refreshToken).not.toBe(pair.refreshToken)
      const identity = yield* harness.tokens.verifyApp(next.accessToken)
      expect(identity).toMatchObject({ userId: USER, gen: 0 })
    }),
  )

  it.live("a burned refresh token re-sent at once gets a fresh pair, no bump (30 s grace)", () =>
    Effect.gen(function* () {
      const harness = yield* setup()
      const pair = yield* harness.tokens.issueAppPair(USER, 0)
      expect((yield* harness.refresh(pair.refreshToken)).status).toBe(200)
      const resent = yield* harness.refresh(pair.refreshToken)
      expect(resent.status).toBe(200)
      yield* Schema.decodeUnknownEffect(AppTokenPair)(yield* harness.json(resent))
      expect(yield* harness.users.tokenGens(USER)).toEqual({ app: 0, mcp: 0 })
    }),
  )

  it.live("a refresh token burned 31 s ago is 401 revoked and kills every app token", () =>
    Effect.gen(function* () {
      const harness = yield* setup()
      const pair = yield* harness.tokens.issueAppPair(USER, 0)
      const rotated = yield* Schema.decodeUnknownEffect(AppTokenPair)(
        yield* harness.json(yield* harness.refresh(pair.refreshToken)),
      )
      // The handler runs on the real clock: simulate "burned 31 s ago" by writing that ledger row.
      const stale = yield* harness.tokens.issueAppPair(USER, 0)
      const identity = yield* harness.tokens.verifyAppRefresh(stale.refreshToken)
      const now = yield* DateTime.now
      yield* harness.users.burnRefresh({
        userId: USER,
        jti: identity.jti,
        expiresAt: DateTime.add(now, { days: 31 }),
        burnedAt: DateTime.subtract(now, { seconds: 31 }),
      })
      yield* expectRejected(harness, yield* harness.refresh(stale.refreshToken), "revoked")
      expect(yield* harness.users.tokenGens(USER)).toEqual({ app: 1, mcp: 0 })
      yield* expectRejected(harness, yield* harness.refresh(rotated.refreshToken), "revoked")
    }),
  )

  it.live("a token burned by the route survives a purge at exp + 30 s (skew window)", () =>
    Effect.gen(function* () {
      const harness = yield* setup()
      const pair = yield* harness.tokens.issueAppPair(USER, 0)
      const identity = yield* harness.tokens.verifyAppRefresh(pair.refreshToken)
      expect((yield* harness.refresh(pair.refreshToken)).status).toBe(200)
      // 30 s past `exp` the token still verifies (60 s skew), so the purge must keep its row.
      const atExpPlus30 = DateTime.add(DateTime.makeUnsafe(identity.exp * 1000), { seconds: 30 })
      yield* harness.users.purgeBurnedRefresh(atExpPlus30)
      // The handler runs on the real clock (a replay now would be grace), so probe the kept row
      // directly: a replay at exp + 30 s finds it burned, and `verdictOf` there is reuse.
      const replay = yield* harness.users.burnRefresh({
        userId: USER,
        jti: identity.jti,
        expiresAt: atExpPlus30,
        burnedAt: atExpPlus30,
      })
      expect(replay._tag).toBe("AlreadyBurned")
      expect(verdictOf(replay, atExpPlus30)).toBe("reuse")
    }),
  )

  it.live("is 401 revoked after bumpAppTokenGen", () =>
    Effect.gen(function* () {
      const harness = yield* setup()
      const pair = yield* harness.tokens.issueAppPair(USER, 0)
      yield* harness.users.bumpAppTokenGen(USER)
      yield* expectRejected(harness, yield* harness.refresh(pair.refreshToken), "revoked")
    }),
  )

  it.live("is 401 invalid for an access token (wrong audience)", () =>
    Effect.gen(function* () {
      const harness = yield* setup()
      const pair = yield* harness.tokens.issueAppPair(USER, 0)
      yield* expectRejected(harness, yield* harness.refresh(pair.accessToken), "invalid")
    }),
  )

  // `it.effect`: the pair is signed at TestClock epoch 0; the handler checks it with the real clock.
  it.effect("is 401 expired for a refresh token past its 30 days", () =>
    Effect.gen(function* () {
      const harness = yield* setup()
      const pair = yield* harness.tokens.issueAppPair(USER, 0)
      yield* expectRejected(harness, yield* harness.refresh(pair.refreshToken), "expired")
    }),
  )

  it.live("is 401 invalid for a garbage token or body, and reads no cookie", () =>
    Effect.gen(function* () {
      const harness = yield* setup(Option.some(USER))
      yield* expectRejected(harness, yield* harness.refresh("garbage"), "invalid")
      const noBody = yield* harness.post("/api/token/refresh", { headers: { cookie: "x=y" } })
      yield* expectRejected(harness, noBody, "invalid")
    }),
  )
})

describe("POST /api/token/revoke", () => {
  it.live("204 with an access token, after which the refresh token is revoked", () =>
    Effect.gen(function* () {
      const harness = yield* setup()
      const pair = yield* harness.tokens.issueAppPair(USER, 0)
      const response = yield* harness.withBearer("/api/token/revoke", pair.accessToken)
      expect(response.status).toBe(204)
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(yield* harness.users.tokenGens(USER)).toEqual({ app: 1, mcp: 0 })
      yield* expectRejected(harness, yield* harness.refresh(pair.refreshToken), "revoked")
    }),
  )

  it.live("401 without a bearer, even with a cookie session", () =>
    Effect.gen(function* () {
      const harness = yield* setup(Option.some(USER))
      yield* expectRejected(harness, yield* harness.post("/api/token/revoke"), "invalid")
      expect(yield* harness.users.tokenGens(USER)).toEqual({ app: 0, mcp: 0 })
    }),
  )

  it.live("401 for a refresh token as bearer", () =>
    Effect.gen(function* () {
      const harness = yield* setup()
      const pair = yield* harness.tokens.issueAppPair(USER, 0)
      const response = yield* harness.withBearer("/api/token/revoke", pair.refreshToken)
      yield* expectRejected(harness, response, "invalid")
    }),
  )
})

describe("POST /api/token/revoke-mcp", () => {
  it.live("204 with an app access token: bumps the mcp generation, not the app one", () =>
    Effect.gen(function* () {
      const harness = yield* setup()
      const pair = yield* harness.tokens.issueAppPair(USER, 0)
      const response = yield* harness.withBearer("/api/token/revoke-mcp", pair.accessToken)
      expect(response.status).toBe(204)
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(yield* harness.users.tokenGens(USER)).toEqual({ app: 0, mcp: 1 })
    }),
  )

  it.live("204 with the web cookie session", () =>
    Effect.gen(function* () {
      const harness = yield* setup(Option.some(USER))
      const response = yield* harness.post("/api/token/revoke-mcp", { headers: { cookie: "s=1" } })
      expect(response.status).toBe(204)
      expect(yield* harness.users.tokenGens(USER)).toEqual({ app: 0, mcp: 1 })
    }),
  )

  it.live("401 without a principal, and a forged JWT does not fall back to the cookie", () =>
    Effect.gen(function* () {
      yield* Effect.gen(function* () {
        const harness = yield* setup()
        yield* expectRejected(harness, yield* harness.post("/api/token/revoke-mcp"), "invalid")
      })
      const harness = yield* setup(Option.some(USER))
      const forged = yield* harness.withBearer(
        "/api/token/revoke-mcp",
        "eyJhbGciOiJIUzI1NiJ9.e30.x",
      )
      yield* expectRejected(harness, forged, "invalid")
      expect(yield* harness.users.tokenGens(USER)).toEqual({ app: 0, mcp: 0 })
    }),
  )
})
