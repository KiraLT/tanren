import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Redacted } from "effect"
import { ConfigError, FAKE_INTEGRATION_TOKEN_KEY, WorkerConfig } from "./Config"
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
  STRAVA_MODE: "console",
  STRAVA_CLIENT_ID: "local-strava-client",
  INTEGRATION_TOKEN_KEY: FAKE_INTEGRATION_TOKEN_KEY,
}

const REAL_KEY = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=" // 32 x 0x01, test only
const STRAVA_SECRET = "test-only-strava-secret"

/** A valid production env: provider email + Strava, https resource URL, no dev token, real key. */
const productionEnv = (() => {
  const { DEV_MCP_TOKEN: _omitted, ...withoutToken } = localEnv
  return {
    ...withoutToken,
    ENVIRONMENT: "production",
    EMAIL_MODE: "provider",
    EMAIL_FROM: "Tanren <login@tanren.me>",
    RESEND_API_KEY: "re_test_only_not_a_key",
    MCP_RESOURCE_URL: "https://mcp.tanren.me/mcp",
    STRAVA_MODE: "provider",
    STRAVA_CLIENT_ID: "<owner: strava client id>", // the wrangler.jsonc placeholder must load
    STRAVA_CLIENT_SECRET: STRAVA_SECRET,
    INTEGRATION_TOKEN_KEY: REAL_KEY,
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
      const config = yield* load(productionEnv)
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

describe("NATIVE_RETURN_PREFIXES", () => {
  it.effect(
    "defaults to exp://localhost: + exp://127.0.0.1: locally and to nothing in production",
    () =>
      Effect.gen(function* () {
        expect((yield* load(localEnv)).nativeReturnPrefixes).toEqual([
          "exp://localhost:",
          "exp://127.0.0.1:",
        ])
        expect((yield* load(productionEnv)).nativeReturnPrefixes).toEqual([])
      }),
  )

  it.effect("splits and trims the comma list, keeping case (paths are case-sensitive)", () =>
    Effect.gen(function* () {
      const raw = " exps://u.expo.dev/AbC-123/, ,tanren://"
      const config = yield* load({ ...productionEnv, NATIVE_RETURN_PREFIXES: raw })
      expect(config.nativeReturnPrefixes).toEqual(["exps://u.expo.dev/AbC-123/", "tanren://"])
    }),
  )
})

describe("Strava and integration token config", () => {
  const withoutVar = (env: Record<string, unknown>, name: string) =>
    Object.fromEntries(Object.entries(env).filter(([key]) => key !== name))

  it.effect("local defaults load: console mode, no secret, the fake key", () =>
    Effect.gen(function* () {
      const config = yield* load(localEnv)
      expect(config.stravaMode).toBe("console")
      expect(config.stravaClientId).toBe("local-strava-client")
      expect(Option.isNone(config.stravaClientSecret)).toBe(true)
      expect(Redacted.value(config.integrationTokenKey)).toBe(FAKE_INTEGRATION_TOKEN_KEY)
    }),
  )

  it.effect("provider with a secret loads it redacted", () =>
    Effect.gen(function* () {
      const config = yield* load(productionEnv)
      expect(config.stravaMode).toBe("provider")
      expect(Option.map(config.stravaClientSecret, Redacted.value)).toEqual(
        Option.some(STRAVA_SECRET),
      )
      expect(String(config.stravaClientSecret)).not.toContain(STRAVA_SECRET)
      expect(String(config.integrationTokenKey)).not.toContain(REAL_KEY)
    }),
  )

  it.effect("STRAVA_CONSOLE_FAIL is None by default and Some(inactive) in console mode", () =>
    Effect.gen(function* () {
      expect((yield* load(localEnv)).stravaConsoleFail).toEqual(Option.none())
      const config = yield* load({ ...localEnv, STRAVA_CONSOLE_FAIL: "inactive" })
      expect(config.stravaConsoleFail).toEqual(Option.some("inactive"))
    }),
  )

  it.effect("refuses STRAVA_CONSOLE_FAIL with STRAVA_MODE provider", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(load({ ...productionEnv, STRAVA_CONSOLE_FAIL: "inactive" }))
      expect(error).toBeInstanceOf(ConfigError)
      expect(error.message).toContain("STRAVA_CONSOLE_FAIL")
      expect(error.message).toContain('STRAVA_MODE is "console"')
    }),
  )

  it.effect("refuses an unknown STRAVA_CONSOLE_FAIL value", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(load({ ...localEnv, STRAVA_CONSOLE_FAIL: "revoked" }))
      expect(error).toBeInstanceOf(ConfigError)
      expect(error.message).toContain('STRAVA_CONSOLE_FAIL "revoked"')
    }),
  )

  it.effect("fails in provider mode without STRAVA_CLIENT_SECRET", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(load(withoutVar(productionEnv, "STRAVA_CLIENT_SECRET")))
      expect(error).toBeInstanceOf(ConfigError)
      expect(error.message).toContain("STRAVA_CLIENT_SECRET")
    }),
  )

  it.effect("fails outside local with STRAVA_MODE console", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(load({ ...productionEnv, STRAVA_MODE: "console" }))
      expect(error).toBeInstanceOf(ConfigError)
      expect(error.message).toContain('STRAVA_MODE "console"')
    }),
  )

  it.effect("refuses the fake key outside local", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        load({ ...productionEnv, INTEGRATION_TOKEN_KEY: FAKE_INTEGRATION_TOKEN_KEY }),
      )
      expect(error).toBeInstanceOf(ConfigError)
      expect(error.message).toContain("INTEGRATION_TOKEN_KEY")
      expect(error.message).toContain("fake")
    }),
  )

  it.effect("refuses a key that is not base64 for exactly 32 bytes", () =>
    Effect.gen(function* () {
      const errors = yield* Effect.forEach(
        [
          "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=", // 23 bytes
          "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=", // 55 bytes
          "not base64 at all!!",
        ],
        (INTEGRATION_TOKEN_KEY) => Effect.flip(load({ ...productionEnv, INTEGRATION_TOKEN_KEY })),
      )
      expect(errors.every((error) => error.message.includes("32 bytes"))).toBe(true)
    }),
  )

  it.effect("refuses a wrong-length key locally too", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(load({ ...localEnv, INTEGRATION_TOKEN_KEY: "AAAA" }))
      expect(error.message).toContain("32 bytes")
    }),
  )

  it.effect("fails when a Strava var or the key is missing", () =>
    Effect.gen(function* () {
      const errors = yield* Effect.forEach(
        ["STRAVA_MODE", "STRAVA_CLIENT_ID", "INTEGRATION_TOKEN_KEY"],
        (name) => Effect.flip(load(withoutVar(localEnv, name))),
      )
      expect(
        errors.map(
          (error) => error.message.includes("STRAVA") || error.message.includes("INTEGRATION"),
        ),
      ).toEqual([true, true, true])
    }),
  )
})
