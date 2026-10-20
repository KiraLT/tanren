import { describe, expect, it } from "@effect/vitest"
import { Array as Arr, Context, Effect, Layer, Option } from "effect"
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/http"
import { WorkerConfig } from "../Config"
import type { EnvVars } from "../Env"
import { authRoutes } from "./authRoutes"
import {
  type AuthDatabase,
  BetterAuth,
  DEV_USER_EMAIL,
  DEV_USER_ID,
  seedUserId,
} from "./BetterAuth"
import { CapturedEmails, EmailSender } from "./EmailSender"
import { Sessions } from "./Sessions"
import { SessionsLive } from "./SessionsLive"

const BASE = "http://localhost:8787"
const ORIGIN = "http://localhost:8081"

const envVars = (environment: "local" | "preview"): EnvVars => ({
  ENVIRONMENT: environment,
  BETTER_AUTH_URL: BASE,
  BETTER_AUTH_SECRET: "test-only-not-a-secret-000000000000000000000",
  ALLOWED_ORIGINS: ORIGIN,
  EMAIL_MODE: environment === "local" ? "console" : "provider",
  EMAIL_FROM: "Tanren <dev@tanren.local>",
  MCP_RESOURCE_URL: "https://mcp.tanren.me/mcp", // https works in every environment
  ...(environment === "local" ? {} : { RESEND_API_KEY: "re_test_only_not_a_key" }),
})

/** Fresh auth stack (memory DB, captured email) with the auth routes served as a Web handler. */
const setup = (environment: "local" | "preview") =>
  Effect.gen(function* () {
    const deps = SessionsLive.pipe(
      Layer.provideMerge(BetterAuth.layerMemory),
      Layer.provideMerge(EmailSender.layerCapture),
      Layer.provideMerge(WorkerConfig.layerFromEnv(envVars(environment))),
    )
    const context = yield* Layer.build(deps)
    const { handler, dispose } = HttpRouter.toWebHandler(
      authRoutes.pipe(
        Layer.provide(Layer.succeedContext(context)),
        Layer.provide(HttpServer.layerServices),
      ),
      { disableLogger: true },
    )
    yield* Effect.addFinalizer(() => Effect.promise(dispose))
    const request = (input: string, init?: RequestInit) =>
      Effect.promise(() => handler(new Request(new URL(input, BASE), init)))
    return { context, request }
  })

const d1Down = () => Promise.reject(new Error("D1_ERROR: network connection lost"))
const deadStatement = {
  bind: () => deadStatement,
  all: d1Down,
  first: d1Down,
  run: d1Down,
  raw: d1Down,
}
/**
 * A D1 binding whose every query rejects. Better Auth picks its D1 dialect by duck typing
 * (`batch`, `exec`, `prepare`), so only those members exist; the cast stands in for the rest of the
 * `D1Database` interface, which the dialect never calls.
 */
const unreachableD1 = {
  batch: d1Down,
  exec: d1Down,
  prepare: () => deadStatement,
} as unknown as AuthDatabase

/** One request through `authRoutes` over an arbitrary auth stack. */
const requestThrough = (
  deps: Layer.Layer<BetterAuth, unknown>,
  input: string,
  init?: RequestInit,
) =>
  Effect.gen(function* () {
    const { handler, dispose } = HttpRouter.toWebHandler(
      authRoutes.pipe(
        Layer.provide(deps),
        Layer.provide(WorkerConfig.layerFromEnv(envVars("local"))), // native routes read the secret
        Layer.provide(HttpServer.layerServices),
      ),
      { disableLogger: true },
    )
    yield* Effect.addFinalizer(() => Effect.promise(dispose))
    return yield* Effect.promise(() => handler(new Request(new URL(input, BASE), init)))
  })

const signIn = (environment: "local" | "preview", email: string) =>
  Effect.gen(function* () {
    const { context, request } = yield* setup(environment)
    const requested = yield* request("/api/auth/sign-in/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, callbackURL: "/" }),
    })
    expect(requested.status).toBe(200)
    const sent = yield* Context.get(context, CapturedEmails).sent
    expect(sent.map((mail) => mail.email)).toEqual([email])
    const link = yield* Option.match(Arr.head(sent), {
      onNone: () => Effect.die("no magic link captured"),
      onSome: (mail) => Effect.succeed(mail.url),
    })
    const verified = yield* request(link, { redirect: "manual" })
    const cookie = verified.headers
      .getSetCookie()
      .map((header) => header.split(";")[0] ?? "")
      .join("; ")
    const sessions = Context.get(context, Sessions)
    return { verified, cookie, sessions }
  })

describe("magic-link sign-in", () => {
  it.effect("request → captured link → verify → session cookie → Sessions.current", () =>
    Effect.gen(function* () {
      const { verified, cookie, sessions } = yield* signIn("local", "lukas@example.com")
      expect(verified.status).toBe(302)
      expect(cookie).toContain("session_token=")
      const userId = yield* sessions.current(new Headers({ cookie }))
      expect(Option.isSome(userId)).toBe(true)
      expect(Option.getOrThrow(userId)).not.toBe(DEV_USER_ID)
    }),
  )

  it.effect("no cookie → no user", () =>
    Effect.gen(function* () {
      const { context } = yield* setup("local")
      const sessions = Context.get(context, Sessions)
      expect(yield* sessions.current(new Headers())).toEqual(Option.none())
    }),
  )

  it.effect("forged cookie → no user", () =>
    Effect.gen(function* () {
      const { context } = yield* setup("local")
      const sessions = Context.get(context, Sessions)
      const forged = new Headers({ cookie: "better-auth.session_token=forged" })
      expect(yield* sessions.current(forged)).toEqual(Option.none())
    }),
  )

  it.effect("dev@tanren.local in local gets the seed user id", () =>
    Effect.gen(function* () {
      const { cookie, sessions } = yield* signIn("local", DEV_USER_EMAIL)
      expect(yield* sessions.current(new Headers({ cookie }))).toEqual(Option.some(DEV_USER_ID))
    }),
  )

  it.effect("provider mode answers 502 EmailDeliveryFailed when Resend rejects the email", () =>
    Effect.gen(function* () {
      const deps = BetterAuth.layerMemory.pipe(
        Layer.provideMerge(EmailSender.layer),
        Layer.provideMerge(WorkerConfig.layerFromEnv(envVars("preview"))),
        // No network in tests: the fetch Resend's client uses answers 401 (bad API key).
        Layer.provideMerge(
          Layer.succeed(FetchHttpClient.Fetch, () =>
            Promise.resolve(new Response("{}", { status: 401 })),
          ),
        ),
      )
      const response = yield* requestThrough(deps, "/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ email: "lukas@example.com" }),
      })
      expect(response.status).toBe(502)
      expect(yield* Effect.promise(() => response.json())).toEqual({
        _tag: "EmailDeliveryFailed",
        provider: "resend",
        reason: "rejected",
      })
    }),
  )

  it.effect("answers 503 SessionStoreUnavailable when every D1 query rejects", () =>
    Effect.gen(function* () {
      const deps = BetterAuth.layer(unreachableD1).pipe(
        Layer.provide(EmailSender.layerCapture),
        Layer.provide(WorkerConfig.layerFromEnv(envVars("local"))),
      )
      const response = yield* requestThrough(deps, "/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ email: "lukas@example.com" }),
      })
      expect(response.status).toBe(503)
      expect(yield* Effect.promise(() => response.json())).toMatchObject({
        _tag: "SessionStoreUnavailable",
      })
    }),
  )

  it.effect("an API error (bad body) is still Better Auth's own 4xx response", () =>
    Effect.gen(function* () {
      const { request } = yield* setup("local")
      const response = yield* request("/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ email: "not-an-email" }),
      })
      expect(response.status).toBe(400)
    }),
  )
})

describe("seedUserId", () => {
  it("applies only to dev@tanren.local in local", () => {
    expect(seedUserId("local", "Dev@Tanren.Local")).toEqual(Option.some(DEV_USER_ID))
    expect(seedUserId("preview", DEV_USER_EMAIL)).toEqual(Option.none())
    expect(seedUserId("local", "lukas@example.com")).toEqual(Option.none())
  })
})

describe("authRoutes", () => {
  it.effect("serves /api/auth/ok through HttpRouter.toWebHandler", () =>
    Effect.gen(function* () {
      const { request } = yield* setup("local")
      const response = yield* request("/api/auth/ok")
      expect(response.status).toBe(200)
      expect(yield* Effect.promise(() => response.json())).toEqual({ ok: true })
    }),
  )

  it.effect("leaves other paths to the rest of the router", () =>
    Effect.gen(function* () {
      const { request } = yield* setup("local")
      expect((yield* request("/health")).status).toBe(404)
    }),
  )
})
