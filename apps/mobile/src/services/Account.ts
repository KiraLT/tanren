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

export interface AccountUser {
  readonly userId: UserId
  readonly email: Email
}

export interface AccountShape {
  /** None when signed out; fails offline (the UI then shows "Signed in (offline)"). */
  readonly session: Effect.Effect<Option.Option<AccountUser>, SignOutFailed>
  /**
   * `POST /api/auth/sign-out` (cookie on web, Bearer on native), then `NativeSession.clear`, then
   * forgets the owner. Local rows are kept. Any failure leaves everything local as it was.
   */
  readonly signOut: Effect.Effect<void, SignOutFailed>
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

    /** Same options as `CurrentUser.fetchSession`: session cookie, no trace headers, 3 s. */
    const send = (request: HttpClientRequest.HttpClientRequest) =>
      withSession(request).pipe(
        Effect.provideService(NativeSession, native),
        Effect.flatMap((authorised) => client.execute(authorised)),
        Effect.provideService(FetchHttpClient.RequestInit, { credentials: "include" }),
        Effect.provideService(HttpClient.TracerPropagationEnabled, false),
        Effect.mapError(failureOfHttp),
        Effect.timeoutOrElse({
          duration: REQUEST_TIMEOUT,
          orElse: () => Effect.fail(failed("offline")),
        }),
      )

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

    const signOut = Effect.gen(function* () {
      const base = yield* baseUrl
      const request = yield* HttpClientRequest.post(`${base}/api/auth/sign-out`).pipe(
        HttpClientRequest.acceptJson,
        HttpClientRequest.bodyJson({}),
        Effect.mapError(() => failed("server")),
      )
      yield* send(request)
      yield* native.clear
      yield* driver.batch([forgetOwner]).pipe(Effect.mapError(() => failed("server")))
    })

    return { session, signOut } satisfies AccountShape
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
