import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Effect, Layer, Option, Ref, Result } from "effect"
import { FetchHttpClient } from "effect/http"
import { NativeSession, SESSION_KEY } from "./NativeSession"
import { SyncTransport } from "./SyncTransport"

const USER = UserId.make("00000000-0000-4000-8000-0000000000aa")
const ENTRY = {
  [SESSION_KEY]: JSON.stringify({
    token: "tok-123",
    userId: USER,
    expiresAt: "2099-01-01T00:00:00.000Z",
  }),
}

const pullWith = (respond: () => Promise<Response>) =>
  Effect.gen(function* () {
    const store = yield* Ref.make<Readonly<Record<string, string>>>(ENTRY)
    const result = yield* SyncTransport.use((t) =>
      t.fetchChanges({ since: Option.none(), limit: 10 }),
    ).pipe(
      Effect.provide(
        SyncTransport.layerHttp("http://api.test").pipe(
          Layer.provide(Layer.mergeAll(FetchHttpClient.layer, NativeSession.layerMemory(store))),
        ),
      ),
      Effect.provideService(FetchHttpClient.Fetch, () => respond()),
      Effect.result,
    )
    return { result, store: yield* Ref.get(store) }
  })

describe("SyncTransport / withSession failure handling", () => {
  it.effect(
    "a 401 is a typed TransportError(status); the token is kept (only get-session clears it)",
    () =>
      Effect.gen(function* () {
        const { result, store } = yield* pullWith(() =>
          Promise.resolve(new Response("no", { status: 401 })),
        )
        expect(Result.isFailure(result) && result.failure).toMatchObject({
          _tag: "TransportError",
          reason: "status",
        })
        expect(store[SESSION_KEY]).toBeDefined()
      }),
  )

  it.effect("a network failure is TransportError(unreachable) and keeps the token", () =>
    Effect.gen(function* () {
      const { result, store } = yield* pullWith(() =>
        Promise.reject(new TypeError("Failed to fetch")),
      )
      expect(Result.isFailure(result) && result.failure).toMatchObject({ reason: "unreachable" })
      expect(store[SESSION_KEY]).toBeDefined()
    }),
  )

  it.effect("a 200 with a body outside the schema is TransportError(decode), not a throw", () =>
    Effect.gen(function* () {
      const { result } = yield* pullWith(() =>
        Promise.resolve(
          new Response(JSON.stringify({ changes: "nope" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      )
      expect(Result.isFailure(result) && result.failure).toMatchObject({ reason: "decode" })
    }),
  )

  it.effect("a 200 with an empty / non-JSON body is TransportError(decode)", () =>
    Effect.gen(function* () {
      const { result } = yield* pullWith(() => Promise.resolve(new Response("", { status: 200 })))
      expect(Result.isFailure(result) && result.failure).toMatchObject({ reason: "decode" })
    }),
  )

  it.effect("a 429 and a 500 both map to status", () =>
    Effect.gen(function* () {
      yield* Effect.forEach([429, 500], (status) =>
        Effect.gen(function* () {
          const { result } = yield* pullWith(() => Promise.resolve(new Response("x", { status })))
          expect(Result.isFailure(result) && result.failure).toMatchObject({ reason: "status" })
        }),
      )
    }),
  )
})
