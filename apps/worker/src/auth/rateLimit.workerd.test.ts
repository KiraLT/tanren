import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it, vi } from "@effect/vitest"
import { Array as Arr } from "effect"
import { DEV_USER_EMAIL } from "./devUser"

// Better Auth's limiter keys on `advanced.ipAddress.ipAddressHeaders` (default `x-forwarded-for`,
// which a caller chooses); the Worker sets `["cf-connecting-ip"]`. This drives the real default
// export. The limit for `/sign-in/magic-link` is the magicLink plugin's rule, 5 per 60 s
// (better-auth `dist/plugins/magic-link/index.mjs:210-216`; it overrides the generic `/sign-in`
// rule of 3 per 10 s, `dist/api/rate-limiter/index.mjs:253-260`, `:307-312`).
//
// The limiter is on only when `NODE_ENV === "production"` (`dist/context/create-context.mjs:172`,
// read once when `@better-auth/core/env` loads) and neither workerd nor the Worker sets it, so the
// test sets it before `src/index.ts` (and Better Auth) is first imported in this file's module graph.
vi.stubEnv("NODE_ENV", "production")
const { default: worker } = await import("../index")

const BASE = "http://localhost:8787"
const ORIGIN = "http://localhost:8081"
const MAGIC_LINK_MAX = 5

const signIn = async (ip: string, forwardedFor: string): Promise<Response> => {
  const ctx = createExecutionContext()
  const response = await worker.fetch(
    new Request(`${BASE}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        "cf-connecting-ip": ip,
        "x-forwarded-for": forwardedFor,
      },
      body: JSON.stringify({ email: DEV_USER_EMAIL, callbackURL: "/" }),
    }),
    env,
    ctx,
  )
  await waitOnExecutionContext(ctx)
  return response
}

describe("Better Auth rate limit key", () => {
  it("limits per cf-connecting-ip however x-forwarded-for rotates", async () => {
    const statuses = await Arr.range(1, MAGIC_LINK_MAX + 2).reduce<Promise<ReadonlyArray<number>>>(
      async (previous, n) => [
        ...(await previous),
        (await signIn("203.0.113.10", `198.51.100.${n}`)).status,
      ],
      Promise.resolve([]),
    )
    expect(statuses).toEqual([...Arr.replicate(200, MAGIC_LINK_MAX), 429, 429])
  })

  it("keeps a different cf-connecting-ip in its own bucket", async () => {
    expect((await signIn("203.0.113.11", "198.51.100.1")).status).toBe(200)
  })
})
