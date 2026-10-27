import { describe, expect, it } from "@effect/vitest"
import { UserTokens } from "@tanren/db"
import { UserId } from "@tanren/shared"
import { Effect, Layer, Option, Redacted } from "effect"
import { TestClock } from "effect/testing"
import { Sessions } from "../auth/Sessions"
import { CONSENT_TTL_SECONDS, Tokens } from "../auth/Tokens"
import { WorkerConfig } from "../Config"
import { envVars } from "../testing/fixtures"
import { ClientResolver } from "./clients"
import { CONSENT_COOKIE, readConsentCookie, redirectMatches, sameSecret } from "./consent"
import { OAuthApi } from "./OAuthApi"
import { s256 } from "./token"

const CONFIG = {
  betterAuthUrl: envVars.BETTER_AUTH_URL,
  betterAuthSecret: Redacted.make(envVars.BETTER_AUTH_SECRET), // test only
  mcpResourceUrl: envVars.MCP_RESOURCE_URL,
}
const OWNER = UserId.make("00000000-0000-4000-8000-000000000001")
const OTHER = UserId.make("00000000-0000-4000-8000-000000000002")
const NOW = Date.UTC(2026, 9, 27, 12)
const DOC_URL = "https://claude.ai/oauth/claude-code-client-metadata"
const REDIRECT = "http://localhost:4000/callback"
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

const documentResponse = () =>
  new Response(
    JSON.stringify({ client_id: DOC_URL, client_name: "Claude Code", redirect_uris: [REDIRECT] }),
    { status: 200, headers: { "content-type": "application/json" } },
  )

/** The stateless layer for one browser request, signed in as `user`. */
const statelessFor = (request: Request, user: Option.Option<UserId>) =>
  OAuthApi.layerStateless({ request }).pipe(
    Layer.provide(
      Layer.mergeAll(
        Sessions.layerFixed(user),
        Layer.succeed(
          UserTokens,
          UserTokens.of({
            tokenGens: () => Effect.succeed({ app: 0, mcp: 3 }),
            bumpAppTokenGen: () => Effect.void,
            bumpMcpTokenGen: () => Effect.void,
            burnRefresh: () => Effect.die("unused"),
            purgeBurnedRefresh: () => Effect.void,
          }),
        ),
        ClientResolver.layerWith({
          fetch: () => Promise.resolve(documentResponse()),
          cache: Effect.succeed(Option.none()),
        }).pipe(Layer.provide(Tokens.layerWith(CONFIG))),
        WorkerConfig.layerFromEnv(envVars).pipe(Layer.orDie),
        Tokens.layerWith(CONFIG),
      ),
    ),
  )

const authorizeUrl = (params: Readonly<Record<string, string>> = {}) =>
  `http://localhost:8787/authorize?${new URLSearchParams({
    response_type: "code",
    client_id: DOC_URL,
    redirect_uri: REDIRECT,
    state: "st-1",
    scope: "tanren:read tanren:write",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    ...params,
  }).toString()}`

const get = (url: string) => new Request(url)
const post = (cookie: Option.Option<string>) =>
  new Request("http://localhost:8787/authorize", {
    method: "POST",
    headers: Option.match(cookie, {
      onNone: () => ({}),
      onSome: (nonce) => ({ cookie: `other=1; ${CONSENT_COOKIE}=${nonce}` }),
    }),
  })

const withApi = <A, E>(
  request: Request,
  user: Option.Option<UserId>,
  body: (api: OAuthApi["Service"]) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    return yield* body(yield* OAuthApi)
  }).pipe(Effect.provide(statelessFor(request, user)))

/** GET /authorize as OWNER → the parsed request, the handle and the cookie nonce. */
const begin = (params: Readonly<Record<string, string>> = {}) => {
  const request = get(authorizeUrl(params))
  return withApi(request, Option.some(OWNER), (api) =>
    Effect.gen(function* () {
      const authRequest = yield* api.parseAuthRequest(request)
      const transaction = yield* api.beginConsent(authRequest)
      const setCookie = transaction.headers.get("set-cookie") ?? ""
      const nonce = Option.getOrThrow(
        readConsentCookie(new Headers({ cookie: setCookie.split(";")[0] ?? "" })),
      )
      return { authRequest, handle: transaction.handle, nonce, setCookie }
    }),
  )
}

describe("OAuthApi.layerStateless: parse + describe", () => {
  it.effect("parses a valid request and describes a verified CIMD client", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const request = get(authorizeUrl())
      const consent = yield* withApi(request, Option.some(OWNER), (api) =>
        Effect.flatMap(api.parseAuthRequest(request), api.describeConsent),
      )
      expect(consent).toMatchObject({
        clientId: DOC_URL,
        clientName: "Claude Code",
        clientDomain: "claude.ai",
        redirectUri: REDIRECT,
        redirectHost: "localhost:4000",
        redirectIsLoopback: true,
        scope: ["tanren:read", "tanren:write"],
      })
    }),
  )

  it.effect.each<{
    readonly name: string
    readonly params: Readonly<Record<string, string>>
    readonly code: string
    readonly redirects: boolean
  }>([
    {
      name: "an unregistered redirect_uri",
      params: { redirect_uri: "http://localhost:9/x" },
      code: "invalid_request",
      redirects: false,
    },
    {
      name: "an unknown client",
      params: { client_id: "nobody" },
      code: "invalid_client",
      redirects: false,
    },
    {
      name: "no PKCE",
      params: { code_challenge_method: "plain" },
      code: "invalid_request",
      redirects: true,
    },
    {
      name: "a token response_type",
      params: { response_type: "token" },
      code: "unsupported_response_type",
      redirects: true,
    },
    {
      name: "a foreign resource",
      params: { resource: "https://evil.com/mcp" },
      code: "invalid_target",
      redirects: true,
    },
  ])("refuses $name", ({ params, code, redirects }) =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const request = get(authorizeUrl(params))
      const failure = yield* withApi(request, Option.some(OWNER), (api) =>
        Effect.flip(api.parseAuthRequest(request)),
      )
      expect(Option.getOrNull(failure.code)).toBe(code)
      expect(Option.isSome(failure.redirectTo)).toBe(redirects)
      if (Option.isSome(failure.redirectTo)) {
        expect(failure.redirectTo.value.startsWith(`${REDIRECT}?`)).toBe(true)
        expect(new URL(failure.redirectTo.value).searchParams.get("state")).toBe("st-1")
      }
    }),
  )
})

describe("OAuthApi.layerStateless: consent binding", () => {
  it.effect("begin sets the __Host- binding cookie and anti-framing headers", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const { setCookie } = yield* begin()
      expect(setCookie).toMatch(
        /^__Host-tanren-consent=[A-Za-z0-9_-]+; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=600$/,
      )
    }),
  )

  it.effect("approve → complete gives a 302 target with code + state; the code verifies", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const { handle, nonce } = yield* begin()
      const decision = post(Option.some(nonce))
      const redirectTo = yield* withApi(decision, Option.some(OWNER), (api) =>
        Effect.gen(function* () {
          const approved = yield* api.approveConsent(decision, handle)
          expect(approved.headers.get("set-cookie")).toContain("Max-Age=0")
          const done = yield* api.completeAuthorization({
            request: approved.request,
            userId: OWNER,
            scope: ["tanren:read"],
            props: { userId: OWNER, scopes: ["tanren:read"] },
          })
          return done.redirectTo
        }),
      )
      const url = new URL(redirectTo)
      expect(`${url.origin}${url.pathname}`).toBe(REDIRECT)
      expect(url.searchParams.get("state")).toBe("st-1")
      const code = yield* Effect.gen(function* () {
        return yield* (yield* Tokens).verifyCode(url.searchParams.get("code") ?? "")
      }).pipe(Effect.provide(Tokens.layerWith(CONFIG)))
      expect(code).toMatchObject({
        userId: OWNER,
        clientId: DOC_URL,
        redirectUri: REDIRECT,
        codeChallenge: yield* s256(VERIFIER),
        gen: 3,
        scopes: ["tanren:read"],
      })
    }),
  )

  it.effect("a nonce mismatch is rejected", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const { handle, nonce } = yield* begin()
      const forged = post(Option.some(`${nonce.slice(0, -1)}${nonce.endsWith("A") ? "B" : "A"}`))
      const failure = yield* withApi(forged, Option.some(OWNER), (api) =>
        Effect.flip(api.approveConsent(forged, handle)),
      )
      expect(failure.message).toContain("browser")
    }),
  )

  it.effect("a missing binding cookie is rejected (approve and deny)", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const { handle } = yield* begin()
      const bare = post(Option.none())
      yield* withApi(bare, Option.some(OWNER), (api) =>
        Effect.gen(function* () {
          yield* Effect.flip(api.approveConsent(bare, handle))
          yield* Effect.flip(api.denyConsent(bare, handle))
        }),
      )
    }),
  )

  it.effect("a handle approved by another signed-in user is rejected", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const { handle, nonce } = yield* begin()
      const decision = post(Option.some(nonce))
      const failure = yield* withApi(decision, Option.some(OTHER), (api) =>
        Effect.flip(api.approveConsent(decision, handle)),
      )
      expect(Option.getOrNull(failure.code)).toBe("access_denied")
    }),
  )

  it.effect("approving while signed out is rejected", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const { handle, nonce } = yield* begin()
      const decision = post(Option.some(nonce))
      yield* withApi(decision, Option.none(), (api) =>
        Effect.flip(api.approveConsent(decision, handle)),
      )
    }),
  )

  it.effect("an expired handle is rejected", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const { handle, nonce } = yield* begin()
      yield* TestClock.adjust(`${CONSENT_TTL_SECONDS + 61} seconds`)
      const decision = post(Option.some(nonce))
      const failure = yield* withApi(decision, Option.some(OWNER), (api) =>
        Effect.flip(api.approveConsent(decision, handle)),
      )
      expect(failure.message).toContain("expired")
    }),
  )

  it.effect("deny → access_denied redirect with state and the cookie cleared", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const { handle, nonce } = yield* begin()
      const decision = post(Option.some(nonce))
      const denied = yield* withApi(decision, Option.some(OWNER), (api) =>
        api.denyConsent(decision, handle),
      )
      const url = new URL(denied.redirectTo)
      expect(url.searchParams.get("error")).toBe("access_denied")
      expect(url.searchParams.get("state")).toBe("st-1")
      expect(denied.headers.get("location")).toBe(denied.redirectTo)
      expect(denied.headers.get("set-cookie")).toContain("Max-Age=0")
    }),
  )

  it.effect("begin while signed out fails (the page shows login first)", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const request = get(authorizeUrl())
      yield* withApi(request, Option.none(), (api) =>
        Effect.flip(Effect.flatMap(api.parseAuthRequest(request), api.beginConsent)),
      )
    }),
  )
})

describe("consent helpers", () => {
  it("sameSecret compares equal strings only", () => {
    expect(sameSecret("abc", "abc")).toBe(true)
    expect(sameSecret("abc", "abd")).toBe(false)
    expect(sameSecret("abc", "abcd")).toBe(false)
  })
})

describe("redirectMatches", () => {
  it("accepts an exact match and a loopback registration on another port only", () => {
    expect(redirectMatches("https://claude.ai/cb", "https://claude.ai/cb")).toBe(true)
    expect(redirectMatches("http://localhost/callback", "http://localhost:53123/callback")).toBe(
      true,
    )
    expect(redirectMatches("http://127.0.0.1/callback", "http://127.0.0.1:9/callback")).toBe(true)
    expect(redirectMatches("http://localhost/callback", "http://localhost:1/other")).toBe(false)
    expect(redirectMatches("http://localhost/callback", "http://127.0.0.1:1/callback")).toBe(false)
    expect(redirectMatches("https://claude.ai/cb", "https://claude.ai:8443/cb")).toBe(false)
    expect(redirectMatches("https://claude.ai/cb", "")).toBe(false)
  })
})
