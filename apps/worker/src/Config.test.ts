import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Redacted } from "effect"
import { ConfigError, WorkerConfig } from "./Config"
import type { EnvVars } from "./Env"

const localEnv: EnvVars = {
  ENVIRONMENT: "local",
  BETTER_AUTH_URL: "http://localhost:8787",
  BETTER_AUTH_SECRET: "local-dev-only-not-a-secret",
  ALLOWED_ORIGINS: "http://localhost:8081, http://localhost:19006",
  EMAIL_MODE: "console",
  EMAIL_FROM: "Tanren <dev@tanren.local>",
  DEV_MCP_TOKEN: "local-dev-only-mcp-token",
  MCP_RESOURCE_URL: "http://localhost:8787/mcp",
}

/** A valid production env: provider email, https resource URL, no dev token. */
const productionEnv = (() => {
  const { DEV_MCP_TOKEN: _omitted, ...withoutToken } = localEnv
  return {
    ...withoutToken,
    ENVIRONMENT: "production",
    EMAIL_MODE: "provider",
    EMAIL_FROM: "Tanren <login@tanren.me>",
    RESEND_API_KEY: "re_test_only_not_a_key",
    MCP_RESOURCE_URL: "https://mcp.tanren.me/mcp",
  }
})()

const RESEND_KEY = "re_test_only_not_a_key"

const load = (env: unknown) =>
  Effect.gen(function* () {
    return yield* WorkerConfig
    // `env` is untyped on purpose: tests feed invalid shapes through the same entry point.
  }).pipe(Effect.provide(WorkerConfig.layerFromEnv(env)))

describe("WorkerConfig.layerFromEnv", () => {
  it.effect("decodes the local env", () =>
    Effect.gen(function* () {
      const config = yield* load(localEnv)
      expect(config.environment).toBe("local")
      expect(config.betterAuthUrl).toBe("http://localhost:8787")
      expect(Redacted.value(config.betterAuthSecret)).toBe("local-dev-only-not-a-secret")
      expect(config.allowedOrigins).toEqual(["http://localhost:8081", "http://localhost:19006"])
      expect(config.emailMode).toBe("console")
      expect(Option.map(config.devMcpToken, Redacted.value)).toEqual(
        Option.some("local-dev-only-mcp-token"),
      )
    }),
  )

  it.effect("treats an absent DEV_MCP_TOKEN as none", () =>
    Effect.gen(function* () {
      const { DEV_MCP_TOKEN: _omitted, ...withoutToken } = localEnv
      const config = yield* load(withoutToken)
      expect(Option.isNone(config.devMcpToken)).toBe(true)
    }),
  )

  it.effect("accepts a production env with a provider and no dev token", () =>
    Effect.gen(function* () {
      const { DEV_MCP_TOKEN: _omitted, ...withoutToken } = localEnv
      const config = yield* load({
        ...withoutToken,
        ENVIRONMENT: "production",
        EMAIL_MODE: "provider",
        EMAIL_FROM: "Tanren <login@tanren.me>",
        RESEND_API_KEY: RESEND_KEY,
        MCP_RESOURCE_URL: "https://mcp.tanren.me/mcp",
      })
      expect(config.environment).toBe("production")
      expect(config.emailMode).toBe("provider")
      expect(config.emailFrom).toBe("Tanren <login@tanren.me>")
      expect(Option.map(config.resendApiKey, Redacted.value)).toEqual(Option.some(RESEND_KEY))
      expect(String(config.resendApiKey)).not.toContain(RESEND_KEY)
    }),
  )

  it.effect("local console mode needs no RESEND_API_KEY", () =>
    Effect.gen(function* () {
      const config = yield* load(localEnv)
      expect(config.emailFrom).toBe("Tanren <dev@tanren.local>")
      expect(Option.isNone(config.resendApiKey)).toBe(true)
    }),
  )

  it.effect("fails in provider mode without RESEND_API_KEY", () =>
    Effect.gen(function* () {
      const { DEV_MCP_TOKEN: _omitted, ...withoutToken } = localEnv
      const local = yield* Effect.flip(load({ ...localEnv, EMAIL_MODE: "provider" }))
      const production = yield* Effect.flip(
        load({ ...withoutToken, ENVIRONMENT: "production", EMAIL_MODE: "provider" }),
      )
      expect([local.message, production.message]).toEqual([
        expect.stringContaining("RESEND_API_KEY"),
        expect.stringContaining("RESEND_API_KEY"),
      ])
      expect(production).toBeInstanceOf(ConfigError)
    }),
  )

  it.effect("fails when EMAIL_FROM is missing", () =>
    Effect.gen(function* () {
      const { EMAIL_FROM: _omitted, ...withoutFrom } = localEnv
      const error = yield* Effect.flip(load(withoutFrom))
      expect(error).toBeInstanceOf(ConfigError)
      expect(error.message).toContain("EMAIL_FROM")
    }),
  )

  it.effect("fails outside local with console email", () =>
    Effect.gen(function* () {
      const { DEV_MCP_TOKEN: _omitted, ...withoutToken } = localEnv
      const error = yield* Effect.flip(load({ ...withoutToken, ENVIRONMENT: "preview" }))
      expect(error).toBeInstanceOf(ConfigError)
      expect(error.message).toContain("EMAIL_MODE")
    }),
  )

  it.effect("fails outside local with DEV_MCP_TOKEN set", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        load({
          ...localEnv,
          ENVIRONMENT: "production",
          EMAIL_MODE: "provider",
          RESEND_API_KEY: RESEND_KEY,
        }),
      )
      expect(error).toBeInstanceOf(ConfigError)
      expect(error.message).toContain("DEV_MCP_TOKEN")
    }),
  )

  it.effect("fails when a var is missing", () =>
    Effect.gen(function* () {
      const { BETTER_AUTH_SECRET: _omitted, ...withoutSecret } = localEnv
      const error = yield* Effect.flip(load(withoutSecret))
      expect(error).toBeInstanceOf(ConfigError)
      expect(error.message).toContain("BETTER_AUTH_SECRET")
    }),
  )

  it.effect("fails on an unknown environment name", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(load({ ...localEnv, ENVIRONMENT: "staging" }))
      expect(error).toBeInstanceOf(ConfigError)
      expect(error.message).toContain("ENVIRONMENT")
    }),
  )

  it.effect("exposes mcpResourceUrl (https in production, http in local)", () =>
    Effect.gen(function* () {
      const production = yield* load(productionEnv)
      const local = yield* load(localEnv)
      expect([production.mcpResourceUrl, local.mcpResourceUrl]).toEqual([
        "https://mcp.tanren.me/mcp",
        "http://localhost:8787/mcp",
      ])
    }),
  )

  it.effect("accepts an https MCP_RESOURCE_URL in local too", () =>
    Effect.gen(function* () {
      const config = yield* load({ ...localEnv, MCP_RESOURCE_URL: "https://mcp.tanren.me/mcp" })
      expect(config.mcpResourceUrl).toBe("https://mcp.tanren.me/mcp")
    }),
  )

  it.effect("fails on an http MCP_RESOURCE_URL in production", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        load({ ...productionEnv, MCP_RESOURCE_URL: "http://mcp.tanren.me/mcp" }),
      )
      expect(error).toBeInstanceOf(ConfigError)
      expect(error.message).toContain("MCP_RESOURCE_URL")
    }),
  )

  it.effect("fails on a relative, garbage, fragment or non-http MCP_RESOURCE_URL", () =>
    Effect.gen(function* () {
      const errors = yield* Effect.forEach(
        ["/mcp", "not a url", "http://localhost:8787/mcp#frag", "ftp://localhost/mcp"],
        (MCP_RESOURCE_URL) => Effect.flip(load({ ...localEnv, MCP_RESOURCE_URL })),
      )
      expect(errors.every((error) => error instanceof ConfigError)).toBe(true)
      expect(errors.every((error) => error.message.includes("MCP_RESOURCE_URL"))).toBe(true)
    }),
  )

  it.effect("fails when MCP_RESOURCE_URL is missing", () =>
    Effect.gen(function* () {
      const { MCP_RESOURCE_URL: _omitted, ...withoutUrl } = localEnv
      const error = yield* Effect.flip(load(withoutUrl))
      expect(error).toBeInstanceOf(ConfigError)
      expect(error.message).toContain("MCP_RESOURCE_URL")
    }),
  )
})

describe("WorkerConfig.fromEnvSync", () => {
  it("returns the same shape as layerFromEnv", () => {
    const config = WorkerConfig.fromEnvSync(localEnv)
    expect(config.environment).toBe("local")
    expect(config.mcpResourceUrl).toBe("http://localhost:8787/mcp")
    expect(config.allowedOrigins).toEqual(["http://localhost:8081", "http://localhost:19006"])
    expect(Option.map(config.devMcpToken, Redacted.value)).toEqual(
      Option.some("local-dev-only-mcp-token"),
    )
  })

  it("dies on a bad env instead of returning a shape", () => {
    expect(() => WorkerConfig.fromEnvSync({ ...localEnv, MCP_RESOURCE_URL: "/mcp" })).toThrow(
      /MCP_RESOURCE_URL/,
    )
    expect(() => WorkerConfig.fromEnvSync({})).toThrow(/ENVIRONMENT/)
  })
})
