import { PullRequest, PullResponse, PushRequest, PushResponse } from "@tanren/shared"
import { Context, Data, Effect, Layer, type Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { apiBaseUrl } from "./apiBaseUrl"

/**
 * Internal: a sync request failed. `unreachable` = no network / server down (the UI shows
 * "offline"); `status` = non-2xx (e.g. 401 before sign-in); `decode` = body outside the schema.
 */
export class TransportError extends Data.TaggedError("TransportError")<{
  readonly reason: "unreachable" | "status" | "decode"
  readonly cause: unknown
}> {}

export interface SyncTransportShape {
  readonly sendChanges: (request: PushRequest) => Effect.Effect<PushResponse, TransportError>
  readonly fetchChanges: (request: PullRequest) => Effect.Effect<PullResponse, TransportError>
}

export class SyncTransport extends Context.Service<SyncTransport, SyncTransportShape>()(
  "@tanren/SyncTransport",
) {
  /**
   * HTTP against `{baseUrl}/sync/push|pull` with the shared wire schemas. Sends the session
   * cookie (`credentials: "include"`, cross-origin on web dev) and no trace headers (they would
   * fail the browser's CORS preflight). Needs an HttpClient.
   */
  static readonly layerHttp = (baseUrl: string) =>
    Layer.effect(
      this,
      Effect.gen(function* () {
        const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
        const call =
          <Req extends Schema.Constraint, Res extends Schema.Constraint>(
            path: string,
            requestSchema: Req,
            responseSchema: Res,
          ) =>
          (body: Req["Type"]) =>
            HttpClientRequest.post(`${baseUrl}${path}`).pipe(
              HttpClientRequest.acceptJson,
              HttpClientRequest.schemaBodyJson(requestSchema)(body),
              Effect.mapError((cause) => new TransportError({ reason: "decode", cause })),
              Effect.flatMap((request) =>
                client.execute(request).pipe(
                  // Read per request from the fiber, so they are provided here, not on the layer.
                  Effect.provideService(FetchHttpClient.RequestInit, { credentials: "include" }),
                  Effect.provideService(HttpClient.TracerPropagationEnabled, false),
                  Effect.mapError(
                    (cause) =>
                      new TransportError({
                        reason: cause.reason._tag === "StatusCodeError" ? "status" : "unreachable",
                        cause,
                      }),
                  ),
                ),
              ),
              Effect.flatMap((response) =>
                HttpClientResponse.schemaBodyJson(responseSchema)(response).pipe(
                  Effect.mapError((cause) => new TransportError({ reason: "decode", cause })),
                ),
              ),
            )
        return SyncTransport.of({
          sendChanges: call("/sync/push", PushRequest, PushResponse),
          fetchChanges: call("/sync/pull", PullRequest, PullResponse),
        })
      }),
    )

  /** The app's transport: fetch against `apiBaseUrl`. */
  static readonly layer = Layer.unwrap(apiBaseUrl.pipe(Effect.map(SyncTransport.layerHttp))).pipe(
    Layer.provide(FetchHttpClient.layer),
  )
}
