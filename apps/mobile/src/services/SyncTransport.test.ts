import { describe, expect, it } from "@effect/vitest"
import { PullResponse, SyncCursor } from "@tanren/shared"
import { Effect, Layer, Option, Schema } from "effect"
import { FetchHttpClient } from "effect/http"
import { SyncTransport } from "./SyncTransport"

const pullResponse = Schema.encodeSync(PullResponse)(
  Schema.decodeUnknownSync(PullResponse)({
    changes: [],
    cursor: "42",
    serverTime: "2026-10-20T08:00:00.000Z",
    hasMore: false,
  }),
)

/** Answers 200 only for the request the transport must send; anything else is a 400. */
const strictFetch: typeof globalThis.fetch = (input, init) => {
  const body =
    init?.body instanceof Uint8Array ? new TextDecoder().decode(init.body) : String(init?.body)
  const headers = new Headers(init?.headers)
  const ok =
    String(input) === "http://api.test/sync/pull" &&
    init?.method === "POST" &&
    init.credentials === "include" &&
    !headers.has("traceparent") &&
    body === JSON.stringify({ since: null, limit: 200 })
  return Promise.resolve(
    new Response(ok ? JSON.stringify(pullResponse) : "bad request", {
      status: ok ? 200 : 400,
      headers: { "content-type": "application/json" },
    }),
  )
}

const http = SyncTransport.layerHttp("http://api.test").pipe(Layer.provide(FetchHttpClient.layer))

const pullWith = (fetch: typeof globalThis.fetch) =>
  SyncTransport.use((transport) =>
    transport.fetchChanges({ since: Option.none(), limit: 200 }),
  ).pipe(Effect.provide(http), Effect.provideService(FetchHttpClient.Fetch, fetch))

describe("SyncTransport.layerHttp", () => {
  it.effect("posts the encoded request with the session cookie and decodes the response", () =>
    Effect.gen(function* () {
      const response = yield* pullWith(strictFetch)
      expect(response.cursor).toBe(SyncCursor.make("42"))
    }),
  )

  it.effect("reports a non-2xx answer as a status failure", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        pullWith(() => Promise.resolve(new Response("down", { status: 503 }))),
      )
      expect(error).toMatchObject({ _tag: "TransportError", reason: "status" })
    }),
  )

  it.effect("reports a network failure as unreachable", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(pullWith(() => Promise.reject(new TypeError("offline"))))
      expect(error).toMatchObject({ _tag: "TransportError", reason: "unreachable" })
    }),
  )
})
