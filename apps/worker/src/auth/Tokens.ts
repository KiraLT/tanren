import { type AppTokenPair, McpScope, TokenRejected, UserId } from "@tanren/shared"
import { Context, DateTime, Effect, Layer, Option, Predicate, Redacted, Schema } from "effect"
import { Base64Url, Hex } from "effect/encoding"
import { decodeProtectedHeader, errors, jwtVerify, SignJWT } from "jose"
import type { WorkerConfigShape } from "../Config"
import { WorkerConfig } from "../Config"
import type { McpPrincipal } from "../mcp/McpAuth"

// Every Tanren JWT (docs/design/auth-v2.md §2–§3, ADR-0022): compact JWS, HS256, `typ: "JWT"`,
// signed with an HKDF-SHA256 sub-key of BETTER_AUTH_SECRET. Never log a token; log
// `jti.slice(0, 8)` at most (§7).

export const APP_ACCESS_TTL_SECONDS = 900
export const APP_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60
export const MCP_ACCESS_TTL_SECONDS = 900
export const MCP_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60
export const CODE_TTL_SECONDS = 60
export const CONSENT_TTL_SECONDS = 600
/** Tolerance for `exp` / `iat` against the Effect clock. */
export const CLOCK_SKEW_SECONDS = 60

export const APP_AUDIENCE = "tanren:app"
export const APP_REFRESH_AUDIENCE = "tanren:app:refresh"
export const MCP_REFRESH_AUDIENCE = "tanren:mcp:refresh"
export const CODE_AUDIENCE = "tanren:oauth:code"
export const CONSENT_AUDIENCE = "tanren:oauth:consent"
export const CLIENT_AUDIENCE = "tanren:oauth:client"

/** HKDF `info` per sub-key (design §2). Changing one invalidates every token it signs. */
export const KEY_INFO = {
  app: "tanren/jwt/app/v1",
  mcp: "tanren/jwt/mcp/v1",
  client: "tanren/oauth/client/v1",
  consent: "tanren/oauth/consent/v1",
} as const

/** A 32-byte HS256 key and its `kid` (first 8 hex chars of SHA-256(key)). */
export interface SubKey {
  readonly bytes: Uint8Array<ArrayBuffer>
  readonly kid: string
}

const encoder = new TextEncoder()

/** HKDF-SHA256(secret, salt = empty, info) → 32 bytes. WebCrypto only; no I/O. */
export const deriveSubKey = (
  secret: Redacted.Redacted<string>,
  info: string,
): Effect.Effect<SubKey> =>
  Effect.gen(function* () {
    const base = yield* Effect.promise(() =>
      crypto.subtle.importKey("raw", encoder.encode(Redacted.value(secret)), "HKDF", false, [
        "deriveBits",
      ]),
    )
    const bits = yield* Effect.promise(() =>
      crypto.subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: encoder.encode(info) },
        base,
        256,
      ),
    )
    const bytes = new Uint8Array(bits)
    const digest = yield* Effect.promise(() => crypto.subtle.digest("SHA-256", bytes))
    return { bytes, kid: Hex.encode(new Uint8Array(digest)).slice(0, 8) }
  })

/** `n` random bytes, base64url (`jti`: 16, consent `nonce`: 32). */
const randomToken = (n: number): Effect.Effect<string> =>
  Effect.sync(() => Base64Url.encode(crypto.getRandomValues(new Uint8Array(n))))

const invalid = new TokenRejected({ reason: "invalid" })
const expired = new TokenRejected({ reason: "expired" })

// Claim schemas: worker-internal. Extra claims (iss, aud, iat) are ignored by the decode; the
// standard ones are checked before it.
const Gen = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const Jti = Schema.NonEmptyString
const Exp = Schema.Number

const AppClaims = Schema.Struct({ sub: UserId, gen: Gen, jti: Jti, exp: Exp })
const McpClaims = Schema.Struct({
  sub: UserId,
  scope: Schema.String,
  client_id: Schema.NonEmptyString,
  gen: Gen,
  jti: Jti,
  exp: Exp,
})
const CodeClaims = Schema.Struct({
  sub: UserId,
  scope: Schema.String,
  client_id: Schema.NonEmptyString,
  redirect_uri: Schema.NonEmptyString,
  code_challenge: Schema.NonEmptyString,
  gen: Gen,
  jti: Jti,
  exp: Exp,
})

/** The parsed authorization request a consent handle carries (the library's `AuthRequest` fields). */
export const ConsentRequest = Schema.Struct({
  responseType: Schema.String,
  clientId: Schema.String,
  redirectUri: Schema.String,
  scope: Schema.Array(Schema.String),
  state: Schema.String,
  codeChallenge: Schema.optionalKey(Schema.String),
  codeChallengeMethod: Schema.optionalKey(Schema.String),
  resource: Schema.optionalKey(Schema.String),
})
export type ConsentRequest = typeof ConsentRequest.Type

const ConsentClaims = Schema.Struct({
  sub: UserId,
  request: ConsentRequest,
  nonce: Schema.NonEmptyString,
  jti: Jti,
  exp: Exp,
})
const ClientClaims = Schema.Struct({
  redirect_uris: Schema.Array(Schema.String),
  client_name: Schema.String,
  token_endpoint_auth_method: Schema.Literal("none"),
})

/** `scope` claim (space-separated) ⇄ scopes; an unknown scope makes the token invalid. */
const joinScopes = (scopes: ReadonlyArray<McpScope>): string => scopes.join(" ")
const splitScopes = (scope: string): Effect.Effect<ReadonlyArray<McpScope>, TokenRejected> =>
  Schema.decodeUnknownEffect(Schema.Array(McpScope))(
    scope.split(" ").filter((part) => part.length > 0),
  ).pipe(Effect.mapError(() => invalid))

const decodeClaims =
  <A, I>(schema: Schema.Codec<A, I>) =>
  (payload: unknown): Effect.Effect<A, TokenRejected> =>
    Schema.decodeUnknownEffect(schema)(payload).pipe(Effect.mapError(() => invalid))

export interface AppIdentity {
  readonly userId: UserId
  readonly gen: number
  /** Log `jti.slice(0, 8)` only. */
  readonly jti: string
  /** `exp` claim, epoch seconds (a burned refresh token's ledger retention). */
  readonly exp: number
}

export interface McpGrant {
  readonly userId: UserId
  readonly scopes: ReadonlyArray<McpScope>
  readonly clientId: string
  readonly gen: number
}

export type McpIdentity = McpPrincipal & {
  readonly gen: number
  readonly clientId: string
  readonly jti: string
  /** `exp` claim, epoch seconds. */
  readonly exp: number
}

/** The fields of an OAuth token response (RFC 6749 §5.1) the token endpoint renders. */
export interface McpTokenPair {
  readonly accessToken: string
  readonly refreshToken: string
  /** Seconds until the access token expires. */
  readonly expiresIn: number
  /** Space-separated granted scopes. */
  readonly scope: string
}

export interface CodeGrant extends McpGrant {
  readonly redirectUri: string
  /** PKCE S256 challenge (base64url SHA-256 of the verifier). */
  readonly codeChallenge: string
}

export interface VerifiedCode extends CodeGrant {
  readonly jti: string
  /** `exp` claim, epoch seconds (the `oauth_code_use` row's expiry). */
  readonly exp: number
}

export interface ConsentHandle {
  readonly handle: string
  /** Goes into the `__Host-tanren-consent` cookie (double submit, design §7). */
  readonly nonce: string
}

export interface VerifiedConsent {
  readonly userId: UserId
  readonly request: ConsentRequest
  readonly nonce: string
}

export interface DcrClient {
  readonly redirectUris: ReadonlyArray<string>
  readonly clientName: string
}

export interface VerifiedDcrClient extends DcrClient {
  readonly tokenEndpointAuthMethod: "none"
}

export interface TokensShape {
  readonly issueAppPair: (userId: UserId, gen: number) => Effect.Effect<AppTokenPair>
  readonly verifyApp: (token: string) => Effect.Effect<AppIdentity, TokenRejected>
  readonly verifyAppRefresh: (token: string) => Effect.Effect<AppIdentity, TokenRejected>
  readonly issueMcpPair: (grant: McpGrant) => Effect.Effect<McpTokenPair>
  readonly verifyMcp: (token: string) => Effect.Effect<McpIdentity, TokenRejected>
  readonly verifyMcpRefresh: (token: string) => Effect.Effect<McpIdentity, TokenRejected>
  readonly issueCode: (grant: CodeGrant) => Effect.Effect<string>
  readonly verifyCode: (token: string) => Effect.Effect<VerifiedCode, TokenRejected>
  readonly issueConsent: (consent: {
    readonly userId: UserId
    readonly request: ConsentRequest
  }) => Effect.Effect<ConsentHandle>
  readonly verifyConsent: (handle: string) => Effect.Effect<VerifiedConsent, TokenRejected>
  readonly issueClientId: (client: DcrClient) => Effect.Effect<string>
  readonly verifyClientId: (clientId: string) => Effect.Effect<VerifiedDcrClient, TokenRejected>
}

type TokensConfig = Pick<WorkerConfigShape, "betterAuthUrl" | "betterAuthSecret" | "mcpResourceUrl">

interface Keys {
  readonly app: SubKey
  readonly mcp: SubKey
  readonly client: SubKey
  readonly consent: SubKey
}

/**
 * The service for one config. Sub-keys are derived on first use and memoised, so building the
 * layer at isolate start does no work (`apps/worker/CLAUDE.md`, hardening H3).
 */
export const makeTokens = (config: TokensConfig): Effect.Effect<TokensShape> =>
  Effect.gen(function* () {
    const issuer = config.betterAuthUrl
    const keys = yield* Effect.cached(
      Effect.all({
        app: deriveSubKey(config.betterAuthSecret, KEY_INFO.app),
        mcp: deriveSubKey(config.betterAuthSecret, KEY_INFO.mcp),
        client: deriveSubKey(config.betterAuthSecret, KEY_INFO.client),
        consent: deriveSubKey(config.betterAuthSecret, KEY_INFO.consent),
      }),
    )

    /** Signs `claims` + `iss`, `aud`, `iat`, `jti` and (with a TTL) `exp`. */
    const sign = (
      pick: (keys: Keys) => SubKey,
      audience: string,
      ttlSeconds: Option.Option<number>,
      claims: Readonly<Record<string, unknown>>,
    ) =>
      Effect.gen(function* () {
        const key = pick(yield* keys)
        const now = yield* DateTime.now
        const millis = DateTime.toEpochMillis(now)
        const iat = Math.floor(millis / 1000)
        /** `iat` as a DateTime (whole second), so expiries derived from it equal `exp` × 1000. */
        const issuedAt = DateTime.subtract(now, { milliseconds: millis % 1000 })
        const jti = yield* randomToken(16)
        const base = new SignJWT({ ...claims, jti })
          .setProtectedHeader({ alg: "HS256", typ: "JWT", kid: key.kid })
          .setIssuer(issuer)
          .setAudience(audience)
          .setIssuedAt(iat)
        const exp = Option.map(ttlSeconds, (ttl) => iat + ttl)
        const builder = Option.match(exp, {
          onNone: () => base,
          onSome: (at) => base.setExpirationTime(at),
        })
        const token = yield* Effect.promise(() => builder.sign(key.bytes))
        return { token, issuedAt }
      })

    /**
     * Design §3 order: signature + `kid` → `exp`/`iat` (60 s skew) → `aud` exact → `iss` exact.
     * The claim decode is the caller's last step. Expired → `expired`, everything else `invalid`.
     */
    const verify = (pick: (keys: Keys) => SubKey, audience: string, token: string) =>
      Effect.gen(function* () {
        const key = pick(yield* keys)
        const header = yield* Effect.try({
          try: () => decodeProtectedHeader(token),
          catch: () => invalid,
        })
        if (header.alg !== "HS256" || header.kid !== key.kid) {
          return yield* invalid
        }
        const now = yield* DateTime.now
        const { payload } = yield* Effect.tryPromise({
          try: () =>
            jwtVerify(token, key.bytes, {
              algorithms: ["HS256"],
              typ: "JWT",
              clockTolerance: CLOCK_SKEW_SECONDS,
              currentDate: DateTime.toDate(now),
            }),
          catch: (error) =>
            Predicate.hasProperty(error, "code") && error.code === errors.JWTExpired.code
              ? expired
              : invalid,
        })
        const seconds = Math.floor(DateTime.toEpochMillis(now) / 1000)
        if (typeof payload.iat !== "number" || payload.iat > seconds + CLOCK_SKEW_SECONDS) {
          return yield* invalid
        }
        if (payload.aud !== audience || payload.iss !== issuer) {
          return yield* invalid
        }
        return payload
      })

    const toAppIdentity = (claims: typeof AppClaims.Type): AppIdentity => ({
      userId: claims.sub,
      gen: claims.gen,
      jti: claims.jti,
      exp: claims.exp,
    })

    const verifyAppAt = (audience: string) => (token: string) =>
      verify((k) => k.app, audience, token).pipe(
        Effect.flatMap(decodeClaims(AppClaims)),
        Effect.map(toAppIdentity),
      )

    const verifyMcpAt = (audience: string) => (token: string) =>
      Effect.gen(function* () {
        const payload = yield* verify((k) => k.mcp, audience, token)
        const claims = yield* decodeClaims(McpClaims)(payload)
        const scopes = yield* splitScopes(claims.scope)
        const identity: McpIdentity = {
          userId: claims.sub,
          scopes,
          clientId: claims.client_id,
          gen: claims.gen,
          jti: claims.jti,
          exp: claims.exp,
        }
        return identity
      })

    const mcpClaims = (grant: McpGrant) => ({
      sub: grant.userId,
      scope: joinScopes(grant.scopes),
      client_id: grant.clientId,
      gen: grant.gen,
    })

    const service: TokensShape = {
      issueAppPair: Effect.fn("Tokens.issueAppPair")(function* (userId: UserId, gen: number) {
        const claims = { sub: userId, gen }
        const access = yield* sign(
          (k) => k.app,
          APP_AUDIENCE,
          Option.some(APP_ACCESS_TTL_SECONDS),
          claims,
        )
        const refresh = yield* sign(
          (k) => k.app,
          APP_REFRESH_AUDIENCE,
          Option.some(APP_REFRESH_TTL_SECONDS),
          claims,
        )
        return {
          accessToken: access.token,
          refreshToken: refresh.token,
          // Same clock read as the access token's `iat`, so this is exactly its `exp` × 1000.
          expiresAt: DateTime.add(access.issuedAt, { seconds: APP_ACCESS_TTL_SECONDS }),
        }
      }),
      verifyApp: verifyAppAt(APP_AUDIENCE),
      verifyAppRefresh: verifyAppAt(APP_REFRESH_AUDIENCE),

      issueMcpPair: Effect.fn("Tokens.issueMcpPair")(function* (grant: McpGrant) {
        const claims = mcpClaims(grant)
        const access = yield* sign(
          (k) => k.mcp,
          config.mcpResourceUrl,
          Option.some(MCP_ACCESS_TTL_SECONDS),
          claims,
        )
        const refresh = yield* sign(
          (k) => k.mcp,
          MCP_REFRESH_AUDIENCE,
          Option.some(MCP_REFRESH_TTL_SECONDS),
          claims,
        )
        return {
          accessToken: access.token,
          refreshToken: refresh.token,
          expiresIn: MCP_ACCESS_TTL_SECONDS,
          scope: claims.scope,
        }
      }),
      verifyMcp: verifyMcpAt(config.mcpResourceUrl),
      verifyMcpRefresh: verifyMcpAt(MCP_REFRESH_AUDIENCE),

      issueCode: Effect.fn("Tokens.issueCode")(function* (grant: CodeGrant) {
        const signed = yield* sign((k) => k.mcp, CODE_AUDIENCE, Option.some(CODE_TTL_SECONDS), {
          ...mcpClaims(grant),
          redirect_uri: grant.redirectUri,
          code_challenge: grant.codeChallenge,
        })
        return signed.token
      }),
      verifyCode: (token) =>
        Effect.gen(function* () {
          const payload = yield* verify((k) => k.mcp, CODE_AUDIENCE, token)
          const claims = yield* decodeClaims(CodeClaims)(payload)
          const scopes = yield* splitScopes(claims.scope)
          const code: VerifiedCode = {
            userId: claims.sub,
            scopes,
            clientId: claims.client_id,
            gen: claims.gen,
            redirectUri: claims.redirect_uri,
            codeChallenge: claims.code_challenge,
            jti: claims.jti,
            exp: claims.exp,
          }
          return code
        }),

      issueConsent: Effect.fn("Tokens.issueConsent")(function* (consent: {
        readonly userId: UserId
        readonly request: ConsentRequest
      }) {
        const nonce = yield* randomToken(32)
        const signed = yield* sign(
          (k) => k.consent,
          CONSENT_AUDIENCE,
          Option.some(CONSENT_TTL_SECONDS),
          { sub: consent.userId, request: consent.request, nonce },
        )
        return { handle: signed.token, nonce }
      }),
      verifyConsent: (handle) =>
        verify((k) => k.consent, CONSENT_AUDIENCE, handle).pipe(
          Effect.flatMap(decodeClaims(ConsentClaims)),
          Effect.map((claims) => ({
            userId: claims.sub,
            request: claims.request,
            nonce: claims.nonce,
          })),
        ),

      issueClientId: Effect.fn("Tokens.issueClientId")(function* (client: DcrClient) {
        const signed = yield* sign((k) => k.client, CLIENT_AUDIENCE, Option.none(), {
          redirect_uris: client.redirectUris,
          client_name: client.clientName,
          token_endpoint_auth_method: "none",
        })
        return signed.token
      }),
      verifyClientId: (clientId) =>
        verify((k) => k.client, CLIENT_AUDIENCE, clientId).pipe(
          Effect.flatMap(decodeClaims(ClientClaims)),
          Effect.map((claims) => ({
            redirectUris: claims.redirect_uris,
            clientName: claims.client_name,
            tokenEndpointAuthMethod: claims.token_endpoint_auth_method,
          })),
        ),
    }
    return service
  })

export class Tokens extends Context.Service<Tokens, TokensShape>()("@tanren/worker/Tokens") {
  /** Tokens for the Worker's `WorkerConfig` (issuer, secret, MCP resource). */
  static readonly layer: Layer.Layer<Tokens, never, WorkerConfig> = Layer.effect(
    this,
    Effect.flatMap(WorkerConfig, makeTokens),
  )
  /** For tests that vary the issuer or secret without a full env. */
  static readonly layerWith = (config: TokensConfig): Layer.Layer<Tokens> =>
    Layer.effect(this, makeTokens(config))
}
