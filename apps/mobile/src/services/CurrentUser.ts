import { ROW_TABLE, UserId } from "@tanren/shared"
import { Context, Effect, Layer, Option, Schema, Stream, SubscriptionRef } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { LOCAL_USER_ID } from "../store/localUser"
import { readOwner } from "../store/syncQueries"
import { apiBaseUrl } from "./apiBaseUrl"
import { LocalStore } from "./LocalStore"
import { NativeSession, withSession } from "./NativeSession"

export interface CurrentUserShape {
  /** The signed-in user; `None` when nobody is signed in (local demo mode, `LOCAL_USER_ID`). */
  readonly signedIn: Effect.Effect<Option.Option<UserId>>
  /** Resolves again (after a native sign-in exchange or sign-out), publishes it to `changes`. */
  readonly refresh: Effect.Effect<Option.Option<UserId>>
  /** The current value first, then every later `refresh` result. */
  readonly changes: Stream.Stream<Option.Option<UserId>>
}

/**
 * A `CurrentUser` whose value lives in a `SubscriptionRef`: `resolve` runs once now (the initial
 * value) and again on every `refresh`.
 */
export const currentUserFrom = (
  resolve: Effect.Effect<Option.Option<UserId>>,
): Effect.Effect<CurrentUserShape> =>
  Effect.gen(function* () {
    const ref = yield* SubscriptionRef.make(yield* resolve)
    return {
      signedIn: SubscriptionRef.get(ref),
      refresh: resolve.pipe(Effect.tap((userId) => SubscriptionRef.set(ref, userId))),
      changes: SubscriptionRef.changes(ref),
    }
  })

/**
 * Better Auth `GET /api/auth/get-session` body: `null` when signed out, else `{ session, user }`.
 * Only `user.id` is read; the rest is ignored.
 */
export const SessionBody = Schema.NullOr(Schema.Struct({ user: Schema.Struct({ id: UserId }) }))

/** Dev-only override (`EXPO_PUBLIC_DEV_USER_ID`): a valid UUID, else ignored. */
export const parseDevUserId = (raw: string | undefined): Option.Option<UserId> =>
  Option.fromNullishOr(raw).pipe(
    Option.map((value) => value.trim()),
    Option.filter((value) => value.length > 0),
    Option.flatMap(Schema.decodeUnknownOption(UserId)),
  )

/**
 * Who is signed in: the dev override wins; else the worker session (`null` = signed out); if the
 * worker cannot be asked (offline, error, timeout), the owner the local store was re-keyed to,
 * so Today keeps working offline after the first sign-in.
 */
export const resolveSignedIn = <E, R1, R2>(inputs: {
  readonly devUserId: Option.Option<UserId>
  readonly session: Effect.Effect<Option.Option<UserId>, E, R1>
  readonly storedOwner: Effect.Effect<Option.Option<UserId>, never, R2>
}): Effect.Effect<Option.Option<UserId>, never, R1 | R2> =>
  Option.match(inputs.devUserId, {
    onSome: (userId) => Effect.succeed(Option.some(userId)),
    onNone: () => inputs.session.pipe(Effect.catch(() => inputs.storedOwner)),
  })

const SESSION_TIMEOUT = "3 seconds"

/**
 * `GET /api/auth/get-session` with the session cookie (web) or the stored Bearer token (native).
 * A `null` body while a token is stored means the session expired: the token is cleared.
 */
export const fetchSession = (baseUrl: string) =>
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
    const native = yield* NativeSession
    const request = yield* withSession(
      HttpClientRequest.get(`${baseUrl}/api/auth/get-session`).pipe(HttpClientRequest.acceptJson),
    )
    const response = yield* client.execute(request).pipe(
      // Session cookie, and no trace headers (CORS preflight), as in SyncTransport.
      Effect.provideService(FetchHttpClient.RequestInit, { credentials: "include" }),
      Effect.provideService(HttpClient.TracerPropagationEnabled, false),
    )
    const body = yield* HttpClientResponse.schemaBodyJson(SessionBody)(response)
    const userId = Option.map(Option.fromNullishOr(body), ({ user }) => user.id)
    if (Option.isNone(userId) && Option.isSome(yield* native.token)) {
      yield* native.clear
    }
    return userId
  }).pipe(Effect.timeout(SESSION_TIMEOUT))

const storedOwner = LocalStore.use((store) => store.all(readOwner)).pipe(
  Effect.map((rows) => Option.fromNullishOr(rows[0]?.value)),
  Effect.map(Option.flatMap(Schema.decodeUnknownOption(UserId))),
  Effect.orElseSucceed(() => Option.none<UserId>()),
)

/** Live sets in the offline store; 0 when the store cannot be read. */
export const localSetCount = LocalStore.use((store) =>
  store.all({
    sql: `SELECT COUNT(*) AS "n" FROM "${ROW_TABLE.set}" WHERE "deletedAt" IS NULL`,
    params: [],
  }),
).pipe(
  Effect.map((rows) => {
    const n = rows[0]?.n
    return typeof n === "number" ? n : 0
  }),
  Effect.orElseSucceed(() => 0),
)

/**
 * The account on this device for the sign-in gate (`authGate.gateFor`): the resolved user, else
 * the owner the store was re-keyed to, so an expired session (`get-session` null) is not a gate.
 * `forgetOwner` (sign-out) removes the stored owner.
 */
export const gateAccount = (signedIn: Option.Option<UserId>) =>
  Option.isSome(signedIn)
    ? Effect.succeed(signedIn)
    : storedOwner.pipe(Effect.orElseSucceed(() => Option.none<UserId>()))

/**
 * The signed-in user: resolved when the app runtime is built, and again on `refresh` (after a
 * native sign-in exchange or a sign-out); `changes` streams every result to the UI.
 */
export class CurrentUser extends Context.Service<CurrentUser, CurrentUserShape>()(
  "@tanren/CurrentUser",
) {
  /**
   * App: dev override, worker session (cookie on web, Bearer from `NativeSession` on native),
   * stored owner (see `resolveSignedIn`). Needs LocalStore.
   */
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const context = yield* Effect.context<HttpClient.HttpClient | NativeSession | LocalStore>()
      return yield* currentUserFrom(
        resolveSignedIn({
          // Static access only: Expo inlines `process.env.EXPO_PUBLIC_*` / `NODE_ENV` at bundle time.
          devUserId:
            process.env.NODE_ENV === "production"
              ? Option.none()
              : parseDevUserId(process.env.EXPO_PUBLIC_DEV_USER_ID),
          session: apiBaseUrl.pipe(Effect.flatMap(fetchSession)),
          storedOwner,
        }).pipe(Effect.provide(context)),
      )
    }),
  ).pipe(Layer.provide(Layer.mergeAll(FetchHttpClient.layer, NativeSession.layer)))

  static readonly layerTest = (signedIn: Option.Option<UserId>) =>
    Layer.succeed(
      this,
      this.of({
        signedIn: Effect.succeed(signedIn),
        refresh: Effect.succeed(signedIn),
        changes: Stream.make(signedIn),
      }),
    )
}

/** Owner of new local rows: the signed-in user, else `LOCAL_USER_ID`. */
export const ownerId = (currentUser: CurrentUserShape): Effect.Effect<UserId> =>
  currentUser.signedIn.pipe(Effect.map(Option.getOrElse(() => LOCAL_USER_ID)))
