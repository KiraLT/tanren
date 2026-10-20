import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Effect, Fiber, Layer, Option, Ref, Result } from "effect"
import { FetchHttpClient } from "effect/http"
import { TestClock } from "effect/testing"
import { OWNER_USER_ID_KEY, readOwner } from "../store/syncQueries"
import { Account } from "./Account"
import { LocalStore } from "./LocalStore"
import { NativeSession, SESSION_KEY } from "./NativeSession"
import { SqlDriver } from "./SqlDriver"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"

const USER = UserId.make("00000000-0000-4000-8000-0000000000aa")
const ENTRY = {
  [SESSION_KEY]: JSON.stringify({
    token: "tok-123",
    userId: USER,
    expiresAt: "2099-01-01T00:00:00.000Z",
  }),
}

/** `fetch` answers per URL path; `hang` never resolves. */
const world = (fetchFor: (url: string) => Promise<Response>) =>
  Effect.gen(function* () {
    const kv = yield* Ref.make<Readonly<Record<string, string>>>(ENTRY)
    const layer = Account.layerWith(Effect.succeed("http://api.test")).pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          LocalStore.layerNoDeps.pipe(
            Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
          ),
          NativeSession.layerMemory(kv),
          FetchHttpClient.layer,
        ),
      ),
    )
    const fetch: typeof globalThis.fetch = (input) => fetchFor(new Request(input).url)
    return { kv, layer, fetch }
  })

const seedOwner = SqlDriver.use((d) =>
  d.batch([
    {
      sql: `INSERT INTO "sync_state" ("key","value") VALUES (?,?)`,
      params: [OWNER_USER_ID_KEY, USER],
    },
  ]),
)
const owner = LocalStore.use((s) => s.all(readOwner)).pipe(
  Effect.map((rows) => rows.map((r) => r.value)),
)
const ok = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  )

describe("Account edge cases", () => {
  it.effect("a hung sign-out request times out as offline after 3 s and changes nothing", () =>
    Effect.gen(function* () {
      const { kv, layer, fetch } = yield* world(() => new Promise<Response>(() => undefined))
      yield* Effect.gen(function* () {
        yield* seedOwner
        const fiber = yield* Effect.forkChild(Effect.result(Account.use((a) => a.signOut)))
        yield* TestClock.adjust("4 seconds")
        const result = yield* Fiber.join(fiber)
        expect(Result.isFailure(result) && result.failure).toMatchObject({ reason: "offline" })
        expect(yield* owner).toEqual([USER])
      }).pipe(Effect.provide(layer), Effect.provideService(FetchHttpClient.Fetch, fetch))
      expect(yield* Ref.get(kv)).toEqual(ENTRY)
    }),
  )

  it.effect(
    "sign-out while a get-session lookup is still in flight completes and forgets the owner",
    () =>
      Effect.gen(function* () {
        const { kv, layer, fetch } = yield* world((url) =>
          url.endsWith("/sign-out")
            ? ok({ success: true })
            : new Promise<Response>(() => undefined),
        )
        yield* Effect.gen(function* () {
          yield* seedOwner
          const lookup = yield* Effect.forkChild(Effect.result(Account.use((a) => a.session)))
          yield* Effect.yieldNow
          yield* Account.use((a) => a.signOut)
          expect(yield* owner).toEqual([])
          const outcome = yield* Account.use((a) => a.session).pipe(Effect.result, Effect.forkChild)
          yield* TestClock.adjust("4 seconds")
          yield* Fiber.join(lookup)
          expect(Result.isFailure(yield* Fiber.join(outcome))).toBe(true)
        }).pipe(Effect.provide(layer), Effect.provideService(FetchHttpClient.Fetch, fetch))
        expect(yield* Ref.get(kv)).toEqual({})
      }),
  )

  it.effect(
    "two concurrent sign-outs both end signed out locally (the second may see 401 from a real server)",
    () =>
      Effect.gen(function* () {
        const { kv, layer, fetch } = yield* world(() => ok({ success: true }))
        yield* Effect.gen(function* () {
          yield* seedOwner
          const both = yield* Effect.all(
            [
              Effect.result(Account.use((a) => a.signOut)),
              Effect.result(Account.use((a) => a.signOut)),
            ],
            { concurrency: "unbounded" },
          )
          expect(both.every(Result.isSuccess)).toBe(true)
          expect(yield* owner).toEqual([])
        }).pipe(Effect.provide(layer), Effect.provideService(FetchHttpClient.Fetch, fetch))
        expect(yield* Ref.get(kv)).toEqual({})
      }),
  )

  // DEFECT: Account.signOut on a 401 (server session already expired) fails SignOutFailed and keeps owner and token, so the user can never sign out (Account.ts signOut -> send -> filterStatusOk)
  it.effect.fails(
    "sign-out on a 401 still signs out locally (the server session is already gone)",
    () =>
      Effect.gen(function* () {
        const { kv, layer, fetch } = yield* world(() => ok({ message: "unauthorised" }, 401))
        yield* Effect.gen(function* () {
          yield* seedOwner
          const result = yield* Effect.result(Account.use((a) => a.signOut))
          expect(Result.isSuccess(result)).toBe(true)
          expect(yield* owner).toEqual([])
        }).pipe(Effect.provide(layer), Effect.provideService(FetchHttpClient.Fetch, fetch))
        expect(Option.isNone(Option.fromNullishOr((yield* Ref.get(kv))[SESSION_KEY]))).toBe(true)
      }),
  )
})
