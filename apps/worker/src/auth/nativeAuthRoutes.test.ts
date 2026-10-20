import { describe, expect, it, vi } from "@effect/vitest"
import { PkceVerifier } from "@tanren/shared"
import { Array as Arr, Context, Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import { WorkerConfig } from "../Config"
import { envVars } from "../testing/fixtures"
import { authRoutes } from "./authRoutes"
import { BetterAuth, rateLimitFor } from "./BetterAuth"
import { CapturedEmails, EmailSender } from "./EmailSender"
import { NATIVE_RATE_LIMIT } from "./nativeAuthRoutes"
import { challengeOf } from "./nativeCode"
import { Sessions } from "./Sessions"
import { SessionsLive } from "./SessionsLive"

// `it.live` throughout: Better Auth stamps sessions and tokens with `Date.now()`, and the routes
// compare them with Effect's live Clock (also `Date.now()`), so `vi.setSystemTime` moves both.
const VERIFIER = PkceVerifier.make("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
const OTHER_VERIFIER = PkceVerifier.make("A".repeat(43))
const RETURN_TO = "exp://192.168.1.5:8081/--/auth/callback"
const EMAIL = "lukas@example.com"
const MINUTE = 60 * 1000

/** Real memory Better Auth + captured email, served through `authRoutes` (as in `auth.test.ts`). */
const setup = (baseUrl: string) =>
  Effect.gen(function* () {
    const deps = SessionsLive.pipe(
      Layer.provideMerge(BetterAuth.layerMemory),
      Layer.provideMerge(EmailSender.layerCapture),
      Layer.provideMerge(
        WorkerConfig.layerFromEnv({
          ...envVars,
          BETTER_AUTH_URL: baseUrl,
          NATIVE_RETURN_HOSTS: "localhost,192.168.1.5",
        }),
      ),
    )
    const context = yield* Layer.build(deps)
    const { handler, dispose } = HttpRouter.toWebHandler(
      authRoutes.pipe(
        Layer.provide(Layer.succeedContext(context)),
        Layer.provide(HttpServer.layerServices),
      ),
      { disableLogger: true },
    )
    yield* Effect.addFinalizer(() => Effect.promise(dispose))
    const request = (input: string, init?: RequestInit) =>
      Effect.promise(() => handler(new Request(new URL(input, baseUrl), init)))
    const text = (response: Response) => Effect.promise(() => response.text())
    const json = (response: Response): Effect.Effect<unknown> =>
      Effect.promise(() => response.json())
    const lastLink = Effect.gen(function* () {
      const sent = yield* Context.get(context, CapturedEmails).sent
      return yield* Option.match(Arr.last(sent), {
        onNone: () => Effect.die("no magic link captured"),
        onSome: (mail) => Effect.succeed(mail.url),
      })
    })
    return { context, request, text, json, lastLink }
  })

type Harness = Effect.Success<ReturnType<typeof setup>>

const postJson = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers }, // native fetch: no Origin, no cookie
  body: typeof body === "string" ? body : JSON.stringify(body),
})

const cookieOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0] ?? "")
    .join("; ")

/** `POST /api/native/begin` → captured link → verify: the complete URL and Safari's cookie. */
const beginAndVerify = (harness: Harness) =>
  Effect.gen(function* () {
    const challenge = yield* challengeOf(VERIFIER)
    const begun = yield* harness.request(
      "/api/native/begin",
      postJson({ email: EMAIL, challenge, returnTo: RETURN_TO }),
    )
    expect(begun.status).toBe(200)
    expect(yield* harness.json(begun)).toEqual({ sent: true })
    const verified = yield* harness.request(yield* harness.lastLink, { redirect: "manual" })
    expect(verified.status).toBe(302)
    return { location: verified.headers.get("location") ?? "", cookie: cookieOf(verified) }
  })

const codeIn = (html: string) => /\?code=([A-Za-z0-9_.-]+)"/.exec(html)?.[1] ?? ""

/** The complete page for a verified link → the code in its button. */
const completeAndExtract = (harness: Harness) =>
  Effect.gen(function* () {
    const { location, cookie } = yield* beginAndVerify(harness)
    const page = yield* harness.request(location, { headers: { cookie } })
    const html = yield* harness.text(page)
    return { page, html, code: codeIn(html), location, cookie }
  })

const exchange = (harness: Harness, body: unknown) =>
  harness.request("/api/native/session", postJson(body))

/** Runs `effect` with `Date.now()` (Better Auth and the live Clock) shifted by `offsetMs`. */
const at = <A, E, R>(offsetMs: number, effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const real = Date.now()
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(real + offsetMs)
    }),
    () => effect,
    () => Effect.sync(() => vi.useRealTimers()),
  )

describe("native sign-in flow", () => {
  it.live("begin → link → complete page → exchange → Bearer-only Sessions.current → user", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      const { page, html, code, location } = yield* completeAndExtract(harness)
      const url = new URL(location, envVars.BETTER_AUTH_URL)
      expect(url.pathname).toBe("/auth/native/complete")
      expect([...url.searchParams.keys()]).toEqual(["challenge", "returnTo", "exp", "sig"])
      expect(page.status).toBe(200)
      expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8")
      expect(page.headers.get("cache-control")).toBe("no-store")
      expect(page.headers.get("referrer-policy")).toBe("no-referrer")
      expect(html).not.toContain("http-equiv") // a tap, no auto-redirect
      expect(html).toContain(`href="${RETURN_TO}?code=${code}"`)
      expect(code).toMatch(/^[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/)

      const response = yield* exchange(harness, { code, verifier: VERIFIER })
      expect(response.status).toBe(200)
      expect(response.headers.get("cache-control")).toBe("no-store")
      const body = yield* harness.json(response)
      expect(body).toMatchObject({ token: expect.any(String), userId: expect.any(String) })
      const { token, userId } = body as { token: string; userId: string } // shape asserted above

      const sessions = Context.get(harness.context, Sessions)
      const current = yield* sessions.current(new Headers({ authorization: `Bearer ${token}` }))
      expect(current).toEqual(Option.some(userId))
    }),
  )

  it.live("a replayed code is 400 invalid", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      const { code } = yield* completeAndExtract(harness)
      expect((yield* exchange(harness, { code, verifier: VERIFIER })).status).toBe(200)
      const replay = yield* exchange(harness, { code, verifier: VERIFIER })
      expect(replay.status).toBe(400)
      expect(yield* harness.json(replay)).toEqual({ _tag: "NativeCodeRejected", reason: "invalid" })
    }),
  )

  it.live("a code past its 5 minutes is 400 invalid", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      const { code } = yield* completeAndExtract(harness)
      const late = yield* at(6 * MINUTE, exchange(harness, { code, verifier: VERIFIER }))
      expect(late.status).toBe(400)
      expect(yield* harness.json(late)).toEqual({ _tag: "NativeCodeRejected", reason: "invalid" })
    }),
  )

  it.live("a wrong verifier is 400 mismatch and does not consume the code", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      const { code } = yield* completeAndExtract(harness)
      const wrong = yield* exchange(harness, { code, verifier: OTHER_VERIFIER })
      expect(wrong.status).toBe(400)
      expect(yield* harness.json(wrong)).toEqual({ _tag: "NativeCodeRejected", reason: "mismatch" })
      expect((yield* exchange(harness, { code, verifier: VERIFIER })).status).toBe(200)
    }),
  )

  it.live("an undecodable body is 400 malformed", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      const malformed = { _tag: "NativeCodeRejected", reason: "malformed" }
      const bodies = ["{}", "not json", { code: "abc", verifier: VERIFIER }]
      const answers = yield* Effect.forEach(bodies, (body) =>
        exchange(harness, body).pipe(
          Effect.flatMap((response) =>
            Effect.map(harness.json(response), (json) => ({ status: response.status, json })),
          ),
        ),
      )
      expect(answers).toEqual(Arr.replicate({ status: 400, json: malformed }, 3))
    }),
  )
})

describe("POST /api/native/begin", () => {
  it.live("refuses a returnTo on a host that is not pinned (400 return-to), sends nothing", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      const challenge = yield* challengeOf(VERIFIER)
      const response = yield* harness.request(
        "/api/native/begin",
        postJson({ email: EMAIL, challenge, returnTo: "exp://evil.example:8081/--/auth/callback" }),
      )
      expect(response.status).toBe(400)
      expect(yield* harness.json(response)).toEqual({
        _tag: "NativeBeginRejected",
        reason: "return-to",
      })
      expect(yield* Context.get(harness.context, CapturedEmails).sent).toEqual([])
    }),
  )

  it.live("an undecodable body is 400 malformed", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      const response = yield* harness.request("/api/native/begin", postJson({ email: EMAIL }))
      expect(response.status).toBe(400)
      expect(yield* harness.json(response)).toEqual({
        _tag: "NativeBeginRejected",
        reason: "malformed",
      })
    }),
  )
})

describe("GET /auth/native/complete", () => {
  it.live("a bad returnTo or challenge is a 400 page with no redirect", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      const challenge = yield* challengeOf(VERIFIER)
      const paths = [
        `/auth/native/complete?${new URLSearchParams({ challenge, returnTo: "https://evil.example/--/auth/callback" })}`,
        `/auth/native/complete?${new URLSearchParams({ challenge: "short", returnTo: RETURN_TO })}`,
        "/auth/native/complete",
      ]
      const answers = yield* Effect.forEach(paths, (path) =>
        harness.request(path, { redirect: "manual" }).pipe(
          Effect.flatMap((response) =>
            Effect.map(harness.text(response), (html) => ({
              status: response.status,
              location: response.headers.get("location"),
              broken: html.includes("This sign-in link is broken"),
            })),
          ),
        ),
      )
      expect(answers).toEqual(Arr.replicate({ status: 400, location: null, broken: true }, 3))
    }),
  )

  it.live("a tampered begin signature is refused (400, no code)", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      const { location, cookie } = yield* beginAndVerify(harness)
      const url = new URL(location, envVars.BETTER_AUTH_URL)
      const sig = url.searchParams.get("sig") ?? ""
      const tampered = new URLSearchParams([
        ...[...url.searchParams].filter(([key]) => key !== "sig"),
        ["sig", `${sig.startsWith("A") ? "B" : "A"}${sig.slice(1)}`],
      ])
      const response = yield* harness.request(`${url.pathname}?${tampered}`, {
        headers: { cookie },
      })
      expect(response.status).toBe(400)
      expect(codeIn(yield* harness.text(response))).toBe("")
    }),
  )

  it.live("session-export CSRF: a foreign challenge and an old session give no code", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      // The victim signed in 10 minutes ago (Safari holds a Lax session cookie).
      const { location, cookie } = yield* at(-10 * MINUTE, beginAndVerify(harness))
      const url = new URL(location, envVars.BETTER_AUTH_URL)
      // The attacker swaps in their own challenge (they hold its verifier), keeping the rest.
      const foreign = new URLSearchParams(url.searchParams)
      foreign.set("challenge", yield* challengeOf(OTHER_VERIFIER))
      const crafted = yield* harness.request(`${url.pathname}?${foreign}`, { headers: { cookie } })
      expect(crafted.status).toBe(400)
      expect(codeIn(yield* harness.text(crafted))).toBe("")
      // Even the genuine URL no longer yields a code once the session is not fresh.
      const replayed = yield* harness.request(location, { headers: { cookie } })
      const html = yield* harness.text(replayed)
      expect(codeIn(html)).toBe("")
      expect(html).toContain(`${RETURN_TO}?error=link_invalid`)
    }),
  )

  it.live("?error= (expired or used link) sends the app error=link_invalid", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      const { location } = yield* beginAndVerify(harness)
      const response = yield* harness.request(`${location}&error=EXPIRED_TOKEN`)
      expect(response.status).toBe(200)
      const html = yield* harness.text(response)
      expect(html).toContain(`href="${RETURN_TO}?error=link_invalid"`)
      expect(codeIn(html)).toBe("")
    }),
  )

  it.live("no session cookie also sends the app error=link_invalid", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      const { location } = yield* beginAndVerify(harness)
      const response = yield* harness.request(location)
      expect(response.status).toBe(200)
      expect(yield* harness.text(response)).toContain(`${RETURN_TO}?error=link_invalid`)
    }),
  )
})

describe("rate limit", () => {
  it.live("the 11th request in a minute from one IP is 429 NativeRateLimited", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      const ip = { "cf-connecting-ip": "203.0.113.7" }
      const statuses = yield* Effect.forEach(Arr.range(1, NATIVE_RATE_LIMIT.max), () =>
        Effect.map(
          harness.request("/api/native/session", postJson({}, ip)),
          (response) => response.status,
        ),
      )
      expect(statuses).toEqual(Arr.replicate(400, NATIVE_RATE_LIMIT.max))
      const limited = yield* harness.request("/api/native/session", postJson({}, ip))
      expect(limited.status).toBe(429)
      expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0)
      expect(yield* harness.json(limited)).toMatchObject({ _tag: "NativeRateLimited" })
      const otherIp = { "cf-connecting-ip": "203.0.113.8" }
      expect((yield* harness.request("/api/native/session", postJson({}, otherIp))).status).toBe(
        400,
      )
    }),
  )
})

describe("Better Auth options (design §0 VERIFY)", () => {
  /** Plain magic-link sign-in: Safari's cookies as set by verify. */
  const plainSignIn = (harness: Harness) =>
    Effect.gen(function* () {
      const requested = yield* harness.request(
        "/api/auth/sign-in/magic-link",
        postJson({ email: EMAIL, callbackURL: "/" }),
      )
      expect(requested.status).toBe(200)
      return yield* harness.request(yield* harness.lastLink, { redirect: "manual" })
    })

  it.live("the bare one-time-token endpoints are 404 over HTTP (disabledPaths)", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      const cookie = cookieOf(yield* plainSignIn(harness))
      const generate = yield* harness.request("/api/auth/one-time-token/generate", {
        headers: { cookie },
      })
      expect(generate.status).toBe(404)
      const verify = yield* harness.request(
        "/api/auth/one-time-token/verify",
        postJson({ token: "x".repeat(32) }),
      )
      expect(verify.status).toBe(404)
    }),
  )

  it.live("session cookies on an http LAN baseURL are not Secure", () =>
    Effect.gen(function* () {
      const harness = yield* setup("http://192.168.1.5:8787")
      const verified = yield* plainSignIn(harness)
      const session =
        verified.headers.getSetCookie().find((header) => header.includes("session_token=")) ?? ""
      expect(session).not.toBe("")
      expect(session.toLowerCase()).not.toContain("secure")
    }),
  )

  it.live("cookie-setting /api/auth responses never carry set-auth-token (bearer plugin)", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      // Precondition: Better Auth's own handler does emit it on verify.
      yield* plainSignIn(harness).pipe(Effect.asVoid) // the first link is spent here
      yield* harness.request(
        "/api/auth/sign-in/magic-link",
        postJson({ email: EMAIL, callbackURL: "/" }),
      )
      const auth = yield* Context.get(harness.context, BetterAuth).auth
      const link = yield* harness.lastLink
      const raw = yield* Effect.promise(() => auth.handler(new Request(link)))
      expect(raw.headers.get("set-auth-token")).not.toBeNull()

      const verified = yield* plainSignIn(harness)
      expect(verified.headers.getSetCookie().length).toBeGreaterThan(0)
      expect(verified.headers.get("set-auth-token")).toBeNull()
      expect(verified.headers.get("access-control-expose-headers") ?? "").not.toContain(
        "set-auth-token",
      )
    }),
  )

  it("the rate limiter is forced on in production only, from ENVIRONMENT, not NODE_ENV", () => {
    expect(rateLimitFor("production")).toEqual({ enabled: true })
    expect(rateLimitFor("preview")).toEqual({})
    expect(rateLimitFor("local")).toEqual({})
  })
})
