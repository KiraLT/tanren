import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { DateTime, Effect, Redacted } from "effect"
import { Base64Url, Hex } from "effect/encoding"
import { TestClock } from "effect/testing"
import { decodeJwt, SignJWT, UnsecuredJWT } from "jose"
import {
  APP_ACCESS_TTL_SECONDS,
  APP_AUDIENCE,
  APP_REFRESH_TTL_SECONDS,
  CODE_TTL_SECONDS,
  CONSENT_TTL_SECONDS,
  type ConsentRequest,
  deriveSubKey,
  KEY_INFO,
  MCP_ACCESS_TTL_SECONDS,
  type SubKey,
  Tokens,
  type TokensShape,
} from "./Tokens"

const SECRET = Redacted.make("test-secret-0000000000000000000000000000") // test only
const ISSUER = "http://localhost:8787"
const RESOURCE = "http://localhost:8787/mcp"
const CONFIG = { betterAuthUrl: ISSUER, betterAuthSecret: SECRET, mcpResourceUrl: RESOURCE }
const USER = UserId.make("00000000-0000-4000-8000-000000000001")
const NOW = Date.UTC(2026, 9, 27, 12)

const withTokens = <A, E>(
  body: (tokens: TokensShape) => Effect.Effect<A, E>,
  config: typeof CONFIG = CONFIG,
) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(NOW)
    return yield* body(yield* Tokens)
  }).pipe(Effect.provide(Tokens.layerWith(config)))

const reasonOf = <A>(effect: Effect.Effect<A, { readonly reason: string }>) =>
  Effect.map(Effect.flip(effect), (error) => error.reason)

/** Signs an arbitrary JWT with `key` (test forgeries); `kid` and claims as given. */
const forge = (
  key: SubKey,
  kid: string,
  claims: Readonly<Record<string, unknown>>,
  aud: string,
  iss: string = ISSUER,
) =>
  Effect.promise(() =>
    new SignJWT({ ...claims })
      .setProtectedHeader({ alg: "HS256", typ: "JWT", kid })
      .setIssuer(iss)
      .setAudience(aud)
      .setIssuedAt(NOW / 1000)
      .setExpirationTime(NOW / 1000 + 900)
      .sign(key.bytes),
  )

const appClaims = { sub: USER, gen: 0, jti: "forged-jti-000000" }

const consentRequest: ConsentRequest = {
  responseType: "code",
  clientId: "https://claude.ai/oauth/claude-code-client-metadata",
  redirectUri: "http://localhost:33418/callback",
  scope: ["tanren:read", "tanren:write"],
  state: "state-123",
  codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  codeChallengeMethod: "S256",
}

describe("Tokens round trips", () => {
  it.effect("app pair: access and refresh verify to the user and gen", () =>
    withTokens((tokens) =>
      Effect.gen(function* () {
        yield* TestClock.adjust("999 millis") // mid-second: `exp` is floor(iat) + 900
        const pair = yield* tokens.issueAppPair(USER, 3)
        const { exp } = decodeJwt(pair.accessToken)
        expect(DateTime.toEpochMillis(pair.expiresAt)).toBe((exp ?? 0) * 1000)
        expect(DateTime.toEpochMillis(pair.expiresAt)).toBe(NOW + APP_ACCESS_TTL_SECONDS * 1000)
        expect(yield* tokens.verifyApp(pair.accessToken)).toMatchObject({ userId: USER, gen: 3 })
        expect(yield* tokens.verifyAppRefresh(pair.refreshToken)).toMatchObject({
          userId: USER,
          gen: 3,
        })
        expect(pair.accessToken).not.toBe(pair.refreshToken)
      }),
    ),
  )

  it.effect("MCP pair: access and refresh carry scopes, client and gen", () =>
    withTokens((tokens) =>
      Effect.gen(function* () {
        const grant = { userId: USER, scopes: ["tanren:read"] as const, clientId: "c1", gen: 2 }
        const pair = yield* tokens.issueMcpPair(grant)
        expect(pair).toMatchObject({ expiresIn: MCP_ACCESS_TTL_SECONDS, scope: "tanren:read" })
        const expected = { userId: USER, scopes: ["tanren:read"], clientId: "c1", gen: 2 }
        expect(yield* tokens.verifyMcp(pair.accessToken)).toMatchObject(expected)
        expect(yield* tokens.verifyMcpRefresh(pair.refreshToken)).toMatchObject(expected)
      }),
    ),
  )

  it.effect("auth code: every binding field survives", () =>
    withTokens((tokens) =>
      Effect.gen(function* () {
        const grant = {
          userId: USER,
          scopes: ["tanren:read", "tanren:write"] as const,
          clientId: "https://claude.ai/oauth/claude-code-client-metadata",
          gen: 0,
          redirectUri: "http://localhost:33418/callback",
          codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        }
        const code = yield* tokens.issueCode(grant)
        const verified = yield* tokens.verifyCode(code)
        expect(verified).toMatchObject(grant)
        expect(verified.exp).toBe(NOW / 1000 + CODE_TTL_SECONDS)
        expect(verified.jti.length).toBeGreaterThanOrEqual(16)
      }),
    ),
  )

  it.effect("consent handle: request, user and nonce survive", () =>
    withTokens((tokens) =>
      Effect.gen(function* () {
        const { handle, nonce } = yield* tokens.issueConsent({
          userId: USER,
          request: consentRequest,
        })
        expect(Base64Url.decode(nonce)).toMatchObject({ success: { length: 32 } })
        const verified = yield* tokens.verifyConsent(handle)
        expect(verified).toEqual({ userId: USER, request: consentRequest, nonce })
        yield* TestClock.adjust(`${CONSENT_TTL_SECONDS + 61} seconds`)
        expect(yield* reasonOf(tokens.verifyConsent(handle))).toBe("expired")
      }),
    ),
  )

  it.effect("DCR client id: never expires", () =>
    withTokens((tokens) =>
      Effect.gen(function* () {
        const client = { redirectUris: ["https://example.com/cb"], clientName: "Example" }
        const clientId = yield* tokens.issueClientId(client)
        yield* TestClock.adjust("3650 days")
        expect(yield* tokens.verifyClientId(clientId)).toEqual({
          ...client,
          tokenEndpointAuthMethod: "none",
        })
      }),
    ),
  )
})

describe("Tokens rejections", () => {
  it.effect("wrong aud is invalid (refresh as access, access as refresh, code as MCP)", () =>
    withTokens((tokens) =>
      Effect.gen(function* () {
        const pair = yield* tokens.issueAppPair(USER, 0)
        expect(yield* reasonOf(tokens.verifyApp(pair.refreshToken))).toBe("invalid")
        expect(yield* reasonOf(tokens.verifyAppRefresh(pair.accessToken))).toBe("invalid")
        const code = yield* tokens.issueCode({
          userId: USER,
          scopes: ["tanren:read"],
          clientId: "c1",
          gen: 0,
          redirectUri: "https://example.com/cb",
          codeChallenge: "x",
        })
        expect(yield* reasonOf(tokens.verifyMcp(code))).toBe("invalid")
      }),
    ),
  )

  it.effect("exp + 59 s is still valid (skew); exp + 61 s is expired", () =>
    withTokens((tokens) =>
      Effect.gen(function* () {
        const pair = yield* tokens.issueAppPair(USER, 0)
        yield* TestClock.adjust(`${APP_ACCESS_TTL_SECONDS + 59} seconds`)
        expect(yield* tokens.verifyApp(pair.accessToken)).toMatchObject({ userId: USER })
        yield* TestClock.adjust("2 seconds")
        expect(yield* reasonOf(tokens.verifyApp(pair.accessToken))).toBe("expired")
        // `exp` is checked before `aud`: an expired access token offered as refresh says expired.
        expect(yield* reasonOf(tokens.verifyAppRefresh(pair.accessToken))).toBe("expired")
        yield* TestClock.adjust(`${APP_REFRESH_TTL_SECONDS} seconds`)
        expect(yield* reasonOf(tokens.verifyAppRefresh(pair.refreshToken))).toBe("expired")
      }),
    ),
  )

  it.effect("tampered payload is invalid", () =>
    withTokens((tokens) =>
      Effect.gen(function* () {
        const pair = yield* tokens.issueAppPair(USER, 0)
        const [header, payload, signature] = pair.accessToken.split(".")
        const claims = Base64Url.decodeString(payload ?? "")
        expect(claims._tag).toBe("Success")
        const raised = Base64Url.encode(
          (claims._tag === "Success" ? claims.success : "").replace('"gen":0', '"gen":9'),
        )
        expect(raised).not.toBe(payload)
        const tampered = `${header}.${raised}.${signature}`
        expect(yield* reasonOf(tokens.verifyApp(tampered))).toBe("invalid")
      }),
    ),
  )

  it.effect("the app key never verifies an MCP token, and vice versa", () =>
    withTokens((tokens) =>
      Effect.gen(function* () {
        const app = yield* tokens.issueAppPair(USER, 0)
        const mcp = yield* tokens.issueMcpPair({
          userId: USER,
          scopes: ["tanren:read"],
          clientId: "c1",
          gen: 0,
        })
        expect(yield* reasonOf(tokens.verifyMcp(app.accessToken))).toBe("invalid")
        expect(yield* reasonOf(tokens.verifyApp(mcp.accessToken))).toBe("invalid")
        // A forgery with the MCP kid, aud and claims, but signed with the app key.
        const appKey = yield* deriveSubKey(SECRET, KEY_INFO.app)
        const mcpKey = yield* deriveSubKey(SECRET, KEY_INFO.mcp)
        expect(appKey.kid).not.toBe(mcpKey.kid)
        const forged = yield* forge(
          appKey,
          mcpKey.kid,
          { ...appClaims, scope: "tanren:read", client_id: "c1" },
          RESOURCE,
        )
        expect(yield* reasonOf(tokens.verifyMcp(forged))).toBe("invalid")
        // The same forgery with the right key verifies, so the key is what rejected it.
        const genuine = yield* forge(
          mcpKey,
          mcpKey.kid,
          { ...appClaims, scope: "tanren:read", client_id: "c1" },
          RESOURCE,
        )
        expect(yield* tokens.verifyMcp(genuine)).toMatchObject({ userId: USER, clientId: "c1" })
      }),
    ),
  )

  it.effect("kid is SHA-256(subkey)[0..8]; a mismatched kid is invalid", () =>
    withTokens((tokens) =>
      Effect.gen(function* () {
        const appKey = yield* deriveSubKey(SECRET, KEY_INFO.app)
        const digest = yield* Effect.promise(() => crypto.subtle.digest("SHA-256", appKey.bytes))
        expect(appKey.kid).toBe(Hex.encode(new Uint8Array(digest)).slice(0, 8))
        expect(appKey.bytes.length).toBe(32)
        const good = yield* forge(appKey, appKey.kid, appClaims, APP_AUDIENCE)
        expect(yield* tokens.verifyApp(good)).toMatchObject({ userId: USER })
        const wrongKid = yield* forge(appKey, "deadbeef", appClaims, APP_AUDIENCE)
        expect(yield* reasonOf(tokens.verifyApp(wrongKid))).toBe("invalid")
      }),
    ),
  )

  it.effect("wrong iss is invalid (same secret, other issuer)", () =>
    Effect.gen(function* () {
      const foreign = yield* withTokens((tokens) => tokens.issueAppPair(USER, 0), {
        ...CONFIG,
        betterAuthUrl: "https://evil.example",
      })
      expect(yield* withTokens((tokens) => reasonOf(tokens.verifyApp(foreign.accessToken)))).toBe(
        "invalid",
      )
    }),
  )

  it.effect("another secret's token is invalid", () =>
    Effect.gen(function* () {
      const foreign = yield* withTokens((tokens) => tokens.issueAppPair(USER, 0), {
        ...CONFIG,
        betterAuthSecret: Redacted.make("another-secret-000000000000000000000000"),
      })
      expect(yield* withTokens((tokens) => reasonOf(tokens.verifyApp(foreign.accessToken)))).toBe(
        "invalid",
      )
    }),
  )

  it.effect("iat more than 60 s in the future is invalid", () =>
    withTokens((tokens) =>
      Effect.gen(function* () {
        const appKey = yield* deriveSubKey(SECRET, KEY_INFO.app)
        const future = yield* Effect.promise(() =>
          new SignJWT({ ...appClaims })
            .setProtectedHeader({ alg: "HS256", typ: "JWT", kid: appKey.kid })
            .setIssuer(ISSUER)
            .setAudience(APP_AUDIENCE)
            .setIssuedAt(NOW / 1000 + 120)
            .setExpirationTime(NOW / 1000 + 900)
            .sign(appKey.bytes),
        )
        expect(yield* reasonOf(tokens.verifyApp(future))).toBe("invalid")
      }),
    ),
  )

  it.effect("malformed strings, alg none and bad claims are invalid", () =>
    withTokens((tokens) =>
      Effect.gen(function* () {
        const malformed = yield* Effect.forEach(
          ["", "not-a-jwt", "a.b.c", "a.b", "...."],
          (token) => reasonOf(tokens.verifyApp(token)),
        )
        expect(malformed).toEqual(["invalid", "invalid", "invalid", "invalid", "invalid"])
        const appKey = yield* deriveSubKey(SECRET, KEY_INFO.app)
        const none = new UnsecuredJWT({ ...appClaims })
          .setIssuer(ISSUER)
          .setAudience(APP_AUDIENCE)
          .setIssuedAt(NOW / 1000)
          .setExpirationTime(NOW / 1000 + 900)
          .encode()
        expect(yield* reasonOf(tokens.verifyApp(none))).toBe("invalid")
        const badSub = yield* forge(appKey, appKey.kid, { ...appClaims, sub: "x" }, APP_AUDIENCE)
        expect(yield* reasonOf(tokens.verifyApp(badSub))).toBe("invalid")
        const mcpKey = yield* deriveSubKey(SECRET, KEY_INFO.mcp)
        const badScope = yield* forge(
          mcpKey,
          mcpKey.kid,
          { ...appClaims, scope: "tanren:admin", client_id: "c1" },
          RESOURCE,
        )
        expect(yield* reasonOf(tokens.verifyMcp(badScope))).toBe("invalid")
      }),
    ),
  )
})
