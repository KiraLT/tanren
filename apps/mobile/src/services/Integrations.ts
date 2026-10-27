import {
  ActivityExport,
  type ActivityExportId,
  ConnectRejected,
  ConnectResponse,
  GarminTokenRejected,
  IntegrationsStatus,
  ProviderStatus,
} from "@tanren/shared"
import { Context, Data, Duration, Effect, Layer, Schema } from "effect"
import {
  FetchHttpClient,
  HttpClient,
  type HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/http"
import { apiBaseUrl } from "./apiBaseUrl"
import { NativeSession, withSession } from "./NativeSession"

/**
 * Internal: an Integrations request failed. `offline` = no network or a timeout; `not-connected`
 * = the worker answered 409 `IntegrationNotConnected`; `not-configured` = a 400 `ConnectRejected`
 * with reason `not-configured` (no Strava app registered yet); `server` = any other non-2xx (a
 * 404 on retry, a 400 `return-to` included) or an unreadable body.
 */
export class IntegrationsRequestFailed extends Data.TaggedError("IntegrationsRequestFailed")<{
  readonly reason: "offline" | "server" | "not-connected" | "not-configured"
}> {}

export type IntegrationsFailure = IntegrationsRequestFailed["reason"]

export interface IntegrationsShape {
  /** `GET /integrations`: every provider's state and export counts. */
  readonly status: Effect.Effect<IntegrationsStatus, IntegrationsRequestFailed>
  /** `POST /integrations/strava/connect { returnTo }`: the provider's authorize URL to open. */
  readonly connect: (returnTo: string) => Effect.Effect<string, IntegrationsRequestFailed>
  /** `DELETE /integrations/strava` (204). */
  readonly disconnect: Effect.Effect<void, IntegrationsRequestFailed>
  /** `GET /integrations/strava/exports?limit=`: newest first. */
  readonly exports: (
    limit: number,
  ) => Effect.Effect<ReadonlyArray<ActivityExport>, IntegrationsRequestFailed>
  /** `POST /integrations/strava/exports/retry { id }`: the row after one attempt. */
  readonly retry: (id: ActivityExportId) => Effect.Effect<ActivityExport, IntegrationsRequestFailed>
  /**
   * `POST /integrations/garmin/connect { token }` (trimmed): the Garmin status after the worker
   * validated and sealed the token. A 400 `GarminTokenRejected` surfaces with its reason. The token
   * is only ever the request body: never logged, stored or put in an error.
   */
  readonly connectGarmin: (
    token: string,
  ) => Effect.Effect<ProviderStatus, IntegrationsRequestFailed | GarminTokenRejected>
  /** `DELETE /integrations/garmin` (204). */
  readonly disconnectGarmin: Effect.Effect<void, IntegrationsRequestFailed>
}

const REQUEST_TIMEOUT = "5 seconds"

/**
 * Garmin connect only: the worker validates the token before answering (exchange 10 s + profile
 * 10 s + inline first pull 5 s ≤ 25 s, `IntegrationsHandlers` connect), so the shared 5 s would
 * report a slow success as offline. 30 s leaves headroom; every other call keeps `REQUEST_TIMEOUT`.
 */
export const GARMIN_CONNECT_TIMEOUT_SECONDS = 30

const failed = (reason: IntegrationsFailure) => new IntegrationsRequestFailed({ reason })

/** Network trouble is `offline`; a 409 is `not-connected`; any other answer is `server`. */
export const failureOfHttp = (
  cause: HttpClientError.HttpClientError,
): IntegrationsRequestFailed => {
  if (cause.reason._tag === "TransportError") {
    return failed("offline")
  }
  const conflict = cause.reason._tag === "StatusCodeError" && cause.reason.response.status === 409
  return failed(conflict ? "not-connected" : "server")
}

/** A 400 is read once more: `ConnectRejected{reason:"not-configured"}` is its own reason. */
const failureOfResponse = (
  cause: HttpClientError.HttpClientError,
): Effect.Effect<IntegrationsRequestFailed> =>
  cause.reason._tag === "StatusCodeError" && cause.reason.response.status === 400
    ? HttpClientResponse.schemaBodyJson(ConnectRejected)(cause.reason.response).pipe(
        Effect.map((body) =>
          failed(body.reason === "not-configured" ? "not-configured" : "server"),
        ),
        Effect.orElseSucceed(() => failed("server")),
      )
    : Effect.succeed(failureOfHttp(cause))

const stravaFailure = (cause: HttpClientError.HttpClientError) =>
  Effect.flatMap(failureOfResponse(cause), Effect.fail)

/** Garmin connect: a 400 carries `GarminTokenRejected`; an unreadable 400 is `server`. */
const garminFailure = (
  cause: HttpClientError.HttpClientError,
): Effect.Effect<never, IntegrationsRequestFailed | GarminTokenRejected> =>
  cause.reason._tag === "StatusCodeError" && cause.reason.response.status === 400
    ? HttpClientResponse.schemaBodyJson(GarminTokenRejected)(cause.reason.response).pipe(
        Effect.matchEffect({
          onFailure: () => Effect.fail(failed("server")),
          onSuccess: (rejected) => Effect.fail(rejected),
        }),
      )
    : Effect.fail(failureOfHttp(cause))

const ExportList = Schema.Array(ActivityExport)

const make = (baseUrl: Effect.Effect<string>) =>
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
    const native = yield* NativeSession

    /** Same options as `Account`: session cookie (web) or Bearer (native), no trace headers. */
    const sendWith =
      <E>(
        recover: (cause: HttpClientError.HttpClientError) => Effect.Effect<never, E>,
        timeout: Duration.Input = REQUEST_TIMEOUT,
      ) =>
      (request: HttpClientRequest.HttpClientRequest) =>
        withSession(request).pipe(
          Effect.provideService(NativeSession, native),
          Effect.flatMap((authorised) => client.execute(authorised)),
          Effect.provideService(FetchHttpClient.RequestInit, { credentials: "include" }),
          Effect.provideService(HttpClient.TracerPropagationEnabled, false),
          Effect.catch(recover),
          Effect.timeoutOrElse({
            duration: timeout,
            orElse: () => Effect.fail(failed("offline")),
          }),
        )
    const send = sendWith(stravaFailure)

    const decode =
      <S extends Schema.Top>(schema: S) =>
      (response: HttpClientResponse.HttpClientResponse) =>
        HttpClientResponse.schemaBodyJson(schema)(response).pipe(
          Effect.mapError(() => failed("server")),
        )

    const postJson = (path: string, body: object) =>
      Effect.gen(function* () {
        const base = yield* baseUrl
        const request = yield* HttpClientRequest.post(`${base}${path}`).pipe(
          HttpClientRequest.acceptJson,
          HttpClientRequest.bodyJson(body),
          Effect.mapError(() => failed("server")),
        )
        return yield* send(request)
      })

    const status = Effect.gen(function* () {
      const base = yield* baseUrl
      const response = yield* send(
        HttpClientRequest.get(`${base}/integrations`).pipe(HttpClientRequest.acceptJson),
      )
      return yield* decode(IntegrationsStatus)(response)
    })

    const connect = (returnTo: string) =>
      postJson("/integrations/strava/connect", { returnTo }).pipe(
        Effect.flatMap(decode(ConnectResponse)),
        Effect.map(({ url }) => url),
      )

    const disconnect = Effect.gen(function* () {
      const base = yield* baseUrl
      yield* send(HttpClientRequest.delete(`${base}/integrations/strava`))
    })

    const exports = (limit: number) =>
      Effect.gen(function* () {
        const base = yield* baseUrl
        const response = yield* send(
          HttpClientRequest.get(`${base}/integrations/strava/exports`).pipe(
            HttpClientRequest.setUrlParam("limit", String(limit)),
            HttpClientRequest.acceptJson,
          ),
        )
        return yield* decode(ExportList)(response)
      })

    const retry = (id: ActivityExportId) =>
      postJson("/integrations/strava/exports/retry", { id }).pipe(
        Effect.flatMap(decode(ActivityExport)),
      )

    const connectGarmin = (token: string) =>
      Effect.gen(function* () {
        const base = yield* baseUrl
        const request = yield* HttpClientRequest.post(`${base}/integrations/garmin/connect`).pipe(
          HttpClientRequest.acceptJson,
          HttpClientRequest.bodyJson({ token: token.trim() }),
          Effect.mapError(() => failed("server")),
        )
        const response = yield* sendWith(
          garminFailure,
          Duration.seconds(GARMIN_CONNECT_TIMEOUT_SECONDS),
        )(request)
        return yield* decode(ProviderStatus)(response)
      })

    const disconnectGarmin = Effect.gen(function* () {
      const base = yield* baseUrl
      yield* send(HttpClientRequest.delete(`${base}/integrations/garmin`))
    })

    return {
      status,
      connect,
      disconnect,
      exports,
      retry,
      connectGarmin,
      disconnectGarmin,
    } satisfies IntegrationsShape
  })

/** Settings > Integrations: the worker's provider status, connect, disconnect, exports, retry. */
export class Integrations extends Context.Service<Integrations, IntegrationsShape>()(
  "@tanren/Integrations",
) {
  /** Any base URL (the seam tests use). Needs HttpClient and NativeSession. */
  static readonly layerWith = (baseUrl: Effect.Effect<string>) => Layer.effect(this, make(baseUrl))

  /** App: the worker at `apiBaseUrl`, fetch and the platform's session. Self-contained. */
  static readonly layer = this.layerWith(apiBaseUrl).pipe(
    Layer.provide(Layer.mergeAll(FetchHttpClient.layer, NativeSession.layer)),
  )
}

/** When an action reloads the page's status: after a success, after a failure, or never. */
export interface ReloadPolicy {
  readonly onSuccess: boolean
  readonly onFailure: boolean
}

/**
 * Garmin connect reloads either way: a request that timed out on the client may have connected on
 * the server, and the reload then shows Connected instead of a stale form.
 */
export const GARMIN_CONNECT_RELOAD: ReloadPolicy = { onSuccess: true, onFailure: true }

export const shouldReload = (policy: ReloadPolicy, outcome: "success" | "failure"): boolean =>
  outcome === "success" ? policy.onSuccess : policy.onFailure

/** Where the provider sends the browser back to; the worker allow-lists it (design §4). */
export type ReturnTarget =
  | { readonly _tag: "web"; readonly origin: string }
  | { readonly _tag: "native"; readonly createURL: (path: string) => string }

export const INTEGRATIONS_PATH = "settings/integrations"

/**
 * Web: `<origin>/settings/integrations`. Native: `Linking.createURL("settings/integrations")`, no
 * leading slash, like the sign-in's `auth/callback` (`NativeSession.expoReturnTo`): Expo Go gives
 * `exp://<host>/--/settings/integrations`, a build `tanren://settings/integrations`.
 */
export const returnToFor = (target: ReturnTarget): string =>
  target._tag === "web"
    ? `${target.origin}/${INTEGRATIONS_PATH}`
    : target.createURL(INTEGRATIONS_PATH)

const IS_WEB = process.env.EXPO_OS === "web"

/** This platform's `returnTo` (expo-linking is loaded lazily, as in `NativeSession`). */
export const platformReturnTo: Effect.Effect<string, IntegrationsRequestFailed> = IS_WEB
  ? Effect.sync(() => returnToFor({ _tag: "web", origin: window.location.origin }))
  : Effect.tryPromise({
      try: () =>
        import("expo-linking").then((linking) =>
          returnToFor({ _tag: "native", createURL: (path) => linking.createURL(path) }),
        ),
      catch: () => failed("server"),
    })

/** Web: same-tab navigation (the provider redirects back); native: the system browser. */
export const openAuthorizeUrl = (url: string): Effect.Effect<void, IntegrationsRequestFailed> =>
  IS_WEB
    ? Effect.sync(() => window.location.assign(url))
    : Effect.tryPromise({
        try: () => import("expo-linking").then((linking) => linking.openURL(url)),
        catch: () => failed("server"),
      }).pipe(Effect.asVoid)
