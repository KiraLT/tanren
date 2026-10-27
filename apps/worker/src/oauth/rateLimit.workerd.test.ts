import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Array as Arr, Layer, Option, Schema } from "effect"
import { d1Persistence, makeApp } from "../app"
import { BetterAuth } from "../auth/BetterAuth"
import { EmailSender } from "../auth/EmailSender"
import { Sessions } from "../auth/Sessions"
import { WorkerConfig } from "../Config"
import { McpAuth } from "../mcp/McpAuth"
import { makeMcp } from "../mcp/McpRoute"
import { makeAuthorize } from "./authorize"
import { makeRouter, OAUTH_RATE_LIMITS, statelessOAuth } from "./provider"

// SEC-A2 (A4): `/authorize*`, `POST /oauth/token` and `POST /oauth/register` are limited per
// `cf-connecting-ip` in `makeRouter`. Same wiring as `oauth.workerd.test.ts`; a router of its own,
// so its counters start at zero.
const BASE = env.BETTER_AUTH_URL
const owner = Schema.decodeUnknownSync(UserId)("00000000-0000-4000-8000-0000000005a2")
const persistence = d1Persistence(env.DB)
const signedIn = Sessions.layerFixed(Option.some(owner))
const provider = makeRouter(
  env,
  WorkerConfig.fromEnvSync(env),
  {
    app: makeApp(env, { auth: { _tag: "Fixed", sessions: signedIn }, persistence }),
    mcp: makeMcp(env, { persistence, auth: McpAuth.layerLive }),
    authorize: makeAuthorize(env, {
      betterAuth: BetterAuth.layerMemory.pipe(Layer.provide(EmailSender.layerConsole)),
      sessions: signedIn,
      oauth: statelessOAuth(persistence),
    }),
  },
  persistence,
)

const send = async (path: string, ip: string, init: RequestInit = {}): Promise<Response> => {
  const ctx = createExecutionContext()
  const headers = new Headers(init.headers)
  headers.set("cf-connecting-ip", ip)
  const response = await provider.fetch(
    new Request(new URL(path, BASE), { ...init, headers }),
    env,
    ctx,
  )
  await waitOnExecutionContext(ctx)
  return response
}

/** `count` requests in a row (sequential, so the counter order is the request order). */
const statusesOf = (count: number, request: () => Promise<Response>) =>
  Arr.range(1, count).reduce<Promise<ReadonlyArray<number>>>(
    async (previous) => [...(await previous), (await request()).status],
    Promise.resolve([]),
  )

const registerInit = (): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    redirect_uris: ["http://localhost:33418/callback"],
    token_endpoint_auth_method: "none",
    client_name: "rate limit test",
  }),
})

const tokenInit = (): RequestInit => ({
  method: "POST",
  body: new URLSearchParams({ grant_type: "authorization_code" }),
})

describe("OAuth endpoint rate limits per cf-connecting-ip (workerd)", () => {
  it("POST /oauth/register: the 11th from one IP is 429 OAuth JSON, another IP still registers", async () => {
    const ip = "203.0.113.21"
    const { max } = OAUTH_RATE_LIMITS.register
    const statuses = await statusesOf(max, () => send("/oauth/register", ip, registerInit()))
    expect(statuses).toEqual(Arr.replicate(201, max))
    const over = await send("/oauth/register", ip, registerInit())
    expect(over.status).toBe(429)
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0)
    expect(over.headers.get("cache-control")).toBe("no-store")
    expect(await over.json()).toEqual({
      error: "temporarily_unavailable",
      error_description: "Too many requests",
    })
    expect((await send("/oauth/register", "203.0.113.22", registerInit())).status).toBe(201)
  })

  it("POST /oauth/token: the 61st from one IP is 429, another IP gets the endpoint's own answer", async () => {
    const ip = "203.0.113.31"
    const { max } = OAUTH_RATE_LIMITS.token
    const statuses = await statusesOf(max, () => send("/oauth/token", ip, tokenInit()))
    expect(statuses).toEqual(Arr.replicate(400, max)) // no code: invalid_request, not a limit
    const over = await send("/oauth/token", ip, tokenInit())
    expect(over.status).toBe(429)
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0)
    expect(await over.json()).toMatchObject({ error: "temporarily_unavailable" })
    expect((await send("/oauth/token", "203.0.113.32", tokenInit())).status).toBe(400)
  })

  it("GET /authorize: the 31st from one IP is a 429 HTML page, another IP gets the endpoint's own answer", async () => {
    const ip = "203.0.113.41"
    const { max } = OAUTH_RATE_LIMITS.authorize
    const statuses = await statusesOf(max, () => send("/authorize", ip))
    expect(statuses).toEqual(Arr.replicate(400, max)) // no parameters: invalid request page
    const over = await send("/authorize", ip)
    expect(over.status).toBe(429)
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0)
    expect(over.headers.get("content-type")).toBe("text/html; charset=utf-8")
    expect(over.headers.get("content-security-policy")).not.toBeNull()
    expect(await over.text()).toContain("Too many requests")
    expect((await send("/authorize", "203.0.113.42")).status).toBe(400)
  })
})
