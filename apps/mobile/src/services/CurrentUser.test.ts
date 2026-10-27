import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Effect, Fiber, Layer, Option, Ref, Result, Schema, Stream } from "effect"
import { FetchHttpClient } from "effect/http"
import { LOCAL_USER_ID } from "../store/localUser"
import {
  CurrentUser,
  currentUserFrom,
  fetchSession,
  ownerId,
  parseDevUserId,
  resolveSignedIn,
  SessionBody,
} from "./CurrentUser"
import { NativeSession } from "./NativeSession"

const USER = UserId.make("00000000-0000-4000-8000-0000000000aa")
const STORED = UserId.make("00000000-0000-4000-8000-0000000000bb")

const signedOut = Effect.succeed(Option.none<UserId>())
const stored = Effect.succeed(Option.some(STORED))

describe("parseDevUserId", () => {
  it("accepts a UUID, trimmed", () => {
    expect(parseDevUserId(` ${USER} `)).toEqual(Option.some(USER))
  })

  it("ignores an unset, empty or invalid value", () => {
    expect(parseDevUserId(undefined)).toEqual(Option.none())
    expect(parseDevUserId("  ")).toEqual(Option.none())
    expect(parseDevUserId("lukas")).toEqual(Option.none())
  })
})

describe("SessionBody", () => {
  it("decodes a signed-out null and a signed-in user id", () => {
    const decode = Schema.decodeUnknownSync(SessionBody)
    expect(decode(null)).toBeNull()
    expect(decode({ session: { id: "s" }, user: { id: USER, email: "a@b.c" } })).toEqual({
      user: { id: USER },
    })
  })
})

describe("resolveSignedIn", () => {
  it.effect("prefers the dev override over the session", () =>
    Effect.gen(function* () {
      const result = yield* resolveSignedIn({
        devUserId: Option.some(USER),
        session: signedOut,
        storedOwner: stored,
      })
      expect(result).toEqual(Option.some(USER))
    }),
  )

  it.effect("treats a null session as signed out, even with a stored owner", () =>
    Effect.gen(function* () {
      const result = yield* resolveSignedIn({
        devUserId: Option.none(),
        session: signedOut,
        storedOwner: stored,
      })
      expect(result).toEqual(Option.none())
    }),
  )

  it.effect("falls back to the stored owner when the worker cannot be asked", () =>
    Effect.gen(function* () {
      const result = yield* resolveSignedIn({
        devUserId: Option.none(),
        session: Effect.fail("unreachable"),
        storedOwner: stored,
      })
      expect(result).toEqual(Option.some(STORED))
    }),
  )
})

describe("ownerId", () => {
  it.effect("is the signed-in user, else LOCAL_USER_ID", () =>
    Effect.gen(function* () {
      const signedIn = yield* CurrentUser.use(ownerId).pipe(
        Effect.provide(CurrentUser.layerTest(Option.some(USER))),
      )
      const local = yield* CurrentUser.use(ownerId).pipe(
        Effect.provide(CurrentUser.layerTest(Option.none())),
      )
      expect([signedIn, local]).toEqual([USER, LOCAL_USER_ID])
    }),
  )
})

const SESSION_ENTRY = {
  "tanren.access": "tok-123",
  "tanren.refresh": "ref-123",
  "tanren.expiresAt": "2099-01-01T00:00:00.000Z",
}

/** `get-session` against a stand-in server; returns the result, the `authorization` header seen and the store. */
const fetchSessionWith = (entries: Readonly<Record<string, string>>, body: unknown, status = 200) =>
  Effect.gen(function* () {
    const store = yield* Ref.make(entries)
    const header = yield* Ref.make<Option.Option<string>>(Option.none())
    const fetch: typeof globalThis.fetch = (_input, init) => {
      Effect.runSync(
        Ref.set(header, Option.fromNullishOr(new Headers(init?.headers).get("authorization"))),
      )
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      )
    }
    const result = yield* fetchSession("http://api.test").pipe(
      Effect.result,
      Effect.provide(Layer.mergeAll(FetchHttpClient.layer, NativeSession.layerMemory(store))),
      Effect.provideService(FetchHttpClient.Fetch, fetch),
    )
    return { result, header: yield* Ref.get(header), store: yield* Ref.get(store) }
  })

describe("fetchSession", () => {
  it.effect("sends Authorization: Bearer from NativeSession and reads the user", () =>
    Effect.gen(function* () {
      const { result, header } = yield* fetchSessionWith(SESSION_ENTRY, { user: { id: USER } })
      expect(header).toEqual(Option.some("Bearer tok-123"))
      expect(result).toEqual(Result.succeed(Option.some(USER)))
    }),
  )

  it.effect("sends no Authorization header without a token (cookie on web)", () =>
    Effect.gen(function* () {
      const { result, header } = yield* fetchSessionWith({}, { user: { id: USER } })
      expect(header).toEqual(Option.none())
      expect(result).toEqual(Result.succeed(Option.some(USER)))
    }),
  )

  it.effect("clears the stored token when the worker says the session is gone (null)", () =>
    Effect.gen(function* () {
      const { result, store } = yield* fetchSessionWith(SESSION_ENTRY, null)
      expect(result).toEqual(Result.succeed(Option.none()))
      expect(store).toEqual({})
    }),
  )

  it.effect("keeps the stored token when the worker cannot be reached (503)", () =>
    Effect.gen(function* () {
      const { result, store } = yield* fetchSessionWith(SESSION_ENTRY, {}, 503)
      expect(Result.isFailure(result)).toBe(true)
      expect(store).toEqual(SESSION_ENTRY)
    }),
  )
})

describe("currentUserFrom", () => {
  it.effect("resolves once, then refresh re-resolves and publishes to changes", () =>
    Effect.gen(function* () {
      const answers = yield* Ref.make<ReadonlyArray<Option.Option<UserId>>>([
        Option.none(),
        Option.some(USER),
      ])
      const resolve = Ref.modify(answers, (rest) => [
        rest[0] ?? Option.none<UserId>(),
        rest.slice(1),
      ])
      const current = yield* currentUserFrom(resolve)
      expect(yield* current.signedIn).toEqual(Option.none())
      expect(yield* current.refresh).toEqual(Option.some(USER))
      expect(yield* current.signedIn).toEqual(Option.some(USER))
      expect(yield* Stream.runHead(current.changes)).toEqual(Option.some(Option.some(USER)))
    }),
  )

  it.effect("changes emits each refresh to a live subscriber", () =>
    Effect.gen(function* () {
      const answers = yield* Ref.make<ReadonlyArray<Option.Option<UserId>>>([
        Option.none(),
        Option.some(USER),
      ])
      const current = yield* currentUserFrom(
        Ref.modify(answers, (rest) => [rest[0] ?? Option.none<UserId>(), rest.slice(1)]),
      )
      const subscriber = yield* current.changes.pipe(
        Stream.take(2),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* Effect.yieldNow
      yield* current.refresh
      expect(yield* Fiber.join(subscriber)).toEqual([Option.none(), Option.some(USER)])
    }),
  )
})
