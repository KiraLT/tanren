import { UserId } from "@tanren/shared"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { LOCAL_USER_ID } from "../store/localUser"
import { readOwner } from "../store/syncQueries"
import { apiBaseUrl } from "./apiBaseUrl"
import { LocalStore } from "./LocalStore"

export interface CurrentUserShape {
  /** The signed-in user; `None` when nobody is signed in (local demo mode, `LOCAL_USER_ID`). */
  readonly signedIn: Effect.Effect<Option.Option<UserId>>
}

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

const fetchSession = (baseUrl: string) =>
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
    const response = yield* client
      .execute(
        HttpClientRequest.get(`${baseUrl}/api/auth/get-session`).pipe(HttpClientRequest.acceptJson),
      )
      .pipe(
        // Session cookie, and no trace headers (CORS preflight), as in SyncTransport.
        Effect.provideService(FetchHttpClient.RequestInit, { credentials: "include" }),
        Effect.provideService(HttpClient.TracerPropagationEnabled, false),
      )
    const body = yield* HttpClientResponse.schemaBodyJson(SessionBody)(response)
    return Option.map(Option.fromNullishOr(body), ({ user }) => user.id)
  }).pipe(Effect.timeout(SESSION_TIMEOUT))

const storedOwner = LocalStore.use((store) => store.all(readOwner)).pipe(
  Effect.map((rows) => Option.fromNullishOr(rows[0]?.value)),
  Effect.map(Option.flatMap(Schema.decodeUnknownOption(UserId))),
  Effect.orElseSucceed(() => Option.none<UserId>()),
)

/** The signed-in user, resolved once when the app runtime is built (no sign-in UI yet). */
export class CurrentUser extends Context.Service<CurrentUser, CurrentUserShape>()(
  "@tanren/CurrentUser",
) {
  /** App: dev override, worker session, stored owner (see `resolveSignedIn`). Needs LocalStore. */
  static readonly layer = Layer.effect(
    this,
    resolveSignedIn({
      // Static access only: Expo inlines `process.env.EXPO_PUBLIC_*` / `NODE_ENV` at bundle time.
      devUserId:
        process.env.NODE_ENV === "production"
          ? Option.none()
          : parseDevUserId(process.env.EXPO_PUBLIC_DEV_USER_ID),
      session: apiBaseUrl.pipe(Effect.flatMap(fetchSession)),
      storedOwner,
    }).pipe(Effect.map((signedIn) => CurrentUser.of({ signedIn: Effect.succeed(signedIn) }))),
  ).pipe(Layer.provide(FetchHttpClient.layer))

  static readonly layerTest = (signedIn: Option.Option<UserId>) =>
    Layer.succeed(this, this.of({ signedIn: Effect.succeed(signedIn) }))
}

/** Owner of new local rows: the signed-in user, else `LOCAL_USER_ID`. */
export const ownerId = (currentUser: CurrentUserShape): Effect.Effect<UserId> =>
  currentUser.signedIn.pipe(Effect.map(Option.getOrElse(() => LOCAL_USER_ID)))
