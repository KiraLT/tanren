import { describe, expect, it } from "@effect/vitest"
import { PkceVerifier } from "@tanren/shared"
import { Array as Arr, Context, Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import { WorkerConfig } from "../Config"
import { envVars } from "../testing/fixtures"
import { authRoutes } from "./authRoutes"
import { BetterAuth, rateLimitFor } from "./BetterAuth"
import { CapturedEmails, EmailSender } from "./EmailSender"
import { challengeOf } from "./nativeCode"
import { Sessions } from "./Sessions"
import { SessionsLive } from "./SessionsLive"

const VERIFIER = PkceVerifier.make("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
const OTHER_VERIFIER = PkceVerifier.make("A".repeat(43))
const RETURN_TO = "exp://192.168.1.5:8081/--/auth/callback"
const EMAIL = "lukas@example.com"

/** Real memory Better Auth + captured email, served through `authRoutes` (as in `auth.test.ts`). */
const setup = (baseUrl: string) =>
  Effect.gen(function* () {
    const deps = SessionsLive.pipe(
      Layer.provideMerge(BetterAuth.layerMemory),
      Layer.provideMerge(EmailSender.layerCapture),
      Layer.provideMerge(WorkerConfig.layerFromEnv({ ...envVars, BETTER_AUTH_URL: baseUrl })),
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
    return { context, request, text, json }
  })

type Harness = Effect.Success<ReturnType<typeof setup>>

const completePath = (challenge: string, returnTo = RETURN_TO) =>
  `/auth/native/complete?${new URLSearchParams({ challenge, returnTo })}`

/** Steps 2–4: sign-in POST without `Origin` → captured link → verify → cookie + redirect. */
const verifyLink = (harness: Harness) =>
  Effect.gen(function* () {
    const challenge = yield* challengeOf(VERIFIER)
    const requested = yield* harness.request("/api/auth/sign-in/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json" }, // native fetch: no Origin, no cookie
      body: JSON.stringify({ email: EMAIL, callbackURL: completePath(challenge) }),
    })
    expect(requested.status).toBe(200)
    const sent = yield* Context.get(harness.context, CapturedEmails).sent
    const link = yield* Option.match(Arr.last(sent), {
      onNone: () => Effect.die("no magic link captured"),
      onSome: (mail) => Effect.succeed(mail.url),
    })
    const verified = yield* harness.request(link, { redirect: "manual" })
    const setCookies = verified.headers.getSetCookie()
    const cookie = setCookies.map((header) => header.split(";")[0] ?? "").join("; ")
    return { verified, setCookies, cookie }
  })

/** Step 5: the complete page → the code in its button. */
const completeAndExtract = (harness: Harness) =>
  Effect.gen(function* () {
    const { verified, cookie } = yield* verifyLink(harness)
    const location = verified.headers.get("location") ?? ""
    const page = yield* harness.request(location, { headers: { cookie } })
    const html = yield* harness.text(page)
    const code = /\?code=([A-Za-z0-9_.-]+)"/.exec(html)?.[1] ?? ""
    return { page, html, code, location }
  })

const exchange = (harness: Harness, body: unknown) =>
  harness.request("/api/native/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })

describe("native sign-in flow", () => {
  it.effect("link → complete page → exchange → Bearer-only Sessions.current → user", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      const { page, html, code, location } = yield* completeAndExtract(harness)
      expect(new URL(location, envVars.BETTER_AUTH_URL).pathname).toBe("/auth/native/complete")
      expect(page.status).toBe(200)
      expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8")
      expect(page.headers.get("cache-control")).toBe("no-store")
      expect(page.headers.get("referrer-policy")).toBe("no-referrer")
      expect(html).toContain(`http-equiv="refresh" content="0;url=${RETURN_TO}?code=`)
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

  it.effect("a replayed code is 400 invalid", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      const { code } = yield* completeAndExtract(harness)
      expect((yield* exchange(harness, { code, verifier: VERIFIER })).status).toBe(200)
      const replay = yield* exchange(harness, { code, verifier: VERIFIER })
      expect(replay.status).toBe(400)
      expect(yield* harness.json(replay)).toEqual({ _tag: "NativeCodeRejected", reason: "invalid" })
    }),
  )

  it.effect("a wrong verifier is 400 mismatch and does not consume the code", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      const { code } = yield* completeAndExtract(harness)
      const wrong = yield* exchange(harness, { code, verifier: OTHER_VERIFIER })
      expect(wrong.status).toBe(400)
      expect(yield* harness.json(wrong)).toEqual({ _tag: "NativeCodeRejected", reason: "mismatch" })
      expect((yield* exchange(harness, { code, verifier: VERIFIER })).status).toBe(200)
    }),
  )

  it.effect("an undecodable body is 400 malformed", () =>
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

describe("GET /auth/native/complete", () => {
  it.effect("a bad returnTo or challenge is a 400 page with no redirect", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      const challenge = yield* challengeOf(VERIFIER)
      const paths = [
        completePath(challenge, "https://evil.example/--/auth/callback"),
        completePath("short"),
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

  it.effect("?error= (expired or used link) sends the app error=link_invalid", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      const challenge = yield* challengeOf(VERIFIER)
      const response = yield* harness.request(`${completePath(challenge)}&error=EXPIRED_TOKEN`)
      expect(response.status).toBe(200)
      const html = yield* harness.text(response)
      expect(html).toContain(`href="${RETURN_TO}?error=link_invalid"`)
      expect(html).not.toContain("code=")
    }),
  )

  it.effect("no session cookie also sends the app error=link_invalid", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      const response = yield* harness.request(completePath(yield* challengeOf(VERIFIER)))
      expect(response.status).toBe(200)
      expect(yield* harness.text(response)).toContain(`${RETURN_TO}?error=link_invalid`)
    }),
  )
})

describe("Better Auth options (design §0 VERIFY)", () => {
  it.effect("the bare one-time-token endpoints are 404 over HTTP (disabledPaths)", () =>
    Effect.gen(function* () {
      const harness = yield* setup(envVars.BETTER_AUTH_URL)
      const { cookie } = yield* verifyLink(harness)
      const generate = yield* harness.request("/api/auth/one-time-token/generate", {
        headers: { cookie },
      })
      expect(generate.status).toBe(404)
      const verify = yield* harness.request("/api/auth/one-time-token/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "x".repeat(32) }),
      })
      expect(verify.status).toBe(404)
    }),
  )

  it.effect("session cookies on an http LAN baseURL are not Secure", () =>
    Effect.gen(function* () {
      const harness = yield* setup("http://192.168.1.5:8787")
      const { setCookies } = yield* verifyLink(harness)
      const session = setCookies.find((header) => header.includes("session_token=")) ?? ""
      expect(session).not.toBe("")
      expect(session.toLowerCase()).not.toContain("secure")
    }),
  )

  it("the rate limiter is forced on in production only, from ENVIRONMENT, not NODE_ENV", () => {
    expect(rateLimitFor("production")).toEqual({ enabled: true })
    expect(rateLimitFor("preview")).toEqual({})
    expect(rateLimitFor("local")).toEqual({})
  })
})
