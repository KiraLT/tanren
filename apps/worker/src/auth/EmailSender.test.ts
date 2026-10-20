import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { FetchHttpClient } from "effect/http"
import { WorkerConfig } from "../Config"
import type { EnvVars } from "../Env"
import { EmailSender } from "./EmailSender"

const localEnv: EnvVars = {
  ENVIRONMENT: "local",
  BETTER_AUTH_URL: "http://localhost:8787",
  BETTER_AUTH_SECRET: "test-only-not-a-secret-000000000000000000000",
  ALLOWED_ORIGINS: "http://localhost:8081",
  EMAIL_MODE: "console",
  EMAIL_FROM: "Tanren <dev@tanren.local>",
  MCP_RESOURCE_URL: "http://localhost:8787/mcp",
}
const magicLink = { email: "lukas@example.com", url: "http://localhost:8787/verify?token=abc" }

const sendWith = (env: EnvVars) =>
  Effect.gen(function* () {
    return yield* (yield* EmailSender).send(magicLink)
  }).pipe(
    Effect.provide(
      EmailSender.layer.pipe(Layer.provide(Layer.orDie(WorkerConfig.layerFromEnv(env)))),
    ),
  )

/** Stands in for the Workers `fetch`: answers 418 and echoes the URL it was called with. */
const echoFetch: typeof globalThis.fetch = (input) =>
  Promise.resolve(
    new Response(input instanceof Request ? input.url : String(input), { status: 418 }),
  )

describe("EmailSender.layer", () => {
  it.effect("console mode sends without any provider", () =>
    Effect.gen(function* () {
      yield* sendWith(localEnv)
    }),
  )

  it.effect("provider mode posts to Resend through the fetch client", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        sendWith({ ...localEnv, EMAIL_MODE: "provider", RESEND_API_KEY: "re_test_only" }).pipe(
          Effect.provideService(FetchHttpClient.Fetch, echoFetch),
        ),
      )
      expect(error._tag).toBe("EmailSendFailed")
      expect(error.status).toEqual(Option.some(418))
      expect(error.message).toContain("https://api.resend.com/emails")
    }),
  )
})
