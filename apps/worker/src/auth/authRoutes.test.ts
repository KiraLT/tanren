import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import { WorkerConfig } from "../Config"
import { MemoryTokens } from "../repos/MemoryTokens"
import { envVars } from "../testing/fixtures"
import { authRoutes } from "./authRoutes"
import { BetterAuth } from "./BetterAuth"
import { EmailSendFailed } from "./Email"
import { EmailSender } from "./EmailSender"

/** A real in-memory instance whose Web handler is replaced by `handler`. */
const withHandler = (handler: () => Promise<Response>) =>
  Layer.effect(
    BetterAuth,
    Effect.gen(function* () {
      const real = yield* BetterAuth
      return BetterAuth.of({
        auth: Effect.map(real.auth, (auth) => ({ ...auth, handler })),
      })
    }),
  ).pipe(
    Layer.provide(BetterAuth.layerMemory),
    Layer.provide(EmailSender.layerCapture),
    Layer.provide(WorkerConfig.layerFromEnv(envVars)),
  )

/** Rejects as it does when D1 is unreachable. */
const rejectingHandler = withHandler(() => Promise.reject(new Error("D1 unreachable")))

const RECIPIENT = "lukas@example.com"
const API_KEY = "re_test_only_secret_value"

/**
 * Rejects the way `sendMagicLink` does under `onAPIError.throw`: `Effect.runPromise` rejects with
 * the failure itself, here a Resend 422 whose raw reply names the recipient.
 */
const emailRejectedHandler = withHandler(() =>
  Promise.reject(
    new EmailSendFailed({
      provider: "resend",
      reason: "rejected",
      message: `Resend responded 422: sender not verified, to ${RECIPIENT} with ${API_KEY}`,
      status: Option.some(422),
    }),
  ),
)

/**
 * Resolves something that is not a Response, so `fromWeb` throws: a bug, i.e. a defect.
 * The cast is the point of the fixture: it forges the broken value the types rule out.
 */
const brokenHandler = withHandler(() =>
  Promise.resolve(JSON.parse(`{"headers":null,"secret":"${API_KEY}"}`) as Response),
)

/** `betterAuth()` threw while the lazy instance was being built. */
const failingBuild = Layer.succeed(
  BetterAuth,
  BetterAuth.of({ auth: Effect.die(new Error("betterAuth() threw")) }),
)

const requestWith = (betterAuth: Layer.Layer<BetterAuth, unknown>) =>
  Effect.gen(function* () {
    const { handler, dispose } = HttpRouter.toWebHandler(
      authRoutes.pipe(
        Layer.provide(betterAuth),
        Layer.provide(WorkerConfig.layerFromEnv(envVars)), // the native routes read the secret
        Layer.provide(MemoryTokens.layer),
        Layer.provide(HttpServer.layerServices),
      ),
      { disableLogger: true },
    )
    yield* Effect.addFinalizer(() => Effect.promise(dispose))
    const response = yield* Effect.promise(() =>
      handler(new Request("http://localhost:8787/api/auth/get-session")),
    )
    const body: unknown = yield* Effect.promise(() => response.json())
    return { status: response.status, body }
  })

const unavailable = { _tag: "SessionStoreUnavailable", message: "session store unavailable" }

describe("authRoutes failures", () => {
  it.effect(
    "answers 503 SessionStoreUnavailable, not 500, when Better Auth's handler rejects",
    () =>
      Effect.gen(function* () {
        expect(yield* requestWith(rejectingHandler)).toEqual({ status: 503, body: unavailable })
      }),
  )

  it.effect("answers 503 SessionStoreUnavailable, not 500, when the instance fails to build", () =>
    Effect.gen(function* () {
      expect(yield* requestWith(failingBuild)).toEqual({ status: 503, body: unavailable })
    }),
  )

  it.effect("answers 502 EmailDeliveryFailed when the email provider rejects the send", () =>
    Effect.gen(function* () {
      expect(yield* requestWith(emailRejectedHandler)).toEqual({
        status: 502,
        body: { _tag: "EmailDeliveryFailed", provider: "resend", reason: "rejected" },
      })
    }),
  )

  it.effect("keeps the recipient and the API key out of the 502 body", () =>
    Effect.gen(function* () {
      const { body } = yield* requestWith(emailRejectedHandler)
      expect(JSON.stringify(body)).not.toMatch(new RegExp(`${RECIPIENT}|${API_KEY}|422`))
    }),
  )

  it.effect("answers 500 with a bare InternalError body when the route hits a defect", () =>
    Effect.gen(function* () {
      expect(yield* requestWith(brokenHandler)).toEqual({
        status: 500,
        body: { _tag: "InternalError" },
      })
    }),
  )
})
