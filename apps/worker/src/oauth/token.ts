import { OAuthCodeUseRepo, UserTokens } from "@tanren/db"
import { MCP_SCOPES, type McpScope } from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Option } from "effect"
import { Base64Url } from "effect/encoding"
import { type McpTokenPair, Tokens } from "../auth/Tokens"

// `POST /oauth/token` (docs/design/auth-v2.md §5, §7): stateless code exchange and refresh.
// Order for a code: signature/exp/aud → client_id and redirect_uri → PKCE → generation → burn LAST,
// so a failed check never consumes the code. Never log a code or token: `jti.slice(0, 8)` only.

type TokenDeps = Tokens | UserTokens | OAuthCodeUseRepo

/** An RFC 6749 §5.2 error. */
interface TokenError {
  readonly error:
    | "invalid_request"
    | "invalid_client"
    | "invalid_grant"
    | "unsupported_grant_type"
    | "invalid_scope"
    | "server_error"
  readonly description: string
}

const NO_STORE = {
  "content-type": "application/json",
  "cache-control": "no-store",
  pragma: "no-cache",
} as const

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: NO_STORE })

const errorResponse = ({ error, description }: TokenError): Response =>
  json(error === "invalid_client" ? 401 : error === "server_error" ? 500 : 400, {
    error,
    error_description: description,
  })

const fail = (error: TokenError["error"], description: string) =>
  Effect.fail<TokenError>({ error, description })

const successResponse = (pair: McpTokenPair): Response =>
  json(200, {
    access_token: pair.accessToken,
    token_type: "Bearer",
    expires_in: pair.expiresIn,
    refresh_token: pair.refreshToken,
    scope: pair.scope,
  })

const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/

/** RFC 7636 S256: base64url(SHA-256(verifier)), no padding. */
export const s256 = (verifier: string): Effect.Effect<string> =>
  Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).pipe(
    Effect.map((digest) => Base64Url.encode(new Uint8Array(digest))),
  )

const required = (form: URLSearchParams, name: string) =>
  Option.match(Option.fromNullishOr(form.get(name)), {
    onNone: () => fail("invalid_request", `${name} is required`),
    onSome: Effect.succeed,
  })

const currentGen = (userId: Parameters<UserTokens["Service"]["tokenGens"]>[0]) =>
  Effect.gen(function* () {
    const users = yield* UserTokens
    return yield* users.tokenGens(userId).pipe(
      Effect.map((gens) => gens.mcp),
      Effect.catchTags({
        UserNotFound: () => fail("invalid_grant", "unknown user"),
        PersistenceError: () => fail("server_error", "storage unavailable"),
      }),
    )
  })

const exchangeCode = (form: URLSearchParams) =>
  Effect.gen(function* () {
    const tokens = yield* Tokens
    const codeUse = yield* OAuthCodeUseRepo
    const raw = yield* required(form, "code")
    const verifier = yield* required(form, "code_verifier")
    const clientId = yield* required(form, "client_id")
    const redirectUri = yield* required(form, "redirect_uri")
    const code = yield* tokens
      .verifyCode(raw)
      .pipe(Effect.catch(() => fail("invalid_grant", "invalid or expired code")))
    if (code.clientId !== clientId || code.redirectUri !== redirectUri) {
      return yield* fail("invalid_grant", "code was issued to another client or redirect_uri")
    }
    if (!VERIFIER.test(verifier) || (yield* s256(verifier)) !== code.codeChallenge) {
      return yield* fail("invalid_grant", "PKCE verification failed")
    }
    if ((yield* currentGen(code.userId)) !== code.gen) {
      return yield* fail("invalid_grant", "grant revoked")
    }
    const expiresAt = yield* Option.match(DateTime.make(code.exp * 1000), {
      onNone: () => fail("invalid_grant", "invalid code"),
      onSome: (at) => Effect.succeed(DateTime.toUtc(at)),
    })
    // Burn last: only a fully valid code reaches the ledger.
    const first = yield* codeUse
      .burn(code.jti, expiresAt)
      .pipe(Effect.catchTag("PersistenceError", () => fail("server_error", "storage unavailable")))
    if (!first) {
      yield* Effect.logWarning("oauth code replayed", code.jti.slice(0, 8))
      return yield* fail("invalid_grant", "code already used")
    }
    yield* codeUse.purge(yield* DateTime.now).pipe(Effect.ignore)
    yield* Effect.logInfo("oauth code redeemed", code.jti.slice(0, 8))
    return yield* tokens.issueMcpPair({
      userId: code.userId,
      scopes: code.scopes,
      clientId: code.clientId,
      gen: code.gen,
    })
  })

const isMcpScope = (scope: string): scope is McpScope => Arr.contains(MCP_SCOPES, scope)

const refresh = (form: URLSearchParams) =>
  Effect.gen(function* () {
    const tokens = yield* Tokens
    const raw = yield* required(form, "refresh_token")
    const identity = yield* tokens
      .verifyMcpRefresh(raw)
      .pipe(Effect.catch(() => fail("invalid_grant", "invalid or expired refresh token")))
    const clientId = Option.fromNullishOr(form.get("client_id"))
    if (Option.isSome(clientId) && clientId.value !== identity.clientId) {
      return yield* fail("invalid_grant", "refresh token was issued to another client")
    }
    if ((yield* currentGen(identity.userId)) !== identity.gen) {
      return yield* fail("invalid_grant", "grant revoked")
    }
    // An optional `scope` may only narrow the grant (RFC 6749 §6).
    const requested = Option.map(Option.fromNullishOr(form.get("scope")), (scope) =>
      scope.split(" ").filter((part) => part.length > 0),
    )
    const scopes = yield* Option.match(requested, {
      onNone: () => Effect.succeed(identity.scopes),
      onSome: (asked) =>
        Arr.every(asked, (s) => isMcpScope(s) && identity.scopes.includes(s))
          ? Effect.succeed(Arr.filter(identity.scopes, (s) => asked.includes(s)))
          : fail("invalid_scope", "scope exceeds the grant"),
    })
    yield* Effect.logInfo("oauth refresh", identity.jti.slice(0, 8))
    return yield* tokens.issueMcpPair({
      userId: identity.userId,
      scopes,
      clientId: identity.clientId,
      gen: identity.gen,
    })
  })

/** `POST /oauth/token` with an `application/x-www-form-urlencoded` body. Never fails, never caches. */
export const tokenEndpoint = (request: Request): Effect.Effect<Response, never, TokenDeps> =>
  Effect.gen(function* () {
    const body = yield* Effect.tryPromise(() => request.text()).pipe(
      Effect.catch(() => fail("invalid_request", "unreadable body")),
    )
    const form = new URLSearchParams(body)
    const grantType = form.get("grant_type")
    const pair = yield* grantType === "authorization_code"
      ? exchangeCode(form)
      : grantType === "refresh_token"
        ? refresh(form)
        : fail("unsupported_grant_type", "unsupported grant_type")
    return successResponse(pair)
  }).pipe(
    Effect.catch((error) => Effect.succeed(errorResponse(error))),
    Effect.catchCause((cause) =>
      Effect.logError("token endpoint failed", cause).pipe(
        Effect.as(errorResponse({ error: "server_error", description: "internal error" })),
      ),
    ),
  )
