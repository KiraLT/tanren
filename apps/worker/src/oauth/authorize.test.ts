import { describe, expect, it } from "@effect/vitest"
import { SessionStoreUnavailable, UserId } from "@tanren/shared"
import { Context, Effect, Layer, Option } from "effect"
import { BetterAuth } from "../auth/BetterAuth"
import { CapturedEmails, EmailSender } from "../auth/EmailSender"
import { Sessions } from "../auth/Sessions"
import { envVars } from "../testing/fixtures"
import { makeAuthorize, safeNext } from "./authorize"
import { FAKE_CLIENT_ID, FakeOAuth, OAuthApi, type OAuthApiShape, OAuthFailure } from "./OAuthApi"
import { escapeHtml } from "./pages"

const BASE = "http://localhost:8787"
const owner = UserId.make("00000000-0000-4000-8000-0000000000a1")
// Node has no `ExecutionContext`; `makeAuthorize` never reads it, so an empty stand-in is enough.
const ctx = { props: {} } as unknown as ExecutionContext

const REDIRECT = "http://localhost:33418/callback"
const authorizeQuery = (overrides: Readonly<Record<string, string>> = {}) =>
  new URLSearchParams({
    response_type: "code",
    client_id: FAKE_CLIENT_ID,
    redirect_uri: REDIRECT,
    scope: "tanren:read tanren:write",
    state: "st-1",
    code_challenge: "abc",
    code_challenge_method: "S256",
    ...overrides,
  }).toString()

const form = (entries: ReadonlyArray<readonly [string, string]>): RequestInit => ({
  method: "POST",
  headers: { origin: BASE },
  body: new URLSearchParams(entries.map(([key, value]) => [key, value])),
})

/** A fresh authorize handler: memory Better Auth with captured email, fixed sessions, fake provider. */
const setup = (
  sessions: Layer.Layer<Sessions>,
  override: (api: OAuthApiShape) => OAuthApiShape = (api) => api,
) =>
  Effect.gen(function* () {
    const emails = yield* Layer.build(EmailSender.layerCapture)
    const fake = yield* Layer.build(OAuthApi.layerFake)
    const api = OAuthApi.of(override(Context.get(fake, OAuthApi)))
    const authorize = makeAuthorize(envVars, {
      betterAuth: BetterAuth.layerMemory.pipe(Layer.provide(Layer.succeedContext(emails))),
      sessions,
      oauth: () => Option.some(Layer.succeed(OAuthApi, api)),
    })
    yield* Effect.addFinalizer(() => Effect.promise(authorize.dispose))
    const call = (path: string, init?: RequestInit) =>
      Effect.promise(() => authorize.handle(new Request(new URL(path, BASE), init), {}, ctx))
    const text = (response: Response) => Effect.promise(() => response.text())
    return {
      call,
      text,
      sent: Context.get(emails, CapturedEmails).sent,
      completions: Context.get(fake, FakeOAuth).completions,
    }
  })

const signedOut = Sessions.layerFixed(Option.none())
const signedIn = Sessions.layerFixed(Option.some(owner))

describe("GET /authorize", () => {
  it.effect("shows the login page with next = this URL when signed out", () =>
    Effect.gen(function* () {
      const { call, text } = yield* setup(signedOut)
      const query = authorizeQuery()
      const response = yield* call(`/authorize?${query}`)
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8")
      const body = yield* text(response)
      expect(body).toContain('action="/authorize/login"')
      expect(body).toContain(`name="next" value="${escapeHtml(`/authorize?${query}`)}"`)
    }),
  )

  it.effect("shows the consent page with the handle, both scopes and the provider headers", () =>
    Effect.gen(function* () {
      const { call, text } = yield* setup(signedIn)
      const response = yield* call(`/authorize?${authorizeQuery()}`)
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8")
      expect(response.headers.get("set-cookie")).toContain("__Host-oauth-consent=handle-1")
      expect(response.headers.get("x-frame-options")).toBe("DENY")
      const body = yield* text(response)
      expect(body).toContain('name="handle" value="handle-1"')
      expect(body).toContain('value="tanren:read" checked')
      expect(body).toContain('value="tanren:write" checked')
      expect(body).toContain("Read your training history and current plan")
      expect(body).toContain("Write plan weeks, log sessions and update your profile")
      expect(body).toContain("localhost:33418")
      // The client name is attacker-controlled: escaped, never raw markup.
      expect(body).not.toContain("<script>")
      expect(body).toContain("&lt;script&gt;")
    }),
  )

  it.effect("renders a 400 page, not a redirect, when the client is unknown", () =>
    Effect.gen(function* () {
      const { call, text } = yield* setup(signedIn)
      const response = yield* call(`/authorize?${authorizeQuery({ client_id: "nobody" })}`)
      expect(response.status).toBe(400)
      expect(response.headers.get("location")).toBeNull()
      expect(yield* text(response)).toContain("Invalid client_id")
    }),
  )

  it.effect("redirects the error to the client when the provider validated the redirect", () =>
    Effect.gen(function* () {
      const { call } = yield* setup(signedIn)
      const response = yield* call(`/authorize?${authorizeQuery({ response_type: "token" })}`)
      expect(response.status).toBe(302)
      const location = new URL(response.headers.get("location") ?? "")
      expect(`${location.origin}${location.pathname}`).toBe(REDIRECT)
      expect(location.searchParams.get("error")).toBe("unsupported_response_type")
      expect(location.searchParams.get("state")).toBe("st-1")
    }),
  )

  it.effect("answers 503 when the session store is down", () =>
    Effect.gen(function* () {
      const { call } = yield* setup(
        Layer.succeed(
          Sessions,
          Sessions.of({
            current: () => Effect.fail(new SessionStoreUnavailable({ message: "down" })),
          }),
        ),
      )
      const response = yield* call(`/authorize?${authorizeQuery()}`)
      expect(response.status).toBe(503)
      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8")
    }),
  )
})

describe("POST /authorize/login", () => {
  it.effect("refuses a next that is not a same-origin /authorize? URL", () =>
    Effect.gen(function* () {
      const { call, sent } = yield* setup(signedOut)
      const foreign = [
        "https://evil.example/authorize?x=1",
        "//evil.example/authorize?x=1",
        "/api/auth/sign-out?x=1",
        "/authorize",
      ]
      const statuses = yield* Effect.forEach(foreign, (next) =>
        call(
          "/authorize/login",
          form([
            ["email", "lukas@example.com"],
            ["next", next],
          ]),
        ).pipe(Effect.map((response) => response.status)),
      )
      expect(statuses).toEqual([400, 400, 400, 400])
      expect(yield* sent).toEqual([])
    }),
  )

  it.effect("sends the magic link with callbackURL = next and shows the check-email page", () =>
    Effect.gen(function* () {
      const { call, text, sent } = yield* setup(signedOut)
      const next = `/authorize?${authorizeQuery()}`
      const response = yield* call(
        "/authorize/login",
        form([
          ["email", "lukas@example.com"],
          ["next", next],
        ]),
      )
      expect(response.status).toBe(200)
      expect(yield* text(response)).toContain("lukas@example.com")
      const mails = yield* sent
      expect(mails.map((mail) => mail.email)).toEqual(["lukas@example.com"])
      const link = new URL(mails[0]?.url ?? "")
      expect(link.pathname).toBe("/api/auth/magic-link/verify")
      expect(link.searchParams.get("callbackURL")).toBe(next)
    }),
  )

  it.effect("rejects a missing email with 400", () =>
    Effect.gen(function* () {
      const { call } = yield* setup(signedOut)
      const response = yield* call(
        "/authorize/login",
        form([["next", `/authorize?${authorizeQuery()}`]]),
      )
      expect(response.status).toBe(400)
    }),
  )
})

describe("defects", () => {
  it.effect("a dying provider helper is a 503 page, never a 500", () =>
    Effect.gen(function* () {
      const { call } = yield* setup(signedIn, (api) => ({
        ...api,
        parseAuthRequest: () => Effect.die(new Error("provider bug")),
      }))
      const response = yield* call(`/authorize?${authorizeQuery()}`)
      expect(response.status).toBe(503)
      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8")
    }),
  )
})

describe("POST /authorize", () => {
  it.effect("deny → 302 access_denied with the provider headers", () =>
    Effect.gen(function* () {
      const { call, completions } = yield* setup(signedIn)
      yield* call(`/authorize?${authorizeQuery()}`)
      const response = yield* call(
        "/authorize",
        form([
          ["handle", "handle-1"],
          ["decision", "deny"],
          ["scope", "tanren:read"],
        ]),
      )
      expect(response.status).toBe(302)
      const location = new URL(response.headers.get("location") ?? "")
      expect(location.searchParams.get("error")).toBe("access_denied")
      expect(location.searchParams.get("state")).toBe("st-1")
      expect(response.headers.get("set-cookie")).toContain("Max-Age=0")
      expect(yield* completions).toEqual([])
    }),
  )

  it.effect("approve → 302 to redirectTo with props { userId (from the session), scopes }", () =>
    Effect.gen(function* () {
      const { call, completions } = yield* setup(signedIn)
      yield* call(`/authorize?${authorizeQuery()}`)
      const response = yield* call(
        "/authorize",
        form([
          ["handle", "handle-1"],
          ["decision", "approve"],
          ["scope", "tanren:read"],
          ["scope", "tanren:admin"],
          ["userId", "00000000-0000-4000-8000-0000000000ff"],
        ]),
      )
      expect(response.status).toBe(302)
      const location = new URL(response.headers.get("location") ?? "")
      expect(location.searchParams.get("code")).toBe("fake-code")
      expect(response.headers.get("set-cookie")).toContain("Max-Age=0")
      const done = yield* completions
      expect(done.map(({ userId, scope, props }) => ({ userId, scope, props }))).toEqual([
        {
          userId: owner,
          scope: ["tanren:read"],
          props: { userId: owner, scopes: ["tanren:read"] },
        },
      ])
    }),
  )

  it.effect("a handle works once: the replay is a 400 page", () =>
    Effect.gen(function* () {
      const { call } = yield* setup(signedIn)
      yield* call(`/authorize?${authorizeQuery()}`)
      const approve = form([
        ["handle", "handle-1"],
        ["decision", "approve"],
        ["scope", "tanren:read"],
      ])
      expect((yield* call("/authorize", approve)).status).toBe(302)
      const replay = yield* call(
        "/authorize",
        form([
          ["handle", "handle-1"],
          ["decision", "approve"],
          ["scope", "tanren:read"],
        ]),
      )
      expect(replay.status).toBe(400)
    }),
  )

  it.effect("approve with no ticked scope, or only foreign ones, takes the deny path", () =>
    Effect.gen(function* () {
      const { call, completions } = yield* setup(signedIn)
      yield* call(`/authorize?${authorizeQuery()}`)
      yield* call(`/authorize?${authorizeQuery()}`)
      const none = yield* call(
        "/authorize",
        form([
          ["handle", "handle-1"],
          ["decision", "approve"],
        ]),
      )
      const foreign = yield* call(
        "/authorize",
        form([
          ["handle", "handle-2"],
          ["decision", "approve"],
          ["scope", "tanren:admin"],
        ]),
      )
      const errors = [none, foreign].map((response) =>
        new URL(response.headers.get("location") ?? "").searchParams.get("error"),
      )
      expect([none.status, foreign.status]).toEqual([302, 302])
      expect(errors).toEqual(["access_denied", "access_denied"])
      expect(yield* completions).toEqual([])
    }),
  )

  it.effect("a tampered form cannot grant a scope the client did not request", () =>
    Effect.gen(function* () {
      const { call, completions } = yield* setup(signedIn)
      yield* call(`/authorize?${authorizeQuery({ scope: "tanren:read" })}`)
      yield* call(`/authorize?${authorizeQuery({ scope: "tanren:read" })}`)
      const widened = yield* call(
        "/authorize",
        form([
          ["handle", "handle-1"],
          ["decision", "approve"],
          ["scope", "tanren:read"],
          ["scope", "tanren:write"],
        ]),
      )
      const writeOnly = yield* call(
        "/authorize",
        form([
          ["handle", "handle-2"],
          ["decision", "approve"],
          ["scope", "tanren:write"],
        ]),
      )
      expect([widened.status, writeOnly.status]).toEqual([302, 400])
      const done = yield* completions
      expect(done.map(({ scope, props }) => ({ scope, scopes: props.scopes }))).toEqual([
        { scope: ["tanren:read"], scopes: ["tanren:read"] },
      ])
    }),
  )

  it.effect("a request without scope offers both scopes and can be granted both", () =>
    Effect.gen(function* () {
      const { call, text, completions } = yield* setup(signedIn)
      const page = yield* text(yield* call(`/authorize?${authorizeQuery({ scope: "" })}`))
      expect(page).toContain('value="tanren:read" checked')
      expect(page).toContain('value="tanren:write" checked')
      const response = yield* call(
        "/authorize",
        form([
          ["handle", "handle-1"],
          ["decision", "approve"],
          ["scope", "tanren:read"],
          ["scope", "tanren:write"],
        ]),
      )
      expect(response.status).toBe(302)
      const done = yield* completions
      expect(done.map(({ props }) => props.scopes)).toEqual([["tanren:read", "tanren:write"]])
    }),
  )

  it.effect("a missing handle or a non-form body is a 400 page", () =>
    Effect.gen(function* () {
      const { call } = yield* setup(signedIn)
      const noHandle = yield* call("/authorize", form([["decision", "approve"]]))
      const json = yield* call("/authorize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle: "handle-1", decision: "approve" }),
      })
      expect([noHandle.status, json.status]).toEqual([400, 400])
    }),
  )

  it.effect("approve while signed out → 401 page, nothing completed", () =>
    Effect.gen(function* () {
      const { call, completions } = yield* setup(signedOut)
      const response = yield* call(
        "/authorize",
        form([
          ["handle", "handle-1"],
          ["decision", "approve"],
          ["scope", "tanren:read"],
        ]),
      )
      expect(response.status).toBe(401)
      expect(yield* completions).toEqual([])
    }),
  )
})

describe("makeAuthorize without the provider helpers", () => {
  it.effect("answers 503 when env.OAUTH_PROVIDER is missing", () =>
    Effect.gen(function* () {
      const emails = yield* Layer.build(EmailSender.layerCapture)
      const authorize = makeAuthorize(envVars, {
        betterAuth: BetterAuth.layerMemory.pipe(Layer.provide(Layer.succeedContext(emails))),
        sessions: signedIn,
      })
      yield* Effect.addFinalizer(() => Effect.promise(authorize.dispose))
      const response = yield* Effect.promise(() =>
        authorize.handle(new Request(`${BASE}/authorize?${authorizeQuery()}`), {}, ctx),
      )
      expect(response.status).toBe(503)
    }),
  )
})

describe("helpers", () => {
  it("safeNext keeps only same-origin /authorize? paths", () => {
    expect(safeNext("/authorize?a=1", BASE)).toEqual(Option.some("/authorize?a=1"))
    expect(safeNext("/authorize/login?a=1", BASE)).toEqual(Option.none())
    expect(safeNext("http://localhost:8787/authorize?a=1", BASE)).toEqual(Option.none())
    expect(safeNext("/\\evil.example/authorize?a=1", BASE)).toEqual(Option.none())
  })

  it("OAuthFailure keeps an AuthorizationError's code and redirect", () => {
    const fromProvider = OAuthFailure.fromRejection({
      name: "AuthorizationError",
      code: "invalid_scope",
      description: "bad scope",
      redirectTo: "http://localhost:1/cb?error=invalid_scope",
    })
    expect(fromProvider.code).toEqual(Option.some("invalid_scope"))
    expect(fromProvider.redirectTo).toEqual(
      Option.some("http://localhost:1/cb?error=invalid_scope"),
    )
    const local = OAuthFailure.fromRejection({
      name: "AuthorizationError",
      code: "invalid_request",
      description: "Invalid client_id",
      redirectTo: undefined,
    })
    expect(local.redirectTo).toEqual(Option.none())
    const plain = OAuthFailure.fromRejection(new Error("boom"))
    expect(plain).toMatchObject({ message: "boom", code: Option.none(), redirectTo: Option.none() })
  })

  it("escapeHtml escapes markup and both quote styles", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    )
  })
})
