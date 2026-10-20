import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Effect, Layer, Option, Redacted } from "effect"
import { DEV_USER_ID } from "../auth/devUser"
import { type Environment, WorkerConfig } from "../Config"
import { envVars } from "../testing/fixtures"
import { constantTimeEqual, McpAuth } from "./McpAuth"

const TOKEN = "local-dev-only-mcp-token"

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
    return yield* auth.resolve(new Request("http://localhost/mcp", { headers }))
  }).pipe(Effect.provide(McpAuth.layerDevToken.pipe(Layer.provide(config(environment, token)))))

describe("McpAuth.layerDevToken", () => {
  it.effect("the matching bearer token in local resolves to the dev user", () =>
    Effect.gen(function* () {
      expect(yield* resolveWith({ Authorization: `Bearer ${TOKEN}` })).toEqual(
        Option.some(DEV_USER_ID),
      )
      expect(yield* resolveWith({ authorization: `bearer ${TOKEN}` })).toEqual(
        Option.some(DEV_USER_ID),
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
  it.effect("resolves every request to the given user", () =>
    Effect.gen(function* () {
      const user = UserId.make("00000000-0000-4000-8000-0000000000a1")
      const resolve = (userId: Option.Option<UserId>) =>
        Effect.gen(function* () {
          return yield* (yield* McpAuth).resolve(new Request("http://localhost/mcp"))
        }).pipe(Effect.provide(McpAuth.layerFixed(userId)))
      expect(yield* resolve(Option.some(user))).toEqual(Option.some(user))
      expect(yield* resolve(Option.none())).toEqual(Option.none())
    }),
  )
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
  const some = Option.some(DEV_USER_ID)
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
