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
}

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
})
