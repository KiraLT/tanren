import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import { WorkerConfig } from "../Config"
import { envVars } from "../testing/fixtures"
import { authRoutes } from "./authRoutes"
import { BetterAuth } from "./BetterAuth"
import { EmailSender } from "./EmailSender"

/** A real in-memory instance whose Web handler rejects, as it does when D1 is unreachable. */
const rejectingHandler = Layer.effect(
  BetterAuth,
  Effect.gen(function* () {
    const real = yield* BetterAuth
    return BetterAuth.of({
      auth: Effect.map(real.auth, (auth) => ({
        ...auth,
        handler: () => Promise.reject(new Error("D1 unreachable")),
      })),
    })
  }),
).pipe(
  Layer.provide(BetterAuth.layerMemory),
  Layer.provide(EmailSender.layerCapture),
  Layer.provide(WorkerConfig.layerFromEnv(envVars)),
)

/** `betterAuth()` threw while the lazy instance was being built. */
const failingBuild = Layer.succeed(
  BetterAuth,
  BetterAuth.of({ auth: Effect.die(new Error("betterAuth() threw")) }),
)

const requestWith = (betterAuth: Layer.Layer<BetterAuth, unknown>) =>
  Effect.gen(function* () {
    const { handler, dispose } = HttpRouter.toWebHandler(
      authRoutes.pipe(Layer.provide(betterAuth), Layer.provide(HttpServer.layerServices)),
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
})
