import { Email, UserId } from "@tanren/shared"
import { Context, Data, Effect, Layer, Option, Schema } from "effect"
import {
  FetchHttpClient,
  HttpClient,
  type HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/http"
import { OWNER_USER_ID_KEY } from "../store/syncQueries"
import { apiBaseUrl } from "./apiBaseUrl"
import { NativeSession, withSession } from "./NativeSession"
import { SqlDriver, type SqlStatement } from "./SqlDriver"

/** Better Auth `GET /api/auth/get-session` body: `null` signed out, else `{ user: { id, email } }`. */
export const AccountSessionBody = Schema.NullOr(
  Schema.Struct({ user: Schema.Struct({ id: UserId, email: Email }) }),
)

/**
 * Internal: sign-out or the session lookup failed. `offline` = no network or a timeout;
 * `server` = the worker answered non-2xx, an unreadable body, or the owner could not be forgotten.
 */
export class SignOutFailed extends Data.TaggedError("SignOutFailed")<{
  readonly reason: "offline" | "server"
}> {}

/**
 * Internal: "Disconnect AI clients" failed. `offline` = no network or a timeout; `server` = the
 * worker answered non-2xx (a 401 means the sign-in is gone too).
 */
export class DisconnectFailed extends Data.TaggedError("DisconnectFailed")<{
  readonly reason: "offline" | "server"
}> {}

export interface AccountUser {
  readonly userId: UserId
  readonly email: Email
}

export interface AccountShape {
  /** None when signed out; fails offline (the UI then shows "Signed in (offline)"). */
  readonly session: Effect.Effect<Option.Option<AccountUser>, SignOutFailed>
  /**
   * Web: `POST /api/auth/sign-out` (cookie), then forgets the owner. Native (a token pair is
   * stored): best-effort `POST /api/token/revoke` (Bearer; a failure is ignored so a dead network
   * never traps the user signed in), then forgets the owner, then `NativeSession.clear`. Local rows
   * are kept. A failed `forgetOwner` leaves the stored owner and the native tokens as they were,
   * as does any web HTTP failure.
   */
  readonly signOut: Effect.Effect<void, SignOutFailed>
  /**
   * `POST /api/token/revoke-mcp` (Bearer on native, cookie on web): every MCP access and refresh
   * token is dead, so Claude and other apps must reconnect. The app login is untouched.
   */
  readonly revokeMcp: Effect.Effect<void, DisconnectFailed>
}

/** Forgets the stored owner; the next runtime resolves signed out and skips the demo seed. */
export const forgetOwner: SqlStatement = {
  sql: `DELETE FROM "sync_state" WHERE "key" = ?`,
  params: [OWNER_USER_ID_KEY],
}

const REQUEST_TIMEOUT = "3 seconds"

const failed = (reason: SignOutFailed["reason"]) => new SignOutFailed({ reason })

/** Network trouble is `offline`; any HTTP answer or decode problem is `server`. */
const failureOfHttp = (cause: HttpClientError.HttpClientError): SignOutFailed =>
  failed(cause.reason._tag === "TransportError" ? "offline" : "server")

const make = (baseUrl: Effect.Effect<string>) =>
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
    const native = yield* NativeSession
    const driver = yield* SqlDriver

    /** Same options as `CurrentUser.fetchSession`: session cookie, no trace headers. */
    const execute = (request: HttpClientRequest.HttpClientRequest) =>
      withSession(request).pipe(
        Effect.provideService(NativeSession, native),
        Effect.flatMap((authorised) => client.execute(authorised)),
        Effect.provideService(FetchHttpClient.RequestInit, { credentials: "include" }),
        Effect.provideService(HttpClient.TracerPropagationEnabled, false),
      )

    /** HTTP errors become `SignOutFailed`; 3 s timeout. */
    const settle = <A>(effect: Effect.Effect<A, HttpClientError.HttpClientError>) =>
      effect.pipe(
        Effect.mapError(failureOfHttp),
        Effect.timeoutOrElse({
          duration: REQUEST_TIMEOUT,
          orElse: () => Effect.fail(failed("offline")),
        }),
      )

    const send = (request: HttpClientRequest.HttpClientRequest) => settle(execute(request))

    /** A 401 means the server session is already gone: nothing left to end remotely. */
    const isUnauthorised = (cause: HttpClientError.HttpClientError): boolean =>
      cause.reason._tag === "StatusCodeError" && cause.reason.response.status === 401

    const session = Effect.gen(function* () {
      const base = yield* baseUrl
      const response = yield* send(
        HttpClientRequest.get(`${base}/api/auth/get-session`).pipe(HttpClientRequest.acceptJson),
      )
      const body = yield* HttpClientResponse.schemaBodyJson(AccountSessionBody)(response).pipe(
        Effect.mapError(() => failed("server")),
      )
      return Option.map(Option.fromNullishOr(body), ({ user }) => ({
        userId: user.id,
        email: user.email,
      }))
    })

    /**
     * Native: end the app login on the server. True when it is done (2xx, or a 401: the server
     * already bumped the generation); false when it must be retried at the next start (offline,
     * timeout, 5xx, or no access token to authenticate with). Never fails.
     */
    const revokeAppTokens = Effect.gen(function* () {
      const base = yield* baseUrl
      // None = the refresh could not connect (an unauthenticated 401 must not count as done).
      if (Option.isNone(yield* native.token)) {
        return false
      }
      yield* settle(
        execute(
          HttpClientRequest.post(`${base}/api/token/revoke`).pipe(HttpClientRequest.acceptJson),
        ).pipe(Effect.catchIf(isUnauthorised, () => Effect.void)),
      )
      return true
    }).pipe(Effect.catch(() => Effect.succeed(false)))

    /** Web: Better Auth ends the cookie session. */
    const endWebSession = Effect.gen(function* () {
      const base = yield* baseUrl
      const request = yield* HttpClientRequest.post(`${base}/api/auth/sign-out`).pipe(
        HttpClientRequest.acceptJson,
        HttpClientRequest.bodyJson({}),
        Effect.mapError(() => failed("server")),
      )
      yield* settle(execute(request).pipe(Effect.catchIf(isUnauthorised, () => Effect.void)))
    })

    const revokeMcp = Effect.gen(function* () {
      const base = yield* baseUrl
      yield* send(
        HttpClientRequest.post(`${base}/api/token/revoke-mcp`).pipe(HttpClientRequest.acceptJson),
      )
    }).pipe(Effect.mapError((error) => new DisconnectFailed({ reason: error.reason })))

    const signOut = Effect.gen(function* () {
      const hasTokens = yield* native.hasSession
      const revoked = yield* hasTokens ? revokeAppTokens : endWebSession.pipe(Effect.as(true))
      // Owner first: if it cannot be forgotten the tokens stay, so the user is still signed in
      // locally and can retry. (The server side is already gone; a retry then gets a 401, which
      // is done on native and counts as success on web.)
      yield* driver.batch([forgetOwner]).pipe(Effect.mapError(() => failed("server")))
      // A revoke that did not get through leaves the refresh token as a marker the next start retries.
      if (!revoked) {
        yield* native.deferRevoke
      }
      yield* native.clear
    })

    return { session, signOut, revokeMcp } satisfies AccountShape
  })

/** Account actions for Settings: who is signed in, and sign-out. */
export class Account extends Context.Service<Account, AccountShape>()("@tanren/Account") {
  /** Any base URL (the seam tests use). Needs HttpClient, NativeSession and SqlDriver. */
  static readonly layerWith = (baseUrl: Effect.Effect<string>) => Layer.effect(this, make(baseUrl))

  static readonly layerNoDeps = this.layerWith(apiBaseUrl)

  /** App: the worker at `apiBaseUrl`. Needs SqlDriver (the runtime's base layer). */
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(Layer.mergeAll(FetchHttpClient.layer, NativeSession.layer)),
  )
}
