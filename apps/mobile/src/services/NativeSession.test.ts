import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Ref } from "effect"
import { FetchHttpClient, HttpClientRequest } from "effect/http"
import { TestClock } from "effect/testing"
import {
  ACCESS_KEY,
  base64Url,
  callbackFailure,
  EXPIRES_KEY,
  LEGACY_SESSION_KEY,
  NativeSession,
  NativeSignInFailed,
  nativeSignInFailureMessage,
  PENDING_KEY,
  PENDING_REVOKE_KEY,
  REFRESH_KEY,
  withSession,
} from "./NativeSession"

// RFC 7636 appendix B: these 32 bytes encode to the verifier, whose S256 challenge is below.
const RFC_BYTES = Uint8Array.from([
  116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105,
  214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121,
])
const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
const RETURN_TO = "exp://192.168.1.5:8081/--/auth/callback"
const CODE = `${"a".repeat(32)}.${"B".repeat(43)}`
const USER = "00000000-0000-4000-8000-0000000000aa"
const ACCESS = "acc-123"
const REFRESH = "ref-123"
const NEW_ACCESS = "acc-456"
const NEW_REFRESH = "ref-456"
const FAR_FUTURE = "2099-01-01T00:00:00.000Z"
/** TestClock starts at the epoch: a pair expiring 10 minutes in. */
const EXPIRES_IN_10_MIN = "1970-01-01T00:10:00.000Z"

type Store = Ref.Ref<Readonly<Record<string, string>>>

const pairEntries = (expiresAt: string) => ({
  [ACCESS_KEY]: ACCESS,
  [REFRESH_KEY]: REFRESH,
  [EXPIRES_KEY]: expiresAt,
})
const freshPair = (expiresAt: string) => ({
  accessToken: NEW_ACCESS,
  refreshToken: NEW_REFRESH,
  expiresAt,
})
const pendingJson = JSON.stringify({
  verifier: RFC_VERIFIER,
  createdAt: "1970-01-01T00:00:00.000Z",
})

const failIfCalled: typeof globalThis.fetch = () => Promise.reject(new Error("no request expected"))

const respond =
  (status: number, body: unknown): typeof globalThis.fetch =>
  () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    )

/** Runs `effect` with the memory session over `entries` and a stand-in `fetch`. */
const withMemory = <A, E>(
  entries: Readonly<Record<string, string>>,
  effect: (store: Store) => Effect.Effect<A, E, NativeSession>,
  fetch: typeof globalThis.fetch = failIfCalled,
) =>
  Effect.gen(function* () {
    const store: Store = yield* Ref.make(entries)
    return yield* effect(store).pipe(
      Effect.provide(NativeSession.layerMemory(store, { randomBytes: () => RFC_BYTES })),
      Effect.provideService(FetchHttpClient.Fetch, fetch),
    )
  })

const failureReason = <A, R>(effect: Effect.Effect<A, { readonly reason: string }, R>) =>
  Effect.flip(effect).pipe(Effect.map((error) => error.reason))

describe("base64Url", () => {
  it("encodes the RFC 7636 verifier bytes without padding", () => {
    expect(base64Url(RFC_BYTES)).toBe(RFC_VERIFIER)
    expect(base64Url(Uint8Array.from([251, 255]))).toBe("-_8")
    expect(base64Url(new Uint8Array(0))).toBe("")
  })
})

describe("NativeSession.begin", () => {
  it.effect("stores the pending verifier and posts email, challenge and returnTo to /begin", () => {
    const seen: Array<{ readonly url: string; readonly method: string; readonly body: string }> = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      // biome-ignore lint/plugin/noMutation: test spy collecting what the fake server saw
      seen.push({ url: request.url, method: request.method, body: await request.text() })
      return new Response(JSON.stringify({ sent: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    return withMemory(
      {},
      (store) =>
        Effect.gen(function* () {
          yield* NativeSession.use((session) => session.begin("  dev@tanren.local "))
          expect(seen).toEqual([
            {
              url: "http://api.test/api/native/begin",
              method: "POST",
              body: JSON.stringify({
                email: "dev@tanren.local",
                challenge: RFC_CHALLENGE,
                returnTo: RETURN_TO,
              }),
            },
          ])
          const pending = JSON.parse((yield* Ref.get(store))[PENDING_KEY] ?? "{}")
          expect(pending.verifier).toBe(RFC_VERIFIER)
        }),
      fetch,
    )
  })

  it.effect("fails as invalid-email without a request", () =>
    withMemory({}, () =>
      Effect.gen(function* () {
        const reason = yield* failureReason(NativeSession.use((s) => s.begin("not-an-email")))
        expect(reason).toBe("invalid-email")
      }),
    ),
  )

  it.effect("reports a 400 as rejected with the status and a network failure as unreachable", () =>
    Effect.gen(function* () {
      const refused = yield* withMemory(
        {},
        () => Effect.flip(NativeSession.use((s) => s.begin("dev@tanren.local"))),
        respond(400, { _tag: "NativeBeginRejected", reason: "return-to" }),
      )
      const offline = yield* withMemory(
        {},
        () => failureReason(NativeSession.use((s) => s.begin("dev@tanren.local"))),
        () => Promise.reject(new TypeError("offline")),
      )
      expect(refused).toMatchObject({ reason: "rejected", status: Option.some(400) })
      expect(offline).toBe("unreachable")
    }),
  )
})

describe("NativeSession.complete", () => {
  it.effect("fails with no-pending when begin never ran", () =>
    withMemory({}, () =>
      Effect.gen(function* () {
        const reason = yield* failureReason(NativeSession.use((s) => s.complete(CODE)))
        expect(reason).toBe("no-pending")
      }),
    ),
  )

  it.effect("ignores a pending sign-in older than 15 minutes", () =>
    withMemory({ [PENDING_KEY]: pendingJson }, () =>
      Effect.gen(function* () {
        yield* TestClock.adjust("16 minutes")
        const reason = yield* failureReason(NativeSession.use((s) => s.complete(CODE)))
        expect(reason).toBe("no-pending")
      }),
    ),
  )

  it.effect("exchanges the code, stores the session, deletes pending and returns the user", () => {
    const seen: Array<{ readonly url: string; readonly method: string; readonly body: string }> = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      // biome-ignore lint/plugin/noMutation: test spy collecting what the fake server saw
      seen.push({ url: request.url, method: request.method, body: await request.text() })
      return new Response(JSON.stringify({ userId: USER, access: freshPair(FAR_FUTURE) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    return withMemory(
      { [PENDING_KEY]: pendingJson },
      (store) =>
        Effect.gen(function* () {
          const userId = yield* NativeSession.use((s) => s.complete(CODE))
          expect(userId).toBe(USER)
          expect(seen).toEqual([
            {
              url: "http://api.test/api/native/session",
              method: "POST",
              body: JSON.stringify({ code: CODE, verifier: RFC_VERIFIER }),
            },
          ])
          const stored = yield* Ref.get(store)
          expect(stored).toEqual({
            [ACCESS_KEY]: NEW_ACCESS,
            [REFRESH_KEY]: NEW_REFRESH,
            [EXPIRES_KEY]: FAR_FUTURE,
          })
          expect(yield* NativeSession.use((s) => s.token)).toEqual(Option.some(NEW_ACCESS))
        }),
      fetch,
    )
  })

  it.effect("maps a 400 to rejected and keeps the pending verifier", () =>
    withMemory(
      { [PENDING_KEY]: pendingJson },
      (store) =>
        Effect.gen(function* () {
          const reason = yield* failureReason(NativeSession.use((s) => s.complete(CODE)))
          expect(reason).toBe("rejected")
          expect(Object.keys(yield* Ref.get(store))).toEqual([PENDING_KEY])
        }),
      respond(400, { _tag: "NativeCodeRejected", reason: "invalid" }),
    ),
  )

  it.effect("maps a network failure and a 503 to unreachable", () =>
    Effect.gen(function* () {
      const offline = yield* withMemory(
        { [PENDING_KEY]: pendingJson },
        () => failureReason(NativeSession.use((s) => s.complete(CODE))),
        () => Promise.reject(new TypeError("offline")),
      )
      const down = yield* withMemory(
        { [PENDING_KEY]: pendingJson },
        () => failureReason(NativeSession.use((s) => s.complete(CODE))),
        respond(503, {}),
      )
      expect([offline, down]).toEqual(["unreachable", "unreachable"])
    }),
  )

  it.effect("rejects a malformed code without sending a request", () =>
    withMemory({ [PENDING_KEY]: pendingJson }, () =>
      Effect.gen(function* () {
        const reason = yield* failureReason(NativeSession.use((s) => s.complete("not-a-code")))
        expect(reason).toBe("rejected")
      }),
    ),
  )
})

describe("NativeSession.token and clear", () => {
  it.effect("is None without a stored pair, with an incomplete one or with an unreadable one", () =>
    Effect.gen(function* () {
      const empty = yield* withMemory({}, () => NativeSession.use((s) => s.token))
      const partial = yield* withMemory({ [ACCESS_KEY]: ACCESS }, () =>
        NativeSession.use((s) => s.token),
      )
      const garbage = yield* withMemory({ ...pairEntries("not a date") }, () =>
        NativeSession.use((s) => s.token),
      )
      expect([empty, partial, garbage]).toEqual([Option.none(), Option.none(), Option.none()])
    }),
  )

  it.effect("is the stored access token, with no request, while it is fresh", () =>
    withMemory({ ...pairEntries(EXPIRES_IN_10_MIN) }, () =>
      Effect.gen(function* () {
        yield* TestClock.adjust("569 seconds")
        expect(yield* NativeSession.use((s) => s.token)).toEqual(Option.some(ACCESS))
      }),
    ),
  )

  it.effect(
    "refreshes once within 30 s of expiry: refresh token in the body, new pair stored",
    () => {
      const seen: Array<{ readonly url: string; readonly method: string; readonly body: string }> =
        []
      const fetch: typeof globalThis.fetch = async (input, init) => {
        const request = new Request(input, init)
        // biome-ignore lint/plugin/noMutation: test spy collecting what the fake server saw
        seen.push({ url: request.url, method: request.method, body: await request.text() })
        return new Response(JSON.stringify(freshPair(FAR_FUTURE)), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }
      return withMemory(
        { ...pairEntries(EXPIRES_IN_10_MIN) },
        (store) =>
          Effect.gen(function* () {
            yield* TestClock.adjust("571 seconds")
            expect(yield* NativeSession.use((s) => s.token)).toEqual(Option.some(NEW_ACCESS))
            expect(seen).toEqual([
              {
                url: "http://api.test/api/token/refresh",
                method: "POST",
                body: JSON.stringify({ refreshToken: REFRESH }),
              },
            ])
            expect(yield* Ref.get(store)).toEqual({
              [ACCESS_KEY]: NEW_ACCESS,
              [REFRESH_KEY]: NEW_REFRESH,
              [EXPIRES_KEY]: FAR_FUTURE,
            })
            // The stored pair is fresh now: a second call does not fetch again.
            expect(yield* NativeSession.use((s) => s.token)).toEqual(Option.some(NEW_ACCESS))
            expect(seen).toHaveLength(1)
          }),
        fetch,
      )
    },
  )

  it.effect("refreshes an already expired pair", () =>
    withMemory(
      { ...pairEntries("1969-12-31T00:00:00.000Z") },
      () =>
        Effect.gen(function* () {
          expect(yield* NativeSession.use((s) => s.token)).toEqual(Option.some(NEW_ACCESS))
        }),
      respond(200, freshPair(FAR_FUTURE)),
    ),
  )

  it.effect("clears the session and is None when the refresh answers 401", () =>
    withMemory(
      { ...pairEntries("1969-12-31T00:00:00.000Z"), [PENDING_KEY]: pendingJson },
      (store) =>
        Effect.gen(function* () {
          expect(yield* NativeSession.use((s) => s.token)).toEqual(Option.none())
          expect(yield* Ref.get(store)).toEqual({})
          expect(yield* NativeSession.use((s) => s.hasSession)).toBe(false)
        }),
      respond(401, { _tag: "TokenRejected", reason: "revoked" }),
    ),
  )

  it.effect("keeps the stored pair and is None for this call when the refresh cannot connect", () =>
    Effect.gen(function* () {
      const entries = pairEntries("1969-12-31T00:00:00.000Z")
      const offline = yield* withMemory(
        { ...entries },
        (store) =>
          Effect.gen(function* () {
            const token = yield* NativeSession.use((s) => s.token)
            return [token, yield* Ref.get(store)] as const
          }),
        () => Promise.reject(new TypeError("offline")),
      )
      const down = yield* withMemory(
        { ...entries },
        (store) =>
          Effect.gen(function* () {
            const token = yield* NativeSession.use((s) => s.token)
            return [token, yield* Ref.get(store)] as const
          }),
        respond(503, {}),
      )
      expect([offline, down]).toEqual([
        [Option.none(), entries],
        [Option.none(), entries],
      ])
    }),
  )

  it.effect("deletes a leftover pre-ADR-0022 tanren.session and is signed out", () =>
    withMemory(
      {
        [LEGACY_SESSION_KEY]: JSON.stringify({
          token: "tok-123",
          userId: USER,
          expiresAt: FAR_FUTURE,
        }),
      },
      (store) =>
        Effect.gen(function* () {
          expect(yield* NativeSession.use((s) => s.token)).toEqual(Option.none())
          expect(yield* NativeSession.use((s) => s.hasSession)).toBe(false)
          expect(yield* Ref.get(store)).toEqual({})
        }),
    ),
  )

  it.effect("hasSession is true for a stored pair, even one that needs a refresh", () =>
    withMemory({ ...pairEntries("1969-12-31T00:00:00.000Z") }, () =>
      Effect.gen(function* () {
        expect(yield* NativeSession.use((s) => s.hasSession)).toBe(true)
      }),
    ),
  )

  it.effect("clear deletes the pair, a legacy session and the pending sign-in", () =>
    withMemory({ ...pairEntries(FAR_FUTURE), [PENDING_KEY]: pendingJson }, (store) =>
      Effect.gen(function* () {
        yield* NativeSession.use((s) => s.clear)
        expect(yield* Ref.get(store)).toEqual({})
      }),
    ),
  )

  it.effect("layerNone has no token and cannot sign in", () =>
    Effect.gen(function* () {
      const session = yield* NativeSession
      expect(yield* session.token).toEqual(Option.none())
      expect(yield* session.hasSession).toBe(false)
      expect(yield* failureReason(session.begin("dev@tanren.local"))).toBe("no-pending")
      yield* session.clear
    }).pipe(Effect.provide(NativeSession.layerNone)),
  )
})

describe("withSession", () => {
  const request = HttpClientRequest.get("http://api.test/sync/pull")

  it.effect("adds the Bearer header only when a token is stored", () =>
    Effect.gen(function* () {
      const signedIn = yield* withMemory({ ...pairEntries(FAR_FUTURE) }, () => withSession(request))
      const signedOut = yield* withMemory({}, () => withSession(request))
      expect(signedIn.headers.authorization).toBe(`Bearer ${ACCESS}`)
      expect(signedOut.headers.authorization).toBeUndefined()
    }),
  )
})

describe("NativeSession pending revoke", () => {
  type Answer = (path: string) => Promise<Response> | Response
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })
  const MARKED = { [PENDING_REVOKE_KEY]: REFRESH }

  /** A fake worker that records `METHOD path authorization body` per call, in order. */
  const recording = (answer: Answer) => {
    const seen: Array<string> = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      const path = new URL(request.url).pathname
      // biome-ignore lint/plugin/noMutation: test spy collecting what the fake server saw
      seen.push(
        `${request.method} ${path} ${request.headers.get("authorization") ?? "-"} ${await request.text()}`,
      )
      return answer(path)
    }
    return { seen, fetch }
  }

  const retryServerUp: Answer = (path) =>
    path === "/api/token/refresh" ? json(200, freshPair(FAR_FUTURE)) : json(200, { success: true })

  const REFRESH_CALL = `POST /api/token/refresh - ${JSON.stringify({ refreshToken: REFRESH })}`
  const REVOKE_CALL = `POST /api/token/revoke Bearer ${NEW_ACCESS} `

  it.effect("deferRevoke stores the stored refresh token and does nothing without a pair", () =>
    Effect.gen(function* () {
      const withPair = yield* withMemory({ ...pairEntries(FAR_FUTURE) }, (store) =>
        NativeSession.use((s) => s.deferRevoke).pipe(Effect.andThen(Ref.get(store))),
      )
      const without = yield* withMemory({}, (store) =>
        NativeSession.use((s) => s.deferRevoke).pipe(Effect.andThen(Ref.get(store))),
      )
      expect(withPair[PENDING_REVOKE_KEY]).toBe(REFRESH)
      expect(without).toEqual({})
    }),
  )

  it.effect(
    "on the next build: refresh with the marker, then revoke with the new access, then delete the marker",
    () => {
      const { seen, fetch } = recording(retryServerUp)
      return withMemory(
        { ...MARKED },
        (store) =>
          Effect.gen(function* () {
            expect(yield* NativeSession.use((s) => s.token)).toEqual(Option.none())
            expect(seen).toEqual([REFRESH_CALL, REVOKE_CALL])
            // The pair minted for the revoke is never stored.
            expect(yield* Ref.get(store)).toEqual({})
          }),
        fetch,
      )
    },
  )

  it.effect(
    "a refresh 401 (already revoked or expired) deletes the marker without a revoke",
    () => {
      const { seen, fetch } = recording(() =>
        json(401, { _tag: "TokenRejected", reason: "revoked" }),
      )
      return withMemory(
        { ...MARKED },
        (store) =>
          Effect.gen(function* () {
            yield* NativeSession.use((s) => s.token)
            expect(seen).toEqual([REFRESH_CALL])
            expect(yield* Ref.get(store)).toEqual({})
          }),
        fetch,
      )
    },
  )

  it.effect("a revoke 401 counts as done and deletes the marker", () => {
    const { fetch } = recording((path) =>
      path === "/api/token/refresh" ? json(200, freshPair(FAR_FUTURE)) : json(401, {}),
    )
    return withMemory(
      { ...MARKED },
      (store) =>
        Effect.gen(function* () {
          yield* NativeSession.use((s) => s.token)
          expect(yield* Ref.get(store)).toEqual({})
        }),
      fetch,
    )
  })

  it.effect(
    "still offline, or a 5xx at either step: the marker is kept and sign-in is untouched",
    () =>
      Effect.gen(function* () {
        const runWith = (fetch: typeof globalThis.fetch) =>
          withMemory(
            { ...MARKED, ...pairEntries(FAR_FUTURE) },
            (store) =>
              Effect.gen(function* () {
                const token = yield* NativeSession.use((s) => s.token)
                return [token, yield* Ref.get(store)] as const
              }),
            fetch,
          )
        const kept = [Option.some(ACCESS), { ...MARKED, ...pairEntries(FAR_FUTURE) }] as const
        const offline = yield* runWith(() => Promise.reject(new TypeError("offline")))
        const refreshDown = yield* runWith(recording(() => json(503, {})).fetch)
        const revokeDown = yield* runWith(
          recording((path) =>
            path === "/api/token/refresh" ? json(200, freshPair(FAR_FUTURE)) : json(500, {}),
          ).fetch,
        )
        expect([offline, refreshDown, revokeDown]).toEqual([kept, kept, kept])
      }),
  )

  it.effect("the retry runs once per build, not on every token call", () => {
    const { seen, fetch } = recording(() => json(503, {}))
    return withMemory(
      { ...MARKED },
      () =>
        Effect.gen(function* () {
          yield* NativeSession.use((s) => s.token)
          yield* NativeSession.use((s) => s.token)
          expect(seen).toEqual([REFRESH_CALL])
        }),
      fetch,
    )
  })

  it.effect(
    "complete retries first, then exchanges; the new session is not the retry's pair",
    () => {
      const { seen, fetch } = recording((path) =>
        path === "/api/native/session"
          ? json(200, {
              userId: USER,
              access: {
                accessToken: "acc-new-session",
                refreshToken: "ref-new-session",
                expiresAt: FAR_FUTURE,
              },
            })
          : retryServerUp(path),
      )
      return withMemory(
        { ...MARKED, [PENDING_KEY]: pendingJson },
        (store) =>
          Effect.gen(function* () {
            yield* NativeSession.use((s) => s.complete(CODE))
            expect(seen.map((line) => line.split(" ")[1])).toEqual([
              "/api/token/refresh",
              "/api/token/revoke",
              "/api/native/session",
            ])
            expect(yield* Ref.get(store)).toEqual({
              [ACCESS_KEY]: "acc-new-session",
              [REFRESH_KEY]: "ref-new-session",
              [EXPIRES_KEY]: FAR_FUTURE,
            })
          }),
        fetch,
      )
    },
  )

  it.effect(
    "complete retries a marker kept by an offline start: revoke before the exchange, no marker after",
    () => {
      const sessionBody = {
        userId: USER,
        access: {
          accessToken: "acc-new-session",
          refreshToken: "ref-new-session",
          expiresAt: FAR_FUTURE,
        },
      }
      const rec = recording((path) => {
        if (path === "/api/native/session") {
          return json(200, sessionBody)
        }
        // The startup retry (the first refresh) cannot connect; every later call can.
        const refreshes = rec.seen.filter((line) => line.includes("/api/token/refresh")).length
        return path === "/api/token/refresh" && refreshes === 1
          ? Promise.reject(new TypeError("offline"))
          : retryServerUp(path)
      })
      return withMemory(
        { ...MARKED, [PENDING_KEY]: pendingJson },
        (store) =>
          Effect.gen(function* () {
            yield* NativeSession.use((s) => s.token)
            expect((yield* Ref.get(store))[PENDING_REVOKE_KEY]).toBe(REFRESH)
            yield* NativeSession.use((s) => s.complete(CODE))
            expect(rec.seen.map((line) => line.split(" ")[1])).toEqual([
              "/api/token/refresh",
              "/api/token/refresh",
              "/api/token/revoke",
              "/api/native/session",
            ])
            expect(yield* Ref.get(store)).toEqual({
              [ACCESS_KEY]: "acc-new-session",
              [REFRESH_KEY]: "ref-new-session",
              [EXPIRES_KEY]: FAR_FUTURE,
            })
          }),
        rec.fetch,
      )
    },
  )

  it.effect(
    "complete removes a marker the retry could not clear, so the new session survives the next start",
    () => {
      const rec = recording((path) =>
        path === "/api/native/session"
          ? json(200, {
              userId: USER,
              access: {
                accessToken: "acc-new-session",
                refreshToken: "ref-new-session",
                expiresAt: FAR_FUTURE,
              },
            })
          : json(503, {}),
      )
      return withMemory(
        { ...MARKED, [PENDING_KEY]: pendingJson },
        (store) =>
          Effect.gen(function* () {
            yield* NativeSession.use((s) => s.complete(CODE))
            expect(yield* Ref.get(store)).toEqual({
              [ACCESS_KEY]: "acc-new-session",
              [REFRESH_KEY]: "ref-new-session",
              [EXPIRES_KEY]: FAR_FUTURE,
            })
          }),
        rec.fetch,
      )
    },
  )

  it.effect("clear keeps the marker", () =>
    withMemory({ ...MARKED, ...pairEntries(FAR_FUTURE) }, (store) =>
      Effect.gen(function* () {
        yield* NativeSession.use((s) => s.clear)
        expect(yield* Ref.get(store)).toEqual(MARKED)
      }),
    ),
  )
})

describe("callbackFailure and copy", () => {
  it("reads error= as link-invalid and a missing code as rejected", () => {
    expect(callbackFailure({ error: "link_invalid" })).toEqual(Option.some("link-invalid"))
    expect(callbackFailure({ code: CODE, error: "link_invalid" })).toEqual(
      Option.some("link-invalid"),
    )
    expect(callbackFailure({})).toEqual(Option.some("rejected"))
    expect(callbackFailure({ code: "" })).toEqual(Option.some("rejected"))
    expect(callbackFailure({ code: CODE })).toEqual(Option.none())
  })

  it("explains each failure", () => {
    expect(nativeSignInFailureMessage("link-invalid")).toBe("That link expired. Request a new one.")
    expect(
      (["no-pending", "rejected", "unreachable", "storage"] as const).every(
        (reason) => nativeSignInFailureMessage(reason).length > 0,
      ),
    ).toBe(true)
  })
})

describe("NativeSession.token when the rotated pair cannot be stored (STLS-F6)", () => {
  /** A SecureStore whose writes fail while `broken` is true. */
  const flakyKv = (store: Store, broken: Ref.Ref<boolean>) => ({
    get: (key: string) => Ref.get(store).pipe(Effect.map((all) => Option.fromNullishOr(all[key]))),
    set: (key: string, value: string) =>
      Effect.gen(function* () {
        if (yield* Ref.get(broken)) {
          return yield* new NativeSignInFailed({ reason: "storage" })
        }
        yield* Ref.update(store, (all) => ({ ...all, [key]: value }))
      }),
    remove: (key: string) =>
      Ref.update(store, (all) =>
        Object.fromEntries(Object.entries(all).filter(([name]) => name !== key)),
      ),
  })
  const pkce = {
    randomBytes: () => Effect.succeed(RFC_BYTES),
    sha256: () => Effect.succeed(new Uint8Array()),
  }

  it.effect("refreshes with the unsaved pair, never the burned stored one, then stores it", () => {
    const bodies: Array<string> = []
    const pairs = [
      { accessToken: NEW_ACCESS, refreshToken: NEW_REFRESH, expiresAt: EXPIRES_IN_10_MIN },
      { accessToken: "acc-789", refreshToken: "ref-789", expiresAt: FAR_FUTURE },
    ]
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const body = await new Request(input, init).text()
      // biome-ignore lint/plugin/noMutation: test spy collecting what the fake server saw
      bodies.push(body)
      return new Response(JSON.stringify(pairs[bodies.length - 1]), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    return Effect.gen(function* () {
      const store: Store = yield* Ref.make<Readonly<Record<string, string>>>(
        pairEntries("1969-12-31T00:00:00.000Z"),
      )
      const broken = yield* Ref.make(true)
      yield* Effect.gen(function* () {
        expect(yield* NativeSession.use((s) => s.token)).toEqual(Option.some(NEW_ACCESS))
        // The store failed: the burned REFRESH is still on disk, the new pair only in memory.
        expect((yield* Ref.get(store))[REFRESH_KEY]).toBe(REFRESH)
        yield* TestClock.adjust("571 seconds")
        expect(yield* NativeSession.use((s) => s.token)).toEqual(Option.some("acc-789"))
        expect(bodies).toEqual([
          JSON.stringify({ refreshToken: REFRESH }),
          JSON.stringify({ refreshToken: NEW_REFRESH }),
        ])
        yield* Ref.set(broken, false)
        expect(yield* NativeSession.use((s) => s.token)).toEqual(Option.some("acc-789"))
        expect(yield* Ref.get(store)).toEqual({
          [ACCESS_KEY]: "acc-789",
          [REFRESH_KEY]: "ref-789",
          [EXPIRES_KEY]: FAR_FUTURE,
        })
        expect(bodies).toHaveLength(2)
      }).pipe(
        Effect.provide(
          NativeSession.layerWith({
            kv: flakyKv(store, broken),
            pkce,
            returnTo: Effect.succeed(RETURN_TO),
            baseUrl: Effect.succeed("http://api.test"),
          }).pipe(Layer.provide(FetchHttpClient.layer)),
        ),
        Effect.provideService(FetchHttpClient.Fetch, fetch),
      )
    })
  })
})
