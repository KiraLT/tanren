import { describe, expect, it } from "@effect/vitest"
import { MCP_SCOPES, UserId } from "@tanren/shared"
import { Effect, Layer, Option, Redacted } from "effect"
import { DEV_USER_ID } from "../auth/devUser"
import { type Environment, WorkerConfig } from "../Config"
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
const withProps = (props: unknown) => ({ props }) as unknown as ExecutionContext

const resolveVia = (layer: Layer.Layer<McpAuth>, context: ExecutionContext, headers = {}) =>
  Effect.gen(function* () {
    return yield* (yield* McpAuth).resolve(
      new Request("http://localhost/mcp", { headers }),
      context,
    )
  }).pipe(Effect.provide(layer))

describe("McpAuth.layerOAuth", () => {
  it.effect("decodes the grant props in ctx.props into the principal", () =>
    Effect.gen(function* () {
      const context = withProps({ userId: owner, scopes: ["tanren:read"] })
      expect(yield* resolveVia(McpAuth.layerOAuth, context)).toEqual(
        Option.some({ userId: owner, scopes: ["tanren:read"] }),
      )
    }),
  )

  it.effect("empty, malformed or foreign-scope props resolve to none", () =>
    Effect.gen(function* () {
      const cases = [
        {},
        { userId: "not-a-uuid", scopes: ["tanren:read"] },
        { userId: owner, scopes: ["tanren:admin"] },
        { userId: owner },
      ]
      const results = yield* Effect.forEach(cases, (props) =>
        resolveVia(McpAuth.layerOAuth, withProps(props)),
      )
      expect(results).toEqual(cases.map(() => Option.none()))
    }),
  )
})

describe("McpAuth.layerLive", () => {
  const live = McpAuth.layerLive.pipe(Layer.provide(config("local", Option.some(TOKEN))))

  it.effect("prefers the OAuth props over a dev token", () =>
    Effect.gen(function* () {
      const context = withProps({ userId: owner, scopes: ["tanren:read"] })
      const header = { Authorization: `Bearer ${TOKEN}` }
      expect(yield* resolveVia(live, context, header)).toEqual(
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
