import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { afterAll, describe, expect, it } from "@effect/vitest"
import { Exercise, IdGenerator, PullResponse, PushResponse } from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Layer, Option, Schema } from "effect"
import { d1Persistence } from "./app"
import { DEV_USER_EMAIL, DEV_USER_ID } from "./auth/devUser"
import worker from "./index"
import { DEV_PRINCIPAL, McpAuth } from "./mcp/McpAuth"
import { makeMcp } from "./mcp/McpRoute"
import { writeTools } from "./mcp/writeTools"
import { ExerciseRepo } from "./repos"
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
const signIn = async (): Promise<string> => {
  const sent = await call(
    "/api/auth/sign-in/magic-link",
    json("", "POST", { email: DEV_USER_EMAIL, callbackURL: "/" }),
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
const session = Effect.runSync(Effect.cached(Effect.promise(signIn)))
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
