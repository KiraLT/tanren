import { describe, expect, it } from "@effect/vitest"
import { UserNotFound, UserTokens } from "@tanren/db"
import { MCP_SCOPES, UserId } from "@tanren/shared"
import { Effect, Layer, Option, Redacted } from "effect"
import { DEV_USER_ID } from "../auth/devUser"
import { Tokens } from "../auth/Tokens"
import { type Environment, WorkerConfig } from "../Config"
import { MemoryTokens } from "../repos/MemoryTokens"
import { envVars } from "../testing/fixtures"
import {
  challenge,
  constantTimeEqual,
  DEV_PRINCIPAL,
  devPrincipalFor,
  McpAuth,
  type McpPrincipal,
} from "./McpAuth"

const TOKEN = "local-dev-only-mcp-token"

// Node has no `ExecutionContext`; the dev-token and fixed layers never read it, so an empty
// `props` is all this fake carries. The cast is the only way to build the ambient workerd type.
const ctx = { props: {} } as unknown as ExecutionContext

// The shared local env, decoded, then overridden: this also hands `layerDevToken` a config the env
// guard would refuse (a token outside `local`), and keeps working when `WorkerConfigShape` grows.
const config = (environment: Environment, token: Option.Option<string>) =>
  Layer.effect(
    WorkerConfig,
    Effect.gen(function* () {
      const local = yield* WorkerConfig
      return WorkerConfig.of({
        ...local,
        environment,
        devMcpToken: Option.map(token, (value) => Redacted.make(value)),
      })
    }).pipe(Effect.provide(WorkerConfig.layerFromEnv(envVars)), Effect.orDie),
  )

const resolveWith = (
  headers: Record<string, string>,
  environment: Environment = "local",
  token: Option.Option<string> = Option.some(TOKEN),
) =>
  Effect.gen(function* () {
    const auth = yield* McpAuth
    return yield* auth.resolve(new Request("http://localhost/mcp", { headers }), ctx)
  }).pipe(Effect.provide(McpAuth.layerDevToken.pipe(Layer.provide(config(environment, token)))))

describe("McpAuth.layerDevToken", () => {
  it.effect("the matching bearer token in local resolves to the dev user with every scope", () =>
    Effect.gen(function* () {
      const expected = Option.some({ userId: DEV_USER_ID, scopes: MCP_SCOPES })
      expect(yield* resolveWith({ Authorization: `Bearer ${TOKEN}` })).toEqual(expected)
      expect(yield* resolveWith({ authorization: `bearer ${TOKEN}` })).toEqual(expected)
    }),
  )

  it.effect("the dev principal carries tanren:read and tanren:write", () =>
    Effect.gen(function* () {
      const principal = yield* resolveWith({ Authorization: `Bearer ${TOKEN}` })
      expect(Option.map(principal, (p) => p.scopes)).toEqual(
        Option.some(["tanren:read", "tanren:write"]),
      )
    }),
  )

  it.effect("a wrong token, a prefix of it or a longer one resolves to none", () =>
    Effect.gen(function* () {
      expect(yield* resolveWith({ Authorization: "Bearer nope" })).toEqual(Option.none())
      expect(yield* resolveWith({ Authorization: `Bearer ${TOKEN.slice(0, -1)}` })).toEqual(
        Option.none(),
      )
      expect(yield* resolveWith({ Authorization: `Bearer ${TOKEN}x` })).toEqual(Option.none())
    }),
  )

  it.effect("a missing header or an empty bearer resolves to none", () =>
    Effect.gen(function* () {
      expect(yield* resolveWith({})).toEqual(Option.none())
      expect(yield* resolveWith({ Authorization: "Bearer " })).toEqual(Option.none())
    }),
  )

  it.effect("a non-Bearer scheme carrying the right token resolves to none", () =>
    Effect.gen(function* () {
      expect(yield* resolveWith({ Authorization: `Basic ${TOKEN}` })).toEqual(Option.none())
      expect(yield* resolveWith({ Authorization: TOKEN })).toEqual(Option.none())
    }),
  )

  it.effect("outside local the right token resolves to none", () =>
    Effect.gen(function* () {
      const header = { Authorization: `Bearer ${TOKEN}` }
      expect(yield* resolveWith(header, "preview")).toEqual(Option.none())
      expect(yield* resolveWith(header, "production")).toEqual(Option.none())
    }),
  )

  it.effect("without a configured token any bearer resolves to none", () =>
    Effect.gen(function* () {
      expect(
        yield* resolveWith({ Authorization: `Bearer ${TOKEN}` }, "local", Option.none()),
      ).toEqual(Option.none())
    }),
  )
})

describe("McpAuth.layerFixed", () => {
  it.effect("resolves every request to the given principal", () =>
    Effect.gen(function* () {
      const reader: McpPrincipal = {
        userId: UserId.make("00000000-0000-4000-8000-0000000000a1"),
        scopes: ["tanren:read"],
      }
      const resolve = (principal: Option.Option<McpPrincipal>) =>
        Effect.gen(function* () {
          return yield* (yield* McpAuth).resolve(new Request("http://localhost/mcp"), ctx)
        }).pipe(Effect.provide(McpAuth.layerFixed(principal)))
      expect(yield* resolve(Option.some(reader))).toEqual(Option.some(reader))
      expect(yield* resolve(Option.none())).toEqual(Option.none())
    }),
  )
})

const owner = UserId.make("00000000-0000-4000-8000-0000000000a1")
const TOKENS_CONFIG = {
  betterAuthUrl: envVars.BETTER_AUTH_URL,
  betterAuthSecret: Redacted.make(envVars.BETTER_AUTH_SECRET), // test only
  mcpResourceUrl: envVars.MCP_RESOURCE_URL,
}
const tokensLayer = Tokens.layerWith(TOKENS_CONFIG)

const resolveVia = (layer: Layer.Layer<McpAuth>, context: ExecutionContext, headers = {}) =>
  Effect.gen(function* () {
    return yield* (yield* McpAuth).resolve(
      new Request("http://localhost/mcp", { headers }),
      context,
    )
  }).pipe(Effect.provide(layer))

/** An MCP access + refresh pair for `owner` with read scope, signed with the fixture secret. */
const mcpPair = Effect.gen(function* () {
  return yield* (yield* Tokens).issueMcpPair({
    userId: owner,
    scopes: ["tanren:read"],
    clientId: "https://claude.ai/oauth/claude-code-client-metadata",
    gen: 0,
  })
}).pipe(Effect.provide(tokensLayer))

describe("McpAuth.layerJwt", () => {
  const jwt = McpAuth.layerJwt.pipe(Layer.provide(Layer.mergeAll(tokensLayer, MemoryTokens.layer)))

  it.effect("a valid MCP access JWT resolves to its user and scopes", () =>
    Effect.gen(function* () {
      const { accessToken } = yield* mcpPair
      expect(yield* resolveVia(jwt, ctx, { Authorization: `Bearer ${accessToken}` })).toEqual(
        Option.some({ userId: owner, scopes: ["tanren:read"] }),
      )
    }),
  )

  it.effect("a refresh token, a garbage token or no header resolve to none", () =>
    Effect.gen(function* () {
      const { refreshToken } = yield* mcpPair
      const results = yield* Effect.forEach(
        [{ Authorization: `Bearer ${refreshToken}` }, { Authorization: "Bearer x.y.z" }, {}],
        (headers) => resolveVia(jwt, ctx, headers),
      )
      expect(results).toEqual([Option.none(), Option.none(), Option.none()])
    }),
  )

  it.effect("a token signed with another secret resolves to none", () =>
    Effect.gen(function* () {
      const foreign = yield* Effect.gen(function* () {
        return yield* (yield* Tokens).issueMcpPair({
          userId: owner,
          scopes: ["tanren:read"],
          clientId: "c",
          gen: 0,
        })
      }).pipe(
        Effect.provide(
          Tokens.layerWith({
            ...TOKENS_CONFIG,
            betterAuthSecret: Redacted.make("other-secret-000000000000000000000000"),
          }),
        ),
      )
      expect(
        yield* resolveVia(jwt, ctx, { Authorization: `Bearer ${foreign.accessToken}` }),
      ).toEqual(Option.none())
    }),
  )
})

describe("McpAuth.layerLive", () => {
  const live = McpAuth.layerLive.pipe(
    Layer.provide(Layer.mergeAll(config("local", Option.some(TOKEN)), MemoryTokens.layer)),
  )

  it.effect("resolves an MCP access JWT", () =>
    Effect.gen(function* () {
      const { accessToken } = yield* mcpPair
      const header = { Authorization: `Bearer ${accessToken}` }
      expect(yield* resolveVia(live, ctx, header)).toEqual(
        Option.some({ userId: owner, scopes: ["tanren:read"] }),
      )
    }),
  )

  it.effect("falls back to the local dev token, and to none without either", () =>
    Effect.gen(function* () {
      const header = { Authorization: `Bearer ${TOKEN}` }
      expect(yield* resolveVia(live, ctx, header)).toEqual(Option.some(DEV_PRINCIPAL))
      expect(yield* resolveVia(live, ctx)).toEqual(Option.none())
    }),
  )
})

describe("devPrincipalFor", () => {
  it("accepts only the configured token, only in local", () => {
    const token = Option.some(Redacted.make(TOKEN))
    expect(devPrincipalFor({ environment: "local", devMcpToken: token }, TOKEN)).toEqual(
      Option.some(DEV_PRINCIPAL),
    )
    expect(devPrincipalFor({ environment: "local", devMcpToken: token }, "nope")).toEqual(
      Option.none(),
    )
    expect(devPrincipalFor({ environment: "production", devMcpToken: token }, TOKEN)).toEqual(
      Option.none(),
    )
  })
})

describe("constantTimeEqual", () => {
  it("is plain equality on strings of any length", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true)
    expect(constantTimeEqual("abc", "abd")).toBe(false)
    expect(constantTimeEqual("abc", "ab")).toBe(false)
    expect(constantTimeEqual("", "")).toBe(true)
    expect(constantTimeEqual("ü", "u")).toBe(false)
  })
})

describe("QA: bearer header parsing", () => {
  const some = Option.some(DEV_PRINCIPAL)
  it.effect("scheme is case-insensitive and extra inner spaces are tolerated", () =>
    Effect.gen(function* () {
      expect(yield* resolveWith({ Authorization: `bearer ${TOKEN}` })).toEqual(some)
      expect(yield* resolveWith({ Authorization: `BEARER ${TOKEN}` })).toEqual(some)
      expect(yield* resolveWith({ Authorization: `Bearer   ${TOKEN}` })).toEqual(some)
    }),
  )
  it.effect("prefix, suffix, embedded space, tab-separated or empty tokens resolve to none", () =>
    Effect.gen(function* () {
      const none = Option.none()
      expect(yield* resolveWith({ Authorization: `Bearer ${TOKEN}x` })).toEqual(none)
      expect(yield* resolveWith({ Authorization: `Bearer x${TOKEN}` })).toEqual(none)
      expect(yield* resolveWith({ Authorization: `Bearer ${TOKEN.slice(0, -1)}` })).toEqual(none)
      expect(yield* resolveWith({ Authorization: `Bearer ${TOKEN} extra` })).toEqual(none)
      expect(yield* resolveWith({ Authorization: `Bearer ${TOKEN} ${TOKEN}` })).toEqual(none)
      expect(yield* resolveWith({ Authorization: "Bearer" })).toEqual(none)
      expect(yield* resolveWith({ Authorization: "Bearer    " })).toEqual(none)
      expect(yield* resolveWith({ Authorization: `Bearer${TOKEN}` })).toEqual(none)
    }),
  )
  it.effect("an empty configured token never matches an empty bearer", () =>
    Effect.gen(function* () {
      expect(yield* resolveWith({ Authorization: "Bearer " }, "local", Option.some(""))).toEqual(
        Option.none(),
      )
    }),
  )
})

describe("challenge", () => {
  it("matches the provider's 401 for the resource", () => {
    expect(challenge("https://mcp.tanren.me/mcp")).toBe(
      'Bearer realm="OAuth", resource_metadata="https://mcp.tanren.me/.well-known/oauth-protected-resource/mcp", scope="tanren:read tanren:write"',
    )
  })
})

describe("McpAuth.writeAllowed (STLS-F4)", () => {
  /** `UserTokens` with no `user` rows at all: every lookup is `UserNotFound`. */
  const noUsers = Layer.succeed(
    UserTokens,
    UserTokens.of({
      tokenGens: (userId) => Effect.fail(new UserNotFound({ userId })),
      bumpAppTokenGen: (userId) => Effect.fail(new UserNotFound({ userId })),
      bumpMcpTokenGen: (userId) => Effect.fail(new UserNotFound({ userId })),
      burnRefresh: () => Effect.die("unused"),
      purgeBurnedRefresh: () => Effect.die("unused"),
    }),
  )
  const principal: McpPrincipal = { userId: owner, scopes: ["tanren:write"] }
  const allowedVia = (layer: Layer.Layer<McpAuth>) =>
    Effect.gen(function* () {
      return yield* (yield* McpAuth).writeAllowed(principal)
    }).pipe(Effect.provide(layer))

  it.effect("the JWT layer allows a write while the user row exists", () =>
    Effect.gen(function* () {
      const layer = McpAuth.layerJwt.pipe(
        Layer.provide(Layer.mergeAll(tokensLayer, MemoryTokens.layer)),
      )
      expect(yield* allowedVia(layer)).toBe(true)
    }),
  )

  it.effect("the JWT and live layers refuse a write once the user row is gone", () =>
    Effect.gen(function* () {
      const jwt = McpAuth.layerJwt.pipe(Layer.provide(Layer.mergeAll(tokensLayer, noUsers)))
      const live = McpAuth.layerLive.pipe(
        Layer.provide(Layer.mergeAll(config("local", Option.some(TOKEN)), noUsers)),
      )
      expect([yield* allowedVia(jwt), yield* allowedVia(live)]).toEqual([false, false])
    }),
  )

  it.effect("the dev-token and fixed layers never read a user row", () =>
    Effect.gen(function* () {
      const dev = McpAuth.layerDevToken.pipe(Layer.provide(config("local", Option.some(TOKEN))))
      const fixed = McpAuth.layerFixed(Option.some(principal))
      expect([yield* allowedVia(dev), yield* allowedVia(fixed)]).toEqual([true, true])
    }),
  )
})
