import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "@effect/vitest"
import worker from "../index"

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

  it("the bare one-time-token verify endpoint is 404", async () => {
    const response = await call("/api/auth/one-time-token/verify", post({ token: "x".repeat(32) }))
    expect(response.status).toBe(404)
  })
})
