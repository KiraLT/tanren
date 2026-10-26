import { describe, expect, it } from "@effect/vitest"
import { IntegrationRepo, type IntegrationRow } from "@tanren/db"
import { IdGenerator, Label, UserId } from "@tanren/shared"
import { Array as Arr, Clock, DateTime, Effect, Layer, Logger, Option, Redacted, Ref } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import { WorkerConfig, type WorkerConfigShape } from "../Config"
import { envVars } from "../testing/fixtures"
import { callbackRoutes } from "./callbackRoutes"
import { signState } from "./connect"
import { StravaApi, StravaRequestFailed, type TokenGrant } from "./StravaApi"
import { TokenSeal } from "./TokenSeal"

const env = { ...envVars, ALLOWED_ORIGINS: "http://localhost:8790" }
const config = WorkerConfig.fromEnvSync(env)
const WEB = "http://localhost:8790/settings/integrations"
const NATIVE = "exp://localhost:8081/--/settings/integrations"
const attacker = UserId.make("00000000-0000-4000-8000-0000000000a1")
const ACCESS = "secret-access-token-4f1c"
const REFRESH = "secret-refresh-token-9b2e"
const CODE = "one-time-code-77aa"

const grant: TokenGrant = {
  accessToken: Redacted.make(ACCESS),
  refreshToken: Redacted.make(REFRESH),
  expiresAt: DateTime.makeUnsafe("2026-10-27T12:00:00.000Z"),
  scope: "",
  athlete: { id: "12345", displayName: Label.make("Ada <b>Lovelace</b>") },
}

const harness = (
  opts: { readonly exchange: "ok" | "fail"; readonly config?: WorkerConfigShape } = {
    exchange: "ok",
  },
) =>
  Effect.runSync(
    Effect.gen(function* () {
      const upserts = yield* Ref.make<ReadonlyArray<IntegrationRow>>([])
      const exchanges = yield* Ref.make<ReadonlyArray<string>>([])
      const logs = yield* Ref.make<ReadonlyArray<string>>([])
      const capture = Logger.make(({ message, cause }) =>
        Effect.runSync(Ref.update(logs, Arr.append(`${JSON.stringify(message)} ${String(cause)}`))),
      )
      const strava = Layer.succeed(
        StravaApi,
        StravaApi.of({
          exchangeCode: (code) =>
            Ref.update(exchanges, Arr.append(code)).pipe(
              Effect.andThen(
                opts.exchange === "ok"
                  ? Effect.succeed(grant)
                  : Effect.fail(
                      new StravaRequestFailed({
                        reason: "provider_error",
                        status: Option.some(500),
                      }),
                    ),
              ),
            ),
          refresh: () => Effect.die("unused"),
          createActivity: () => Effect.die("unused"),
          revoke: () => Effect.die("unused"),
        }),
      )
      const repo = Layer.succeed(
        IntegrationRepo,
        IntegrationRepo.of({
          get: () => Effect.succeed(Option.none()),
          upsert: (row) => Ref.update(upserts, Arr.append(row)),
          setTokens: () => Effect.die("unused"),
          markRevoked: () => Effect.die("unused"),
          remove: () => Effect.die("unused"),
        }),
      )
      const deps = Layer.mergeAll(strava, repo, IdGenerator.layerTest, TokenSeal.layer).pipe(
        Layer.provideMerge(Layer.succeed(WorkerConfig, opts.config ?? config)),
      )
      const web = HttpRouter.toWebHandler(
        callbackRoutes.pipe(
          Layer.provide(deps),
          Layer.provide(HttpServer.layerServices),
          // Merged into the app's output context, so request fibers log through `capture` only.
          Layer.provideMerge(Logger.layer([capture])),
        ),
      )
      return { handler: web.handler, upserts, exchanges, logs }
    }),
  )

const state = (returnTo: string, ttlMs = 60_000, userId = attacker) =>
  Effect.runPromise(
    Effect.flatMap(Clock.currentTimeMillis, (now) =>
      signState(config, { userId, returnTo, expiresAt: now + ttlMs }),
    ),
  )

const get = (
  handler: (request: Request) => Promise<Response>,
  query: Record<string, string>,
  headers: Record<string, string> = {},
) =>
  handler(
    new Request(
      `http://localhost:8787/integrations/strava/callback?${new URLSearchParams(query)}`,
      { headers: { "cf-connecting-ip": "203.0.113.7", ...headers } },
    ),
  )

const expectSecureHeaders = (response: Response) => {
  expect(response.headers.get("cache-control")).toBe("no-store")
  expect(response.headers.get("referrer-policy")).toBe("no-referrer")
}

const read = <A>(ref: Ref.Ref<A>) => Effect.runSync(Ref.get(ref))

describe("GET /integrations/strava/callback", () => {
  it("answers a bad state with the 400 expired page and both headers, without exchanging", async () => {
    const h = harness()
    const response = await get(h.handler, { state: "bad", code: CODE, scope: "activity:write" })
    expect(response.status).toBe(400)
    expectSecureHeaders(response)
    expect(await response.text()).toContain("This link has expired. Start again from Settings.")
    expect(read(h.exchanges)).toEqual([])
  })

  it("answers an expired state with 400 and no exchange", async () => {
    const h = harness()
    const response = await get(h.handler, {
      state: await state(WEB, -1),
      code: CODE,
      scope: "activity:write",
    })
    expect(response.status).toBe(400)
    expectSecureHeaders(response)
    expect(read(h.exchanges)).toEqual([])
  })

  it("sends access_denied back as ?error=denied without exchanging", async () => {
    const h = harness()
    const response = await get(h.handler, { state: await state(WEB), error: "access_denied" })
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe(`${WEB}?error=denied`)
    expectSecureHeaders(response)
    expect(read(h.exchanges)).toEqual([])
  })

  it("sends a grant without activity:write back as ?error=scope and never calls exchangeCode", async () => {
    const h = harness()
    const response = await get(h.handler, { state: await state(WEB), code: CODE, scope: "read" })
    expect(response.headers.get("location")).toBe(`${WEB}?error=scope`)
    expect(read(h.exchanges)).toEqual([])
    expect(read(h.upserts)).toEqual([])
  })

  it("exchanges once, upserts sealed tokens and 303s a web returnTo to ?connected=strava", async () => {
    const h = harness()
    const response = await get(h.handler, {
      state: await state(WEB),
      code: CODE,
      scope: "read,activity:write",
    })
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe(`${WEB}?connected=strava`)
    expectSecureHeaders(response)
    expect(read(h.exchanges)).toEqual([CODE])
    const [row] = read(h.upserts)
    expect(row).toMatchObject({
      userId: attacker,
      provider: "strava",
      status: "active",
      externalId: "12345",
      displayName: "Ada <b>Lovelace</b>",
      scope: "read,activity:write",
    })
    expect(row?.accessToken.startsWith("v1.")).toBe(true)
    expect(row?.accessToken).not.toContain(ACCESS)
    expect(row?.refreshToken).not.toContain(REFRESH)
  })

  it("answers a native returnTo with a 200 page holding one escaped link", async () => {
    const h = harness()
    const response = await get(h.handler, {
      state: await state(NATIVE),
      code: CODE,
      scope: "activity:write",
    })
    expect(response.status).toBe(200)
    expectSecureHeaders(response)
    const body = await response.text()
    expect(body).toContain("Connected to Strava")
    expect(body).toContain(`href="${NATIVE}?connected=strava"`)
    expect(body).not.toContain("Lovelace")
  })

  it("sends a failed exchange back as ?error=provider and stores nothing", async () => {
    const h = harness({ exchange: "fail" })
    const response = await get(h.handler, {
      state: await state(WEB),
      code: CODE,
      scope: "activity:write",
    })
    expect(response.headers.get("location")).toBe(`${WEB}?error=provider`)
    expect(read(h.upserts)).toEqual([])
  })

  it("answers 429 after 10 calls a minute from one IP", async () => {
    const h = harness()
    // Sequential on purpose: each call must see the previous count.
    const statuses = await Arr.range(1, 11).reduce<Promise<ReadonlyArray<number>>>(
      async (previous) => {
        const done = await previous
        return [...done, (await get(h.handler, { state: "bad" })).status]
      },
      Promise.resolve([]),
    )
    expect(statuses.slice(0, 10)).toEqual(Arr.replicate(400, 10))
    expect(statuses[10]).toBe(429)
  })

  it("binds the row to the state's user and ignores a victim's cookie and bearer", async () => {
    const h = harness()
    await get(
      h.handler,
      { state: await state(WEB), code: CODE, scope: "activity:write" },
      {
        cookie: "better-auth.session_token=victim-session",
        authorization: "Bearer victim-token",
        "x-user": "00000000-0000-4000-8000-0000000000b2",
      },
    )
    expect(Arr.map(read(h.upserts), (row) => row.userId)).toEqual([attacker])
  })

  it("never logs the code, a token or the state", async () => {
    const h = harness()
    const signed = await state(WEB)
    await get(h.handler, { state: signed, code: CODE, scope: "activity:write" })
    await get(h.handler, { state: signed, code: CODE, scope: "read" })
    const failing = harness({ exchange: "fail" })
    await get(failing.handler, { state: signed, code: CODE, scope: "activity:write" })
    const lines = [...read(h.logs), ...read(failing.logs)]
    expect(lines.some((line) => line.includes("outcome=connected"))).toBe(true)
    expect(lines.some((line) => line.includes("reason=provider_error"))).toBe(true)
    const secrets = [CODE, ACCESS, REFRESH, signed, signed.split(".")[1] ?? signed]
    expect(lines.filter((line) => secrets.some((secret) => line.includes(secret)))).toEqual([])
  })
})

describe("console mode outside local (REV-2)", () => {
  it("answers 400 'not connected yet' with both headers, never exchanging or storing", async () => {
    const h = harness({ exchange: "ok", config: { ...config, environment: "production" } })
    const response = await get(h.handler, {
      state: await state(WEB),
      code: "console",
      scope: "read,activity:write",
    })
    expect(response.status).toBe(400)
    expectSecureHeaders(response)
    expect(await response.text()).toContain("Strava is not connected yet")
    expect(read(h.exchanges)).toEqual([])
    expect(read(h.upserts)).toEqual([])
  })
})
