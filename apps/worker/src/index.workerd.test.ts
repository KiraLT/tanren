import {
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
} from "cloudflare:test"
import { env } from "cloudflare:workers"
import { afterAll, describe, expect, it } from "@effect/vitest"
import { ActivityExportRepo, SealedToken as DbSealedToken, IntegrationRepo } from "@tanren/db"
import { Exercise, IdGenerator, PullResponse, PushResponse, UserId, Uuid } from "@tanren/shared"
import { Array as Arr, Clock, DateTime, Effect, Layer, Option, Redacted, Schema } from "effect"
import { type App, d1Persistence, makeApp } from "./app"
import { DEV_USER_EMAIL, DEV_USER_ID } from "./auth/devUser"
import { Sessions } from "./auth/Sessions"
import { FAKE_INTEGRATION_TOKEN_KEY, WorkerConfig } from "./Config"
import worker from "./index"
import { signState } from "./integrations/connect"
import { ExportQueue } from "./integrations/ExportQueue"
import { TokenSeal } from "./integrations/TokenSeal"
import { DEV_PRINCIPAL, McpAuth } from "./mcp/McpAuth"
import { makeMcp } from "./mcp/McpRoute"
import { writeTools } from "./mcp/writeTools"
import { D1Layer, ExerciseRepo, Repositories } from "./repos"
import { exercise } from "./sync/fixtures"
import { countingD1 } from "./testing/countingD1"
import { envVars } from "./testing/fixtures"

// The bundle that ships: the default export of `src/index.ts`, driven through `fetch(request, env,
// ctx)` on a migrated D1 with the `vars` of wrangler.test.jsonc (BETTER_AUTH_URL :8787).
const BASE = "http://localhost:8787"
const ORIGIN = "http://localhost:8081"
const T0 = "2026-10-19T08:00:00.000Z"
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`

const call = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const ctx = createExecutionContext()
  const response = await worker.fetch(new Request(`${BASE}${path}`, init), env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

const json = (cookie: string, method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json", origin: ORIGIN, cookie },
  body: JSON.stringify(body),
})

const WireRow = Schema.Record(Schema.String, Schema.Unknown)
const VerificationRow = Schema.Struct({ identifier: Schema.String })
const SessionBody = Schema.Struct({ user: Schema.Struct({ id: Schema.String }) })

/**
 * Real Better Auth session: POST /api/auth/sign-in/magic-link → the token from the D1
 * `verification` row (`identifier = "magic-link:<token>"`, plain storage) → GET
 * /api/auth/magic-link/verify → `better-auth.session_token` cookie. The dev email maps to DEV_USER_ID.
 */
const signIn = async (email: string = DEV_USER_EMAIL): Promise<string> => {
  const sent = await call(
    "/api/auth/sign-in/magic-link",
    json("", "POST", { email, callbackURL: "/" }),
  )
  expect(sent.status).toBe(200)
  const row = Schema.decodeUnknownSync(VerificationRow)(
    await env.DB.prepare(
      "SELECT identifier FROM verification WHERE identifier LIKE 'magic-link:%' ORDER BY createdAt DESC",
    ).first(),
  )
  const token = row.identifier.slice("magic-link:".length)
  const verified = await call(
    `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&callbackURL=%2F`,
  )
  expect(verified.status).toBe(302)
  const cookie = Arr.map(verified.headers.getSetCookie(), (header) => header.split(";")[0] ?? "")
  expect(cookie.join("; ")).toContain("better-auth.session_token=")
  return cookie.join("; ")
}

/** One sign-in per file, shared by every test that needs a cookie. */
const session = Effect.runSync(Effect.cached(Effect.promise(() => signIn())))
const cookie = () => Effect.runPromise(session)

describe("src/index.ts default export in workerd", () => {
  it("GET /health → 200", async () => {
    const response = await call("/health")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it("GET /api/auth/get-session without a cookie → Better Auth's 200 null, never 500", async () => {
    const response = await call("/api/auth/get-session")
    expect(response.status).toBe(200)
    expect(await response.json()).toBeNull()
  })

  it("POST /mcp without a bearer → 401 with the protected-resource metadata challenge", async () => {
    const response = await call("/mcp", {
      method: "POST",
      headers: {
        host: "localhost:8787",
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    })
    expect(response.status).toBe(401)
    const challenge = response.headers.get("WWW-Authenticate") ?? ""
    expect(challenge).toMatch(/^Bearer /)
    expect(challenge).toContain(
      'resource_metadata="http://localhost:8787/.well-known/oauth-protected-resource/mcp"',
    )
  })

  it("stateless OAuth through the default export: register → consent → token → /mcp → refresh", async () => {
    const redirect = "http://localhost:33419/callback"
    const registered = await call("/oauth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: [redirect], client_name: "index test" }),
    })
    expect(registered.status).toBe(201)
    const clientId = Schema.decodeUnknownSync(Schema.Struct({ client_id: Schema.String }))(
      await registered.json(),
    ).client_id
    const verifier = "index-test-verifier-0123456789-abcdefghijklmnopqrstuvwxyz"
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
    const query = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirect,
      scope: "tanren:read tanren:write",
      state: "ix",
      code_challenge: challenge,
      code_challenge_method: "S256",
    })
    const session = await cookie()
    const consent = await call(`/authorize?${query.toString()}`, { headers: { cookie: session } })
    expect(consent.status).toBe(200)
    const handle = /name="handle" value="([^"]+)"/.exec(await consent.text())?.[1] ?? ""
    const binding = Arr.map(consent.headers.getSetCookie(), (h) => h.split(";")[0] ?? "")
    const approved = await call("/authorize", {
      method: "POST",
      headers: { cookie: [session, ...binding].join("; "), origin: BASE },
      body: new URLSearchParams([
        ["handle", handle],
        ["decision", "approve"],
        ["scope", "tanren:read"],
        ["scope", "tanren:write"],
      ]),
    })
    expect(approved.status).toBe(302)
    const location = new URL(approved.headers.get("location") ?? "")
    expect(location.searchParams.get("state")).toBe("ix")
    const token = await call("/oauth/token", {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: location.searchParams.get("code") ?? "",
        redirect_uri: redirect,
        client_id: clientId,
        code_verifier: verifier,
      }),
    })
    expect(token.status).toBe(200)
    expect(token.headers.get("cache-control")).toBe("no-store")
    const pair = Schema.decodeUnknownSync(
      Schema.Struct({ access_token: Schema.String, refresh_token: Schema.String }),
    )(await token.json())
    const tools = await call("/mcp", {
      method: "POST",
      headers: {
        host: "localhost:8787",
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        authorization: `Bearer ${pair.access_token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    })
    expect(tools.status).toBe(200)
    expect(await tools.text()).toContain('"get_overview"')
    const refreshed = await call("/oauth/token", {
      method: "POST",
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: pair.refresh_token }),
    })
    expect(refreshed.status).toBe(200)
  })

  it("the magic-link cookie is a real session for the dev user", async () => {
    const response = await call("/api/auth/get-session", { headers: { cookie: await cookie() } })
    expect(response.status).toBe(200)
    expect(Schema.decodeUnknownSync(SessionBody)(await response.json()).user.id).toBe(DEV_USER_ID)
  })

  it("GET /exercises without a cookie → 401", async () => {
    expect((await call("/exercises")).status).toBe(401)
  })

  it("POST /exercises → GET /exercises round trip on D1", async () => {
    const auth = await cookie()
    const created = await call(
      "/exercises",
      json(auth, "POST", { name: "Front Squat", aliases: [], muscleGroups: [], notes: null }),
    )
    expect(created.status).toBe(200)
    const row = Schema.decodeUnknownSync(Exercise)(await created.json())
    expect(row.userId).toBe(DEV_USER_ID)
    const listed = await call("/exercises", { headers: { cookie: auth } })
    expect(listed.status).toBe(200)
    const all = Schema.decodeUnknownSync(Schema.Array(Exercise))(await listed.json())
    expect(Arr.map(all, (each) => [each.id, each.name])).toContainEqual([row.id, "Front Squat"])
  })

  it("/sync/push → /sync/pull through the real SyncStore: accept, reject, LWW tie", async () => {
    const auth = await cookie()
    // The server row the tie targets; its encoded form is what a client would hold.
    const created = await call(
      "/exercises",
      json(auth, "POST", { name: "Tie Row", aliases: [], muscleGroups: [], notes: null }),
    )
    const server = Schema.decodeUnknownSync(WireRow)(await created.json())
    const tieId = Schema.decodeUnknownSync(Schema.String)(server.id)
    const fresh = {
      id: id(0x501),
      userId: DEV_USER_ID,
      createdAt: T0,
      updatedAt: T0,
      deletedAt: null,
      name: "Pushed Row",
      aliases: [],
      muscleGroups: [],
      notes: null,
    }
    const orphanWeek = {
      id: id(0x502),
      userId: DEV_USER_ID,
      createdAt: T0,
      updatedAt: T0,
      deletedAt: null,
      planId: id(0x5ff),
      weekStart: "2026-10-19",
      intent: null,
    }
    const pushed = await call(
      "/sync/push",
      json(auth, "POST", {
        changes: [
          { table: "exercise", row: fresh },
          { table: "planWeek", row: orphanWeek },
          // Same updatedAt as the server row: SyncStore accepts only a strictly newer updatedAt,
          // so a tie goes to `conflicts` carrying the server row (server wins).
          { table: "exercise", row: { ...server, name: "Tie Loses" } },
        ],
      }),
    )
    expect(pushed.status).toBe(200)
    const result = Schema.decodeUnknownSync(PushResponse)(await pushed.json())
    expect(Arr.map(result.accepted, (change) => change.id)).toEqual([id(0x501)])
    expect(Arr.map(result.rejected, ({ table, id, reason }) => ({ table, id, reason }))).toEqual([
      { table: "planWeek", id: id(0x502), reason: "missingParent" },
    ])
    expect(
      Arr.map(result.conflicts, (change) => [
        change.table,
        change.row.id,
        change.table === "exercise" ? change.row.name : "",
      ]),
    ).toEqual([["exercise", tieId, "Tie Row"]])

    const pulled = await call("/sync/pull", json(auth, "POST", { since: null, limit: 500 }))
    expect(pulled.status).toBe(200)
    const page = Schema.decodeUnknownSync(PullResponse)(await pulled.json())
    const rows = Arr.map(page.changes, (change) => [
      change.table,
      change.row.id,
      change.table === "exercise" ? change.row.name : "",
    ])
    expect(rows).toContainEqual(["exercise", id(0x501), "Pushed Row"])
    expect(rows).toContainEqual(["exercise", tieId, "Tie Row"])
    expect(Arr.map(page.changes, (change) => change.row.id)).not.toContain(id(0x502))
  })
})

describe("D1 statement budget (Free: 50 per invocation)", () => {
  const counting = countingD1(env.DB)
  const persistence = d1Persistence(counting.db)
  const mcp = makeMcp(envVars, {
    persistence,
    auth: McpAuth.layerFixed(Option.some(DEV_PRINCIPAL)),
  })
  afterAll(() => mcp.dispose())
  const SQUAT = 0x601

  const tool = (name: string) =>
    Option.getOrThrow(Arr.findFirst(writeTools, (each) => each.name === name))
  const runTool = (name: string, args: unknown) =>
    Effect.runPromise(
      tool(name)
        .call(DEV_USER_ID, args)
        .pipe(Effect.provide(Layer.mergeAll(persistence, IdGenerator.layer))),
    )
  const measure = async <A>(run: () => Promise<A>) => {
    const before = counting.counts()
    const value = await run()
    const after = counting.counts()
    const counts = {
      single: after.single - before.single,
      batches: after.batches - before.batches,
      batched: after.batched - before.batched,
    }
    return { value, counts, statements: counts.single + counts.batched }
  }

  it("write_plan_week (4 sessions × 6 sets) stays within 50 statements", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* (yield* ExerciseRepo).put(DEV_USER_ID, [
          exercise(SQUAT, { userId: DEV_USER_ID, name: "Budget Squat" }),
        ])
      }).pipe(Effect.provide(persistence)),
    )
    const sessions = Arr.makeBy(4, (s) => ({
      order: s,
      name: `Day ${s + 1}`,
      scheduledDate: null,
      notes: null,
      sets: Arr.makeBy(6, (n) => ({
        exerciseId: id(SQUAT),
        order: n,
        targetWeightKg: 100,
        targetReps: { _tag: "Exact", reps: 5 },
        targetRpe: null,
        restSeconds: null,
        note: null,
      })),
    }))
    const { counts, statements } = await measure(() =>
      runTool("write_plan_week", {
        planId: null,
        newPlan: { name: "Budget Block", goal: "Strength" },
        weekStart: "2026-10-19",
        intent: null,
        sessions,
      }),
    )
    console.log("write_plan_week 4x6 D1 statements", statements, counts)
    expect(statements).toBeLessThanOrEqual(50)
  })

  it("get_overview over /mcp uses at most 5 D1 statements", async () => {
    const startedAt = DateTime.formatIso(
      DateTime.subtract(await Effect.runPromise(DateTime.now), { hours: 1 }),
    )
    await runTool("log_session", {
      startedAt,
      finishedAt: null,
      plannedSessionId: null,
      notes: null,
      sets: Arr.makeBy(3, () => ({
        exerciseId: id(SQUAT),
        weightKg: 100,
        reps: 5,
        rpe: null,
        note: null,
      })),
    })
    const { value, counts, statements } = await measure(async () => {
      const ctx = createExecutionContext()
      const response = await mcp.handle(
        new Request("http://localhost/mcp", {
          method: "POST",
          headers: {
            host: "localhost",
            accept: "application/json, text/event-stream",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "get_overview", arguments: { period: "7d" } },
          }),
        }),
        envVars,
        ctx,
      )
      await waitOnExecutionContext(ctx)
      return { status: response.status, body: await response.text() }
    })
    console.log("get_overview D1 statements", statements, counts)
    expect(value.status).toBe(200)
    expect(value.body).toContain('\\"sets\\":3')
    expect(statements).toBeLessThanOrEqual(5)
  })
})

describe("scheduled (cron export drain, design §6)", () => {
  it("drains with no due exports and settles through waitUntil", async () => {
    const ctx = createExecutionContext()
    worker.scheduled(createScheduledController({ cron: "*/5 * * * *" }), env, ctx)
    await waitOnExecutionContext(ctx)
    const rows = await env.DB.prepare("SELECT COUNT(*) AS n FROM activity_export").first("n")
    expect(rows).toBe(0)
  })
})

describe("/sync/push exports a completed session within the push (design §6)", () => {
  const counting = countingD1(env.DB)
  const persistence = d1Persistence(counting.db)
  const exportsLayer = ExportQueue.layerD1(counting.db)
  const appFor = (userId: UserId) =>
    makeApp(envVars, {
      auth: { _tag: "Fixed", sessions: Sessions.layerFixed(Option.some(userId)) },
      persistence,
      exports: exportsLayer,
    })
  const CONNECTED = UserId.make(id(0x7a1))
  const UNCONNECTED = UserId.make(id(0x7b1))
  const connected = appFor(CONNECTED)
  const unconnected = appFor(UNCONNECTED)
  afterAll(() => Promise.all([connected.dispose(), unconnected.dispose()]))

  const sessionRow = (n: number, userId: UserId, finishedAt: string | null) => ({
    table: "session",
    row: {
      id: id(n),
      userId,
      createdAt: T0,
      updatedAt: T0,
      deletedAt: null,
      startedAt: "2026-10-19T07:12:00.000Z",
      finishedAt,
      plannedSessionId: null,
      notes: null,
    },
  })
  const pushOn = async (app: App, change: unknown) => {
    const before = counting.statements()
    const response = await app.handler(
      new Request(`${BASE}/sync/push`, json("", "POST", { changes: [change] })),
    )
    expect(response.status).toBe(200)
    const body = Schema.decodeUnknownSync(PushResponse)(await response.json())
    return { body, statements: counting.statements() - before }
  }
  const exportsOf = (userId: UserId) =>
    Effect.runPromise(
      Effect.flatMap(ActivityExportRepo, (repo) => repo.list(userId, "strava", 10)).pipe(
        Effect.provide(Repositories.layer.pipe(Layer.provide(D1Layer(env.DB)), Layer.orDie)),
      ),
    )

  it("an active integration gets a sent activity_export row before the response", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const seal = yield* TokenSeal
        const now = yield* DateTime.now
        yield* (yield* IntegrationRepo).upsert({
          id: Uuid.make(id(0x7a2)),
          userId: CONNECTED,
          provider: "strava",
          status: "active",
          externalId: "athlete",
          displayName: "Athlete",
          accessToken: DbSealedToken.make(yield* seal.seal(Redacted.make("access"))),
          refreshToken: DbSealedToken.make(yield* seal.seal(Redacted.make("refresh"))),
          expiresAt: DateTime.add(now, { hours: 6 }),
          scope: "activity:write",
          createdAt: now,
          updatedAt: now,
        })
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Repositories.layer.pipe(Layer.provide(D1Layer(env.DB)), Layer.orDie),
            TokenSeal.layerWithKey(Redacted.make(FAKE_INTEGRATION_TOKEN_KEY)),
          ),
        ),
      ),
    )
    const change = sessionRow(0x7a3, CONNECTED, "2026-10-19T08:00:00.000Z")
    const { body, statements } = await pushOn(connected, change)
    console.log("/sync/push completed session with integration: D1 statements", statements)
    expect(Arr.map(body.accepted, (a) => a.id)).toEqual([id(0x7a3)])
    const rows = await exportsOf(CONNECTED)
    expect(Arr.map(rows, (row) => [row.sessionId, row.status, row.externalActivityId])).toEqual([
      [id(0x7a3), "sent", Option.some(`console-${id(0x7a3).slice(0, 8)}`)],
    ])
  })

  it("without an integration a completed push costs 2 statements more than an open one", async () => {
    const open = await pushOn(unconnected, sessionRow(0x7b2, UNCONNECTED, null))
    const done = await pushOn(
      unconnected,
      sessionRow(0x7b3, UNCONNECTED, "2026-10-19T08:00:00.000Z"),
    )
    console.log(
      "/sync/push open vs completed without integration",
      open.statements,
      done.statements,
    )
    // The integration read (enqueue) and the due-row read (drain); nothing is written.
    expect(done.statements - open.statements).toBe(2)
    expect(await exportsOf(UNCONNECTED)).toEqual([])
  })
})

describe("/integrations/strava/callback through the default export (design §4)", () => {
  it("a state signed with the test key answers 303 and stores the integration in D1", async () => {
    const config = WorkerConfig.fromEnvSync(env)
    const returnTo = "http://localhost:8790/settings/integrations"
    const now = await Effect.runPromise(Clock.currentTimeMillis)
    const state = await Effect.runPromise(
      signState(config, { userId: UserId.make(DEV_USER_ID), returnTo, expiresAt: now + 60_000 }),
    )
    const response = await call(
      `/integrations/strava/callback?${new URLSearchParams({ state, code: "console", scope: "read,activity:write" })}`,
      { headers: { "cf-connecting-ip": "198.51.100.4" } },
    )
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe(`${returnTo}?connected=strava`)
    expect(response.headers.get("cache-control")).toBe("no-store")
    const row = await env.DB.prepare(
      "SELECT status, display_name, scope, access_token FROM integration WHERE user_id = ? AND provider = 'strava'",
    )
      .bind(DEV_USER_ID)
      .first()
    expect(row).toMatchObject({
      status: "active",
      display_name: "Console Athlete",
      scope: "read,activity:write",
    })
    expect(String(row?.access_token).startsWith("v1.")).toBe(true)
  })
})

describe("POST /api/account/delete through the default export (LEGAL-2)", () => {
  it("erases a real Better Auth user in D1; the same cookies afterwards", async () => {
    const own = await signIn("erase-me@example.com")
    const count = () =>
      env.DB.prepare(`SELECT count(*) AS n FROM "user" WHERE email = 'erase-me@example.com'`).first(
        "n",
      )
    expect(await count()).toBe(1)
    const deleted = await call("/api/account/delete", json(own, "POST", {}))
    expect(deleted.status).toBe(200)
    expect(await deleted.json()).toEqual({ deleted: true })
    expect(deleted.headers.get("cache-control")).toBe("no-store")
    expect(await count()).toBe(0)
    const after = await call("/exercises", { headers: { cookie: own, origin: ORIGIN } })
    // A copy of the cookies still authenticates for up to 15 min (Better Auth `cookieCache`, no D1
    // read): the read is empty, not 401. The response's expired Set-Cookies end the browser's copy.
    expect({ status: after.status, body: await after.text() }).toEqual({ status: 200, body: "[]" })
  })
})
