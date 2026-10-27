import { type PersistenceError, type UserNotFound, UserTokens } from "@tanren/db"
import {
  AppTokenPair,
  InternalError,
  RefreshRequest,
  SessionStoreUnavailable,
  TokenRejected,
  type UserId,
} from "@tanren/shared"
import { Effect, Layer, Option, Schema } from "effect"
import { HttpRouter, type HttpServerRequest, HttpServerResponse } from "effect/http"
import { Sessions } from "./Sessions"
import { bearerJwt } from "./SessionsLive"
import { Tokens } from "./Tokens"

const noStore = { "cache-control": "no-store" }
const invalid = new TokenRejected({ reason: "invalid" })
const revoked = new TokenRejected({ reason: "revoked" })

/** 401 for every rejected credential; the body names only the reason (auth-v2.md §7). */
const rejected = (error: TokenRejected) =>
  HttpServerResponse.schemaJson(TokenRejected)(error, { status: 401, headers: noStore })

/** 503: D1 (the generation read or bump) is down. */
const unavailable = (cause: unknown) =>
  Effect.logError("token endpoint store failed", cause).pipe(
    Effect.andThen(
      HttpServerResponse.schemaJson(SessionStoreUnavailable)(
        new SessionStoreUnavailable({ message: "session store unavailable" }),
        { status: 503, headers: noStore },
      ),
    ),
  )

/** 500: a bug. Never logs a token (only the defect). */
const internal = (defect: unknown) =>
  Effect.logError("token endpoint defect", defect).pipe(
    Effect.andThen(
      HttpServerResponse.schemaJson(InternalError)(new InternalError({}), {
        status: 500,
        headers: noStore,
      }),
    ),
  )

const done = HttpServerResponse.empty({ status: 204, headers: noStore })

/**
 * The stateless app token endpoints (ADR-0022, auth-v2.md §4):
 * - `POST /api/token/refresh` — body `RefreshRequest`, no cookie read → a new `AppTokenPair` while the
 *   refresh token's `gen` equals `user.appTokenGen`, else 401 `revoked`.
 * - `POST /api/token/revoke` — `Authorization: Bearer <app access JWT>` only → bumps `appTokenGen`
 *   (native sign-out: every app token of the user dies) → 204.
 * - `POST /api/token/revoke-mcp` — app access JWT or the web cookie session (`Sessions.current`) →
 *   bumps `mcpTokenGen` (every MCP token and code of the user dies) → 204.
 * Every response is `no-store`; every rejection is 401 `TokenRejected`.
 */
export const tokenRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const tokens = yield* Tokens
    const users = yield* UserTokens
    const sessions = yield* Sessions

    // A token for a user that no longer exists is just an invalid token.
    const notFoundIsInvalid = <A>(effect: Effect.Effect<A, UserNotFound | PersistenceError>) =>
      Effect.catchTag(effect, "UserNotFound", () => Effect.fail(invalid))

    const accessIdentity = (request: HttpServerRequest.HttpServerRequest) =>
      Option.match(bearerJwt(new Headers(request.headers)), {
        onNone: () => Effect.fail(invalid),
        onSome: tokens.verifyApp,
      })

    const refresh = (request: HttpServerRequest.HttpServerRequest) =>
      Effect.gen(function* () {
        const body = yield* request.json.pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(RefreshRequest)),
          Effect.mapError(() => invalid),
        )
        const identity = yield* tokens.verifyAppRefresh(body.refreshToken)
        const gens = yield* users.tokenGens(identity.userId).pipe(notFoundIsInvalid)
        if (identity.gen !== gens.app) {
          return yield* revoked
        }
        const pair = yield* tokens.issueAppPair(identity.userId, gens.app)
        return yield* HttpServerResponse.schemaJson(AppTokenPair)(pair, { headers: noStore })
      }).pipe(
        Effect.catchTag("TokenRejected", rejected),
        Effect.catch(unavailable),
        Effect.catchDefect(internal),
      )

    const revoke = (request: HttpServerRequest.HttpServerRequest) =>
      Effect.gen(function* () {
        const identity = yield* accessIdentity(request)
        yield* users.bumpAppTokenGen(identity.userId).pipe(notFoundIsInvalid)
        yield* Effect.logInfo("app tokens revoked", { jti: identity.jti.slice(0, 8) })
        return done
      }).pipe(
        Effect.catchTag("TokenRejected", rejected),
        Effect.catch(unavailable),
        Effect.catchDefect(internal),
      )

    /** The app JWT when one is sent (a rejected one is 401, no fallback), else the cookie session. */
    const principal = (request: HttpServerRequest.HttpServerRequest) => {
      const headers = new Headers(request.headers)
      return Option.match(bearerJwt(headers), {
        onNone: () =>
          sessions.current(headers).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.fail(invalid),
                onSome: (userId: UserId) => Effect.succeed(userId),
              }),
            ),
          ),
        onSome: (token) => Effect.map(tokens.verifyApp(token), (identity) => identity.userId),
      })
    }

    const revokeMcp = (request: HttpServerRequest.HttpServerRequest) =>
      Effect.gen(function* () {
        const userId = yield* principal(request)
        yield* users.bumpMcpTokenGen(userId).pipe(notFoundIsInvalid)
        return done
      }).pipe(
        Effect.catchTag("TokenRejected", rejected),
        Effect.catch(unavailable),
        Effect.catchDefect(internal),
      )

    return Layer.mergeAll(
      HttpRouter.add("POST", "/api/token/refresh", refresh),
      HttpRouter.add("POST", "/api/token/revoke", revoke),
      HttpRouter.add("POST", "/api/token/revoke-mcp", revokeMcp),
    )
  }),
)
