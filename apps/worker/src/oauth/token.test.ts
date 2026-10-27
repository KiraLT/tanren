import { describe, expect, it } from "@effect/vitest"
import { OAuthCodeUseRepo, UserTokens } from "@tanren/db"
import { UserId } from "@tanren/shared"
import { Effect, HashSet, Layer, Redacted, Ref } from "effect"
import { TestClock } from "effect/testing"
import { Tokens } from "../auth/Tokens"
import { s256, tokenEndpoint } from "./token"

const CONFIG = {
  betterAuthUrl: "http://localhost:8787",
  betterAuthSecret: Redacted.make("test-secret-0000000000000000000000000000"), // test only
  mcpResourceUrl: "http://localhost:8787/mcp",
}
const USER = UserId.make("00000000-0000-4000-8000-000000000001")
const NOW = Date.UTC(2026, 9, 27, 12)
const CLIENT = "https://claude.ai/oauth/claude-code-client-metadata"
const REDIRECT = "http://localhost:4000/callback"
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

/** Fakes: the user's mcp generation (a Ref) and a code ledger that counts `burn` calls. */
const harness = Effect.gen(function* () {
  const mcpGen = yield* Ref.make(0)
  const burned = yield* Ref.make(HashSet.empty<string>())
  const burnCalls = yield* Ref.make(0)
  const users = Layer.succeed(
    UserTokens,
    UserTokens.of({
      tokenGens: () => Effect.map(Ref.get(mcpGen), (mcp) => ({ app: 0, mcp })),
      bumpAppTokenGen: () => Effect.void,
      bumpMcpTokenGen: () => Ref.update(mcpGen, (n) => n + 1),
    }),
  )
  const codeUse = Layer.succeed(
    OAuthCodeUseRepo,
    OAuthCodeUseRepo.of({
      burn: (jti) =>
        Ref.update(burnCalls, (n) => n + 1).pipe(
          Effect.andThen(
            Ref.modify(burned, (all) => [!HashSet.has(all, jti), HashSet.add(all, jti)]),
          ),
        ),
      purge: () => Effect.void,
    }),
  )
  return {
    mcpGen,
    burnCalls,
    layer: Layer.mergeAll(Tokens.layerWith(CONFIG), users, codeUse),
  }
})

const form = (fields: Readonly<Record<string, string>>) =>
  new Request("http://localhost:8787/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  })

const bodyOf = (response: Response) =>
  Effect.promise(() => response.json() as Promise<Record<string, unknown>>) // our own JSON body

/** Runs `body` with a fresh harness, a code for (CLIENT, REDIRECT, S256(VERIFIER)) and the clock at NOW. */
const withCode = <A, E>(
  body: (input: {
    readonly code: string
    readonly burnCalls: Ref.Ref<number>
    readonly mcpGen: Ref.Ref<number>
    readonly exchange: (
      overrides?: Readonly<Record<string, string>>,
    ) => Effect.Effect<Response, never, never>
  }) => Effect.Effect<A, E, Tokens | UserTokens | OAuthCodeUseRepo>,
) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(NOW)
    const h = yield* harness
    return yield* Effect.gen(function* () {
      const tokens = yield* Tokens
      const code = yield* tokens.issueCode({
        userId: USER,
        scopes: ["tanren:read", "tanren:write"],
        clientId: CLIENT,
        gen: 0,
        redirectUri: REDIRECT,
        codeChallenge: yield* s256(VERIFIER),
      })
      const context = yield* Effect.context<Tokens | UserTokens | OAuthCodeUseRepo>()
      const exchange = (overrides: Readonly<Record<string, string>> = {}) =>
        tokenEndpoint(
          form({
            grant_type: "authorization_code",
            code,
            code_verifier: VERIFIER,
            client_id: CLIENT,
            redirect_uri: REDIRECT,
            ...overrides,
          }),
        ).pipe(Effect.provide(context))
      return yield* body({ code, burnCalls: h.burnCalls, mcpGen: h.mcpGen, exchange })
    }).pipe(Effect.provide(h.layer))
  })

const expectNoStore = (response: Response) => {
  expect(response.headers.get("cache-control")).toBe("no-store")
  expect(response.headers.get("pragma")).toBe("no-cache")
}

describe("POST /oauth/token authorization_code", () => {
  it.effect("a valid code exchanges for a Bearer pair, burned once", () =>
    withCode(({ exchange, burnCalls }) =>
      Effect.gen(function* () {
        const response = yield* exchange()
        expect(response.status).toBe(200)
        expectNoStore(response)
        const body = yield* bodyOf(response)
        expect(body).toMatchObject({
          token_type: "Bearer",
          expires_in: 900,
          scope: "tanren:read tanren:write",
        })
        expect(typeof body.access_token).toBe("string")
        expect(typeof body.refresh_token).toBe("string")
        expect(yield* Ref.get(burnCalls)).toBe(1)
      }),
    ),
  )

  it.effect("a replayed code → invalid_grant", () =>
    withCode(({ exchange }) =>
      Effect.gen(function* () {
        expect((yield* exchange()).status).toBe(200)
        const replay = yield* exchange()
        expect(replay.status).toBe(400)
        expectNoStore(replay)
        expect(yield* bodyOf(replay)).toMatchObject({ error: "invalid_grant" })
      }),
    ),
  )

  it.effect.each<{ readonly name: string; readonly overrides: Readonly<Record<string, string>> }>([
    { name: "a wrong verifier", overrides: { code_verifier: `${VERIFIER.slice(0, -1)}A` } },
    { name: "a wrong redirect_uri", overrides: { redirect_uri: "http://localhost:4001/callback" } },
    {
      name: "a wrong client_id",
      overrides: { client_id: "https://chatgpt.com/oauth/client.json" },
    },
    { name: "a forged code", overrides: { code: "not.a.jwt" } },
  ])("$name → invalid_grant and the code is NOT burned", ({ overrides }) =>
    withCode(({ exchange, burnCalls }) =>
      Effect.gen(function* () {
        const response = yield* exchange(overrides)
        expect(response.status).toBe(400)
        expectNoStore(response)
        expect(yield* bodyOf(response)).toMatchObject({ error: "invalid_grant" })
        expect(yield* Ref.get(burnCalls)).toBe(0)
        // Burn-last: the honest exchange still works afterwards.
        expect((yield* exchange()).status).toBe(200)
      }),
    ),
  )

  it.effect("a stale mcp generation → invalid_grant, not burned", () =>
    withCode(({ exchange, burnCalls, mcpGen }) =>
      Effect.gen(function* () {
        yield* Ref.set(mcpGen, 1)
        const response = yield* exchange()
        expect(yield* bodyOf(response)).toMatchObject({ error: "invalid_grant" })
        expect(yield* Ref.get(burnCalls)).toBe(0)
      }),
    ),
  )

  it.effect("an expired code → invalid_grant", () =>
    withCode(({ exchange }) =>
      Effect.gen(function* () {
        yield* TestClock.adjust("200 seconds")
        expect(yield* bodyOf(yield* exchange())).toMatchObject({ error: "invalid_grant" })
      }),
    ),
  )

  it.effect("a missing parameter → invalid_request", () =>
    withCode(({ code }) =>
      Effect.gen(function* () {
        const response = yield* tokenEndpoint(form({ grant_type: "authorization_code", code }))
        expect(response.status).toBe(400)
        expect(yield* bodyOf(response)).toMatchObject({ error: "invalid_request" })
      }),
    ),
  )
})

describe("POST /oauth/token refresh_token", () => {
  const refreshWith = (refreshToken: string, extra: Readonly<Record<string, string>> = {}) =>
    tokenEndpoint(form({ grant_type: "refresh_token", refresh_token: refreshToken, ...extra }))

  it.effect("a refresh token yields a new pair", () =>
    withCode(({ exchange }) =>
      Effect.gen(function* () {
        const first = yield* bodyOf(yield* exchange())
        const response = yield* refreshWith(String(first.refresh_token))
        expect(response.status).toBe(200)
        expectNoStore(response)
        expect(yield* bodyOf(response)).toMatchObject({ token_type: "Bearer" })
      }),
    ),
  )

  it.effect("refresh after an mcp generation bump → invalid_grant", () =>
    withCode(({ exchange, mcpGen }) =>
      Effect.gen(function* () {
        const first = yield* bodyOf(yield* exchange())
        yield* Ref.update(mcpGen, (n) => n + 1)
        const response = yield* refreshWith(String(first.refresh_token))
        expect(response.status).toBe(400)
        expectNoStore(response)
        expect(yield* bodyOf(response)).toMatchObject({ error: "invalid_grant" })
      }),
    ),
  )

  it.effect("refresh may narrow the scope but never widen it", () =>
    withCode(({ exchange }) =>
      Effect.gen(function* () {
        const first = yield* bodyOf(yield* exchange())
        const narrowed = yield* bodyOf(
          yield* refreshWith(String(first.refresh_token), { scope: "tanren:read" }),
        )
        expect(narrowed).toMatchObject({ scope: "tanren:read" })
        const widened = yield* bodyOf(
          yield* refreshWith(String(narrowed.refresh_token), { scope: "tanren:write" }),
        )
        expect(widened).toMatchObject({ error: "invalid_scope" })
      }),
    ),
  )

  it.effect("an access token is not a refresh token", () =>
    withCode(({ exchange }) =>
      Effect.gen(function* () {
        const first = yield* bodyOf(yield* exchange())
        const response = yield* refreshWith(String(first.access_token))
        expect(yield* bodyOf(response)).toMatchObject({ error: "invalid_grant" })
      }),
    ),
  )

  it.effect("an unknown grant_type → unsupported_grant_type, no-store", () =>
    withCode(() =>
      Effect.gen(function* () {
        const response = yield* tokenEndpoint(form({ grant_type: "password" }))
        expect(response.status).toBe(400)
        expectNoStore(response)
        expect(yield* bodyOf(response)).toMatchObject({ error: "unsupported_grant_type" })
      }),
    ),
  )
})

describe("s256", () => {
  it.effect("matches the RFC 7636 appendix B vector", () =>
    Effect.gen(function* () {
      expect(yield* s256(VERIFIER)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    }),
  )
})
