import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it, onTestFinished } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Array as Arr, Effect, Layer, MutableRef } from "effect"
import { d1Persistence, makeApp } from "../app"
import { WorkerConfig } from "../Config"
import worker from "../index"
import { envVars } from "../testing/fixtures"
import { BetterAuth } from "./BetterAuth"
import { EmailSender } from "./EmailSender"
import { Tokens } from "./Tokens"

// The shipped bundle (default export of `src/index.ts`, i.e. the OAuthProvider) on a migrated D1:
// proves the provider forwards `/auth/native/*` and `/api/native/*` to the app, and that wrangler's
// bundle loads `bearer`, `oneTimeToken` and `better-auth/api`. Better Auth skips its origin check
// under `NODE_ENV=test` (Node vitest), so the no-`Origin` sign-in is proven here, in workerd.
const BASE = "http://localhost:8787"
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
const RETURN_TO = "exp://192.168.1.5:8081/--/auth/callback"

const call = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const ctx = createExecutionContext()
  const response = await worker.fetch(new Request(`${BASE}${path}`, init), env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" }, // native fetch: no Origin, no cookie
  body: JSON.stringify(body),
})

describe("native auth through the real default export", () => {
  it("POST /api/native/session {} → 400 NativeCodeRejected malformed", async () => {
    const response = await call("/api/native/session", post({}))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ _tag: "NativeCodeRejected", reason: "malformed" })
  })

  it("GET /auth/native/complete without params → 400 HTML, no redirect", async () => {
    const response = await call("/auth/native/complete", { redirect: "manual" })
    expect(response.status).toBe(400)
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8")
    expect(response.headers.get("location")).toBeNull()
    expect(await response.text()).toContain("This sign-in link is broken")
  })

  it("the native sign-in POST (no Origin, relative native callbackURL) passes originCheck", async () => {
    const callbackURL = `/auth/native/complete?${new URLSearchParams({ challenge: CHALLENGE, returnTo: RETURN_TO })}`
    const response = await call(
      "/api/auth/sign-in/magic-link",
      post({ email: "native@example.com", callbackURL }),
    )
    expect(response.status).toBe(200)
  })

  it("POST /api/native/begin sends the link for a pinned returnTo (wrangler.test.jsonc hosts)", async () => {
    const begin = { email: "native@example.com", challenge: CHALLENGE, returnTo: RETURN_TO }
    const response = await call("/api/native/begin", post(begin))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ sent: true })
  })

  it("POST /api/native/begin refuses an unpinned returnTo host", async () => {
    const returnTo = "exp://evil.example:8081/--/auth/callback"
    const response = await call(
      "/api/native/begin",
      post({ email: "native@example.com", challenge: CHALLENGE, returnTo }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ _tag: "NativeBeginRejected", reason: "return-to" })
  })

  it("the bare one-time-token verify endpoint is 404", async () => {
    const response = await call("/api/auth/one-time-token/verify", post({ token: "x".repeat(32) }))
    expect(response.status).toBe(404)
  })
})

/** Records the SQL text of every statement Better Auth or the repositories prepare on `db`. */
const recordingD1 = (db: D1Database) => {
  const seen = MutableRef.make<ReadonlyArray<string>>([])
  const note = (query: string) => MutableRef.update(seen, (all) => Arr.append(all, query))
  const recorded = new Proxy(db, {
    get: (target, prop) => {
      if (prop === "prepare") {
        return (query: string) => {
          note(query)
          return target.prepare(query)
        }
      }
      if (prop === "exec") {
        return (query: string) => {
          note(query)
          return target.exec(query)
        }
      }
      const value: unknown = Reflect.get(target, prop)
      return typeof value === "function" ? value.bind(target) : value
    },
  })
  return { db: recorded, queries: () => MutableRef.get(seen) }
}

const SESSION_TABLE = /\bsession\b/i
const USER = UserId.make("00000000-0000-4000-8000-0000000000c1")

describe("stateless app tokens in workerd (ADR-0022)", () => {
  it("a request authed with the app access JWT runs no session-table query", async () => {
    const d1 = recordingD1(env.DB)
    const app = makeApp(envVars, {
      auth: {
        _tag: "BetterAuth",
        betterAuth: BetterAuth.layer(d1.db).pipe(Layer.provide(EmailSender.layerCapture)),
      },
      persistence: d1Persistence(d1.db),
    })
    onTestFinished(() => app.dispose())
    const pair = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Tokens).issueAppPair(USER, 0)
      }).pipe(Effect.provide(Tokens.layer), Effect.provide(WorkerConfig.layerFromEnv(envVars))),
    )
    const response = await app.handler(
      new Request(`${BASE}/exercises`, {
        headers: { authorization: `Bearer ${pair.accessToken}` },
      }),
    )
    expect(response.status).toBe(200)
    expect(d1.queries().some((query) => /exercise/i.test(query))).toBe(true) // the recorder sees D1
    expect(d1.queries().filter((query) => SESSION_TABLE.test(query))).toEqual([])
  })

  it("POST /api/token/refresh through the real default export: garbage → 401 TokenRejected", async () => {
    const response = await call("/api/token/refresh", post({ refreshToken: "garbage" }))
    expect(response.status).toBe(401)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({ _tag: "TokenRejected", reason: "invalid" })
  })
})
