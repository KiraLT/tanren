import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Effect, Layer, Option, Ref, Result, Schema } from "effect"
import { FetchHttpClient } from "effect/http"
import { OWNER_USER_ID_KEY, readOwner } from "../store/syncQueries"
import { Account, AccountSessionBody, type AccountShape, forgetOwner } from "./Account"
import { LocalStore } from "./LocalStore"
import { NativeSession } from "./NativeSession"
import { SqlDriver, StoreError } from "./SqlDriver"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"

const USER = UserId.make("00000000-0000-4000-8000-0000000000aa")
const EMAIL = "lukas@example.com"

const SESSION_ENTRY = {
  "tanren.session": JSON.stringify({
    token: "tok-123",
    userId: USER,
    expiresAt: "2099-01-01T00:00:00.000Z",
  }),
}

interface Call {
  readonly method: string
  readonly url: string
  readonly authorization: Option.Option<string>
  readonly contentType: Option.Option<string>
}

type Respond = (call: Call) => Promise<Response>

const json = (body: unknown, status = 200): Promise<Response> =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  )

/** node:sqlite whose `batch` fails for the `forgetOwner` statement only. */
const forgetFailsDriver = Layer.effect(
  SqlDriver,
  Effect.gen(function* () {
    const real = yield* SqlDriver
    return SqlDriver.of({
      ...real,
      batch: (statements) =>
        statements.some((statement) => statement.sql === forgetOwner.sql)
          ? Effect.fail(new StoreError({ cause: "disk full" }))
          : real.batch(statements),
    })
  }),
).pipe(Layer.provide(nodeSqlDriverLayer))

const unreachable: Respond = () => Promise.reject(new TypeError("Failed to fetch"))

/**
 * Runs `use` against `Account` on node:sqlite (owner row stored), a `NativeSession` in memory and a
 * stand-in server. Returns the outcome plus what the server saw and what is left locally.
 */
const scenario = <A, E>(
  use: (account: AccountShape) => Effect.Effect<A, E>,
  options: {
    readonly respond: Respond
    readonly entries?: Readonly<Record<string, string>>
    /** `SqlDriver.batch` fails when asked to run `forgetOwner`. */
    readonly failForget?: boolean
  },
) =>
  Effect.gen(function* () {
    const kv = yield* Ref.make(options.entries ?? {})
    const calls = yield* Ref.make<ReadonlyArray<Call>>([])
    const fetch: typeof globalThis.fetch = (input, init) => {
      const request = new Request(input, init)
      const call: Call = {
        method: request.method,
        url: request.url,
        authorization: Option.fromNullishOr(request.headers.get("authorization")),
        contentType: Option.fromNullishOr(request.headers.get("content-type")),
      }
      Effect.runSync(Ref.update(calls, (all) => [...all, call]))
      return options.respond(call)
    }
    const layer = Account.layerWith(Effect.succeed("http://api.test")).pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          LocalStore.layerNoDeps.pipe(
            Layer.provideMerge(
              Layer.mergeAll(
                options.failForget === true ? forgetFailsDriver : nodeSqlDriverLayer,
                StoreEvents.layer,
              ),
            ),
          ),
          NativeSession.layerMemory(kv),
          FetchHttpClient.layer,
        ),
      ),
    )
    return yield* Effect.gen(function* () {
      yield* SqlDriver.use((driver) =>
        driver.batch([
          {
            sql: `INSERT INTO "sync_state" ("key", "value") VALUES (?, ?)`,
            params: [OWNER_USER_ID_KEY, USER],
          },
        ]),
      )
      const result = yield* Account.use(use).pipe(Effect.result)
      const owner = yield* LocalStore.use((store) => store.all(readOwner))
      return {
        result,
        owner: owner.map((row) => row.value),
        calls: yield* Ref.get(calls),
        tokens: yield* Ref.get(kv),
      }
    }).pipe(Effect.provide(layer), Effect.provideService(FetchHttpClient.Fetch, fetch))
  })

describe("AccountSessionBody", () => {
  const decode = Schema.decodeUnknownSync(AccountSessionBody)

  it("decodes a signed-out null", () => {
    expect(decode(null)).toBeNull()
  })

  it("decodes a user with an id and an email, ignoring the rest", () => {
    expect(
      decode({ session: { id: "s" }, user: { id: USER, email: EMAIL, name: "Lukas" } }),
    ).toEqual({ user: { id: USER, email: EMAIL } })
  })

  it("fails on a user without an email, naming the path", () => {
    expect(() => decode({ user: { id: USER } })).toThrow(/email/)
  })

  it("fails on a user id that is not a UUID", () => {
    expect(() => decode({ user: { id: "lukas", email: EMAIL } })).toThrow(/id/)
  })
})

describe("Account.session", () => {
  it.effect("is None when the worker answers null (signed out)", () =>
    Effect.gen(function* () {
      const { result, calls } = yield* scenario((account) => account.session, {
        respond: () => json(null),
      })
      expect(result).toEqual(Result.succeed(Option.none()))
      expect(calls.map(({ method, url }) => `${method} ${url}`)).toEqual([
        "GET http://api.test/api/auth/get-session",
      ])
    }),
  )

  it.effect("is Some user id and email for a signed-in body", () =>
    Effect.gen(function* () {
      const { result } = yield* scenario((account) => account.session, {
        respond: () => json({ session: { id: "s" }, user: { id: USER, email: EMAIL } }),
      })
      expect(result).toEqual(Result.succeed(Option.some({ userId: USER, email: EMAIL })))
    }),
  )

  it.effect("sends the stored Bearer token (native)", () =>
    Effect.gen(function* () {
      const { calls } = yield* scenario((account) => account.session, {
        entries: SESSION_ENTRY,
        respond: () => json(null),
      })
      expect(calls.map((call) => call.authorization)).toEqual([Option.some("Bearer tok-123")])
    }),
  )

  it.effect("fails SignOutFailed offline when the network is down", () =>
    Effect.gen(function* () {
      const { result } = yield* scenario((account) => account.session, { respond: unreachable })
      expect(Result.isFailure(result) && result.failure).toMatchObject({
        _tag: "SignOutFailed",
        reason: "offline",
      })
    }),
  )

  it.effect("fails SignOutFailed server on a 503", () =>
    Effect.gen(function* () {
      const { result } = yield* scenario((account) => account.session, {
        respond: () => json({}, 503),
      })
      expect(Result.isFailure(result) && result.failure).toMatchObject({
        _tag: "SignOutFailed",
        reason: "server",
      })
    }),
  )

  it.effect("fails SignOutFailed server on a body that is not a session", () =>
    Effect.gen(function* () {
      const { result } = yield* scenario((account) => account.session, {
        respond: () => json({ user: { id: "nope" } }),
      })
      expect(Result.isFailure(result) && result.failure).toMatchObject({
        _tag: "SignOutFailed",
        reason: "server",
      })
    }),
  )
})

describe("Account.signOut", () => {
  it.effect("on 200 posts JSON to sign-out, forgets the owner and clears the native token", () =>
    Effect.gen(function* () {
      const { result, owner, calls, tokens } = yield* scenario((account) => account.signOut, {
        entries: SESSION_ENTRY,
        respond: () => json({ success: true }),
      })
      expect(result).toEqual(Result.succeed(undefined))
      expect(owner).toEqual([])
      expect(tokens).toEqual({})
      expect(calls).toEqual([
        {
          method: "POST",
          url: "http://api.test/api/auth/sign-out",
          authorization: Option.some("Bearer tok-123"),
          contentType: Option.some("application/json"),
        },
      ])
    }),
  )

  it.effect("on 200 on web (no token) forgets the owner and sends no Authorization", () =>
    Effect.gen(function* () {
      const { result, owner, calls } = yield* scenario((account) => account.signOut, {
        respond: () => json({ success: true }),
      })
      expect(result).toEqual(Result.succeed(undefined))
      expect(owner).toEqual([])
      expect(calls.map((call) => call.authorization)).toEqual([Option.none()])
    }),
  )

  it.effect(
    "on 401 (server session already gone) still forgets the owner and clears the token",
    () =>
      Effect.gen(function* () {
        const { result, owner, tokens } = yield* scenario((account) => account.signOut, {
          entries: SESSION_ENTRY,
          respond: () => json({ message: "unauthorised" }, 401),
        })
        expect(result).toEqual(Result.succeed(undefined))
        expect(owner).toEqual([])
        expect(tokens).toEqual({})
      }),
  )

  it.effect("on 500 fails server and leaves the owner untouched", () =>
    Effect.gen(function* () {
      const { result, owner } = yield* scenario((account) => account.signOut, {
        respond: () => json({}, 500),
      })
      expect(Result.isFailure(result) && result.failure).toMatchObject({
        _tag: "SignOutFailed",
        reason: "server",
      })
      expect(owner).toEqual([USER])
    }),
  )

  it.effect("fails server and keeps the native token when the owner cannot be forgotten", () =>
    Effect.gen(function* () {
      const { result, owner, tokens } = yield* scenario((account) => account.signOut, {
        entries: SESSION_ENTRY,
        failForget: true,
        respond: () => json({ success: true }),
      })
      expect(Result.isFailure(result) && result.failure).toMatchObject({
        _tag: "SignOutFailed",
        reason: "server",
      })
      expect(owner).toEqual([USER])
      expect(tokens).toEqual(SESSION_ENTRY)
    }),
  )

  it.effect("offline fails with offline and leaves the owner and the token untouched", () =>
    Effect.gen(function* () {
      const { result, owner, tokens } = yield* scenario((account) => account.signOut, {
        entries: SESSION_ENTRY,
        respond: unreachable,
      })
      expect(Result.isFailure(result) && result.failure).toMatchObject({
        _tag: "SignOutFailed",
        reason: "offline",
      })
      expect(owner).toEqual([USER])
      expect(tokens).toEqual(SESSION_ENTRY)
    }),
  )
})

describe("forgetOwner", () => {
  it("deletes only the owner key of sync_state", () => {
    expect(forgetOwner).toEqual({
      sql: `DELETE FROM "sync_state" WHERE "key" = ?`,
      params: [OWNER_USER_ID_KEY],
    })
  })
})
