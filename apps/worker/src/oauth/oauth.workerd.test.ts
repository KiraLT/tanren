import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { beforeAll, describe, expect, it } from "@effect/vitest"
import { MCP_TOOLS, UserId } from "@tanren/shared"
import { Effect, Layer, Option, Schema } from "effect"
import { d1Persistence, makeApp } from "../app"
import { BetterAuth } from "../auth/BetterAuth"
import { EmailSender } from "../auth/EmailSender"
import { Sessions } from "../auth/Sessions"
import { WorkerConfig } from "../Config"
import { McpAuth } from "../mcp/McpAuth"
import { MCP_LANDING_CSP } from "../mcp/McpLanding"
import { makeMcp } from "../mcp/McpRoute"
import { ExerciseRepo, ProfileRepo } from "../repos"
import { exercise } from "../sync/fixtures"
import { makeAuthorize } from "./authorize"
import { makeProvider } from "./provider"

// The whole OAuth flow inside workerd, through the real `OAuthProvider` (KV = miniflare's
// `OAUTH_KV`): register → authorize (fixed Better Auth session) → consent → token (PKCE S256) →
// `/mcp` with the bearer, on a migrated D1. Same wiring as `index.ts` except the session.
const BASE = env.BETTER_AUTH_URL
const REDIRECT = "http://localhost:33418/callback"
const owner = Schema.decodeUnknownSync(UserId)("00000000-0000-4000-8000-0000000005a1")
const SQUAT = 0x5b1
const squatId = `00000000-0000-4000-8000-${SQUAT.toString(16).padStart(12, "0")}`

const persistence = d1Persistence(env.DB)
const signedIn = Sessions.layerFixed(Option.some(owner))
const provider = makeProvider(WorkerConfig.fromEnvSync(env), {
  app: makeApp(env, { auth: { _tag: "Fixed", sessions: signedIn }, persistence }),
  mcp: makeMcp(env, { persistence, auth: McpAuth.layerLive }),
  authorize: makeAuthorize(env, {
    betterAuth: BetterAuth.layerMemory.pipe(Layer.provide(EmailSender.layerConsole)),
    sessions: signedIn,
  }),
})

const send = async (path: string, init?: RequestInit): Promise<Response> => {
  const ctx = createExecutionContext()
  const response = await provider.fetch(new Request(new URL(path, BASE), init), env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

const json = async (response: Response): Promise<Record<string, unknown>> =>
  Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(await response.json())

const str = (value: unknown): string => Schema.decodeUnknownSync(Schema.String)(value)

const base64url = (bytes: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

/** `name=value` pairs of every `Set-Cookie`, as a `Cookie` header. */
const cookiesOf = (response: Response): string =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0] ?? "")
    .join("; ")

const register = async (): Promise<string> => {
  const response = await send("/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      client_name: "workerd test",
    }),
  })
  expect(response.status).toBe(201)
  return str((await json(response)).client_id)
}

/**
 * The full browser part plus the token exchange; `ticked` = the scopes approved on the page,
 * `requested` = the `scope` parameter (None = omitted). `onConsent` sees the consent page.
 */
const grant = async (
  ticked: ReadonlyArray<string>,
  requested: Option.Option<string> = Option.some("tanren:read tanren:write"),
  onConsent: (page: string) => void = () => undefined,
): Promise<string> => {
  const clientId = await register()
  const verifier = "workerd-test-verifier-0123456789-abcdefghijklmnopqrstuvwxyz"
  const challenge = base64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  )
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    ...Option.match(requested, { onNone: () => ({}), onSome: (scope) => ({ scope }) }),
    state: "st-1",
    code_challenge: challenge,
    code_challenge_method: "S256",
  })
  const consent = await send(`/authorize?${query.toString()}`)
  expect(consent.status).toBe(200)
  const page = await consent.text()
  onConsent(page)
  const handle = /name="handle" value="([^"]+)"/.exec(page)?.[1] ?? ""
  expect(handle).not.toBe("")
  const approved = await send("/authorize", {
    method: "POST",
    headers: { cookie: cookiesOf(consent), origin: BASE },
    body: new URLSearchParams([
      ["handle", handle],
      ["decision", "approve"],
      ...ticked.map((scope): [string, string] => ["scope", scope]),
    ]),
  })
  expect(approved.status).toBe(302)
  const location = new URL(approved.headers.get("location") ?? "")
  expect(location.searchParams.get("state")).toBe("st-1")
  const token = await send("/oauth/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: location.searchParams.get("code") ?? "",
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
    }),
  })
  expect(token.status).toBe(200)
  return str((await json(token)).access_token)
}

const mcp = (bearer: Option.Option<string>, method: string, params: unknown) =>
  send("/mcp", {
    method: "POST",
    headers: {
      host: new URL(BASE).host,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      ...Option.match(bearer, {
        onNone: () => ({}),
        onSome: (token) => ({ authorization: `Bearer ${token}` }),
      }),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })

/** JSON-RPC `result` of a JSON or SSE (`data: {...}`) response. */
const rpcResult = async (response: Response): Promise<Record<string, unknown>> => {
  const text = await response.text()
  const body = (response.headers.get("content-type") ?? "").includes("text/event-stream")
    ? (text
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice("data: ".length) ?? "null")
    : text
  return Schema.decodeUnknownSync(
    Schema.Struct({ result: Schema.Record(Schema.String, Schema.Unknown) }),
  )(JSON.parse(body)).result
}

const toolNames = async (bearer: Option.Option<string>): Promise<ReadonlyArray<string>> => {
  const result = await rpcResult(await mcp(bearer, "tools/list", {}))
  return Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ name: Schema.String })))(
    result.tools,
  ).map((tool) => tool.name)
}

describe("OAuth flow through the provider (workerd)", () => {
  beforeAll(() =>
    Effect.runPromise(
      Effect.gen(function* () {
        yield* (yield* ExerciseRepo).put(owner, [
          exercise(SQUAT, { userId: owner, name: "Back Squat" }),
        ])
      }).pipe(Effect.provide(persistence)),
    ),
  )

  it("advertises the authorization server on BETTER_AUTH_URL", async () => {
    const metadata = await json(await send("/.well-known/oauth-authorization-server"))
    expect(metadata).toMatchObject({
      issuer: BASE,
      authorization_endpoint: `${BASE}/authorize`,
      token_endpoint: `${BASE}/oauth/token`,
      registration_endpoint: `${BASE}/oauth/register`,
      scopes_supported: ["tanren:read", "tanren:write"],
      code_challenge_methods_supported: expect.arrayContaining(["S256"]),
    })
  })

  it("answers /mcp without a token with 401 and the resource-metadata challenge", async () => {
    const response = await mcp(Option.none(), "tools/list", {})
    expect(response.status).toBe(401)
    expect(response.headers.get("WWW-Authenticate")).toBe(
      `Bearer realm="OAuth", resource_metadata="${new URL(env.MCP_RESOURCE_URL).origin}/.well-known/oauth-protected-resource/mcp", scope="tanren:read tanren:write"`,
    )
  })

  it("protected-resource metadata advertises both scopes", async () => {
    const metadata = await json(await send("/.well-known/oauth-protected-resource/mcp"))
    expect(metadata).toMatchObject({
      resource: env.MCP_RESOURCE_URL,
      authorization_servers: [BASE],
      scopes_supported: ["tanren:read", "tanren:write"],
    })
  })

  it("a request without scope shows both boxes and, approving both, gets all eight tools", async () => {
    const token = await grant(["tanren:read", "tanren:write"], Option.none(), (page) => {
      expect(page).toContain('value="tanren:read" checked')
      expect(page).toContain('value="tanren:write" checked')
    })
    expect(await toolNames(Option.some(token))).toEqual([...MCP_TOOLS])
  })

  it("a read + write grant lists all nine tools", async () => {
    const token = await grant(["tanren:read", "tanren:write"])
    expect(await toolNames(Option.some(token))).toEqual([...MCP_TOOLS])
  })

  it("a read-only grant lists the six read tools and cannot call a write tool", async () => {
    const token = await grant(["tanren:read"])
    expect(await toolNames(Option.some(token))).toEqual(MCP_TOOLS.slice(0, 6))
    const response = await mcp(Option.some(token), "tools/call", {
      name: "update_profile",
      arguments: { timezone: "Europe/Vilnius" },
    })
    // The SDK answers an unregistered tool with an error (JSON-RPC error or an isError result).
    expect(await response.text()).toMatch(/"isError":true|"error":\{/)
    const profile = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* ProfileRepo).get(owner)
      }).pipe(Effect.provide(persistence)),
    )
    expect(profile).toEqual(Option.none())
  })

  it("a cross-origin POST /authorize/login is refused by Better Auth's origin check", async () => {
    const login = (origin: string) =>
      send("/authorize/login", {
        method: "POST",
        headers: { origin },
        body: new URLSearchParams([
          ["email", "lukas@example.com"],
          ["next", "/authorize?client_id=x"],
        ]),
      })
    const [foreign, same] = await Promise.all([login("https://evil.example"), login(BASE)])
    expect([foreign.status, same.status]).toEqual([400, 200])
  })

  it("the local dev token still resolves (resolveExternalToken)", async () => {
    const devToken = env.DEV_MCP_TOKEN ?? ""
    expect(await toolNames(Option.some(devToken))).toEqual([...MCP_TOOLS])
  })

  it("write_plan_week writes plan, week, sessions and sets to D1 for the grant's user", async () => {
    const token = await grant(["tanren:read", "tanren:write"])
    const plannedSet = (order: number) => ({
      exerciseId: squatId,
      order,
      targetWeightKg: 100,
      targetReps: { _tag: "Exact", reps: 5 },
      targetRpe: null,
      restSeconds: 120,
      note: null,
    })
    const result = await rpcResult(
      await mcp(Option.some(token), "tools/call", {
        name: "write_plan_week",
        arguments: {
          planId: null,
          newPlan: { name: "Block 1", goal: "Strength" },
          weekStart: "2026-10-19",
          intent: "Volume",
          sessions: [
            {
              order: 0,
              name: "Lower A",
              scheduledDate: null,
              notes: null,
              sets: [plannedSet(0), plannedSet(1)],
            },
          ],
        },
      }),
    )
    expect(result.isError).toBeUndefined()
    expect(result.structuredContent).toMatchObject({
      replaced: false,
      sessions: [{ order: 0, name: "Lower A", sets: 2 }],
    })
    const plan = await rpcResult(
      await mcp(Option.some(token), "tools/call", { name: "get_current_plan", arguments: {} }),
    )
    expect(JSON.stringify(plan)).toContain("Lower A")
  })
})

describe("MCP host root and root-form protected-resource metadata (workerd)", () => {
  const otherHost = (path: string) => {
    const ctx = createExecutionContext()
    return provider.fetch(new Request(new URL(path, "http://api.elsewhere.test")), env, ctx)
  }

  it("GET / answers the static landing page naming the connector URL", async () => {
    const response = await send("/")
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8")
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600")
    expect(response.headers.get("set-cookie")).toBeNull()
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(response.headers.get("content-security-policy")).toBe(MCP_LANDING_CSP)
    const page = await response.text()
    expect(page).toContain(env.MCP_RESOURCE_URL)
    expect(page).toContain('href="https://tanren.me"')
    expect(page).not.toContain("<script")
  })

  it("HEAD / answers 200 with the same headers and no body", async () => {
    const response = await send("/", { method: "HEAD" })
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(response.headers.get("content-security-policy")).toBe(MCP_LANDING_CSP)
    expect(await response.text()).toBe("")
  })

  it("does not reflect the query into the page", async () => {
    const page = await (await send("/?x=%3Cscript%3Ealert(1)%3C/script%3E")).text()
    expect(page).not.toContain("<script")
    expect(page).not.toContain("alert(1)")
  })

  it("the root-form metadata is byte-identical to the /mcp form", async () => {
    const root = await send("/.well-known/oauth-protected-resource")
    const pathForm = await send("/.well-known/oauth-protected-resource/mcp")
    expect(root.status).toBe(200)
    expect(root.headers.get("content-type")).toBe(pathForm.headers.get("content-type"))
    const [rootText, pathText] = [await root.text(), await pathForm.text()]
    expect(rootText).toBe(pathText)
    expect(JSON.parse(rootText)).toMatchObject({ resource: env.MCP_RESOURCE_URL })
  })

  it("an unknown path still answers 404", async () => {
    expect((await send("/nonsense")).status).toBe(404)
  })

  it("POST / falls through to the REST app's 404", async () => {
    expect((await send("/", { method: "POST" })).status).toBe(404)
  })

  it("another host gets neither the landing page nor the metadata alias", async () => {
    expect((await otherHost("/")).status).toBe(404)
    expect((await otherHost("/.well-known/oauth-protected-resource")).status).toBe(404)
  })
})
