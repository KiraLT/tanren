import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { afterAll, beforeAll, describe, expect, it } from "@effect/vitest"
import {
  ExerciseId,
  MCP_TOOLS,
  OrderIndex,
  Overview,
  Reps,
  SearchExercisesResult,
  Session,
  SessionId,
  SetId,
  UserId,
  WeightKg,
  WorkoutSet,
} from "@tanren/shared"
import { DateTime, Effect, Option, Schema } from "effect"
import { d1Persistence } from "../app"
import { DEV_USER_ID } from "../auth/devUser"
import { ExerciseRepo, SessionRepo } from "../repos"
import { exercise } from "../sync/fixtures"
import { countingD1 } from "../testing/countingD1"
import { envVars } from "../testing/fixtures"
import { McpAuth } from "./McpAuth"
import { makeMcp } from "./McpRoute"

// `/mcp` end to end inside workerd: dev-token auth → stateless SDK handler → tools → D1.
const TOKEN = "workerd-test-mcp-token"
const mcpEnv = { ...envVars, DEV_MCP_TOKEN: TOKEN }
const mcp = makeMcp(mcpEnv, { persistence: d1Persistence(env.DB), auth: McpAuth.layerDevToken })

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`
const SQUAT = 0x401
const UNKNOWN_EXERCISE = id(0x4ff)

/** One exercise and one session (two sets) an hour ago, owned by the dev user. */
const seed = Effect.gen(function* () {
  const startedAt = DateTime.subtract(yield* DateTime.now, { hours: 1 })
  const session = Session.make({
    id: SessionId.make(id(0x411)),
    userId: DEV_USER_ID,
    createdAt: startedAt,
    updatedAt: startedAt,
    deletedAt: Option.none(),
    startedAt,
    finishedAt: Option.none(),
    plannedSessionId: Option.none(),
    notes: Option.none(),
  })
  const set = (n: number, order: number): WorkoutSet =>
    WorkoutSet.make({
      id: SetId.make(id(n)),
      userId: DEV_USER_ID,
      createdAt: startedAt,
      updatedAt: startedAt,
      deletedAt: Option.none(),
      sessionId: session.id,
      exerciseId: ExerciseId.make(id(SQUAT)),
      order: OrderIndex.make(order),
      weightKg: WeightKg.make(100),
      reps: Reps.make(5),
      rpe: Option.none(),
      note: Option.none(),
      plannedSetId: Option.none(),
      loggedAt: DateTime.add(startedAt, { minutes: order + 1 }),
    })
  yield* (yield* ExerciseRepo).put(DEV_USER_ID, [
    exercise(SQUAT, { userId: DEV_USER_ID, name: "Back Squat" }),
  ])
  const sessions = yield* SessionRepo
  yield* sessions.putSessions(DEV_USER_ID, [session])
  yield* sessions.putSets(DEV_USER_ID, [set(0x421, 0), set(0x422, 1)])
}).pipe(Effect.provide(d1Persistence(env.DB)))

const post = async (body: unknown, token: Option.Option<string> = Option.some(TOKEN)) => {
  const ctx = createExecutionContext()
  const response = await mcp.handle(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        host: "localhost",
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        ...Option.match(token, {
          onNone: () => ({}),
          onSome: (value) => ({ authorization: `Bearer ${value}` }),
        }),
      },
      body: JSON.stringify(body),
    }),
    mcpEnv,
    ctx,
  )
  await waitOnExecutionContext(ctx)
  return response
}

/** JSON-RPC result of a JSON or SSE (`data: {...}`) response. */
const rpcResult = async (response: Response): Promise<Record<string, unknown>> => {
  const text = await response.text()
  const json = (response.headers.get("content-type") ?? "").includes("text/event-stream")
    ? (text
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice("data: ".length) ?? "null")
    : text
  const parsed: unknown = JSON.parse(json)
  return Schema.decodeUnknownSync(
    Schema.Struct({ result: Schema.Record(Schema.String, Schema.Unknown) }),
  )(parsed).result
}

const rpc = (rpcId: number, method: string, params: unknown) => ({
  jsonrpc: "2.0",
  id: rpcId,
  method,
  params,
})

const callTool = (name: string, args: unknown) =>
  post(rpc(3, "tools/call", { name, arguments: args })).then(rpcResult)

describe("/mcp in workerd", () => {
  beforeAll(() => Effect.runPromise(seed))

  it("answers initialize with 200", async () => {
    const response = await post(
      rpc(1, "initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "workerd-test", version: "0" },
      }),
    )
    expect(response.status).toBe(200)
    expect(await rpcResult(response)).toMatchObject({ serverInfo: { name: "tanren" } })
  })

  it("lists all eight tools for the dev token (every scope): reads read-only, writes not", async () => {
    const result = await post(rpc(2, "tools/list", {})).then(rpcResult)
    const tools = Schema.decodeUnknownSync(
      Schema.Array(
        Schema.Struct({
          name: Schema.String,
          inputSchema: Schema.Struct({ type: Schema.Literal("object") }),
          annotations: Schema.Struct({ readOnlyHint: Schema.Boolean }),
        }),
      ),
    )(result.tools)
    expect(tools.map((tool) => tool.name)).toEqual([...MCP_TOOLS])
    expect(tools.map((tool) => tool.annotations.readOnlyHint)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
    ])
  })

  it("get_overview returns structured content that decodes as Overview", async () => {
    const result = await callTool("get_overview", { period: "7d" })
    expect(result.isError).toBeUndefined()
    const overview = Schema.decodeUnknownSync(Overview)(result.structuredContent)
    expect(overview.sessions).toBe(1)
    expect(overview.sets).toBe(2)
    expect(overview.volumeKg).toBe(1000)
    expect(overview.exercises.map((summary) => summary.name)).toEqual(["Back Squat"])
  })

  it("get_current_plan without a plan answers text only (no structuredContent)", async () => {
    const result = await callTool("get_current_plan", {})
    expect(result.structuredContent).toBeUndefined()
    expect(result.content).toEqual([{ type: "text", text: "null" }])
  })

  it("get_exercise_history for an unknown id is an isError result", async () => {
    const result = await callTool("get_exercise_history", { exerciseId: UNKNOWN_EXERCISE })
    expect(result.isError).toBe(true)
    expect(result.content).toEqual([
      { type: "text", text: `NotFound: exercise ${UNKNOWN_EXERCISE} not found` },
    ])
  })

  it("invalid arguments are an isError result, not a crash", async () => {
    const result = await callTool("get_overview", { period: "1y" })
    expect(result.isError).toBe(true)
  })

  it("rejects a request without a token: 401 + the resource-metadata challenge, empty body", async () => {
    const response = await post(rpc(4, "tools/list", {}), Option.none())
    expect(response.status).toBe(401)
    expect(response.headers.get("WWW-Authenticate")).toBe(
      'Bearer realm="OAuth", resource_metadata="http://localhost:8787/.well-known/oauth-protected-resource/mcp", scope="tanren:read tanren:write"',
    )
    expect(await response.text()).toBe("")
  })

  it("rejects a wrong token with 401", async () => {
    const response = await post(rpc(5, "tools/list", {}), Option.some("wrong"))
    expect(response.status).toBe(401)
  })
})

describe("QA: /mcp methods and D1 isolation", () => {
  const authed = { authorization: `Bearer ${TOKEN}`, host: "localhost" }
  const send = async (method: string, headers: Record<string, string>) => {
    const ctx = createExecutionContext()
    const response = await mcp.handle(
      new Request("http://localhost/mcp", { method, headers }),
      mcpEnv,
      ctx,
    )
    await waitOnExecutionContext(ctx)
    return response
  }

  it("GET and DELETE on /mcp with a valid token answer 4xx, never 200 or 5xx", async () => {
    const statuses = await Promise.all(
      ["GET", "DELETE"].map((method) => send(method, authed).then((r) => r.status)),
    )
    expect(statuses.every((status) => status >= 400 && status < 500)).toBe(true)
  })

  it("GET and DELETE on /mcp without a token are 401", async () => {
    const statuses = await Promise.all(
      ["GET", "DELETE"].map((method) => send(method, {}).then((r) => r.status)),
    )
    expect(statuses).toEqual([401, 401])
  })

  it("a foreign user's exercise id is NotFound through D1 and leaks nothing", async () => {
    const foreignUser = Schema.decodeUnknownSync(UserId)(id(0x7ff))
    const foreignExercise = id(0x4a0)
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* (yield* ExerciseRepo).put(foreignUser, [
          exercise(0x4a0, { userId: foreignUser, name: "SecretLift" }),
        ])
      }).pipe(Effect.provide(d1Persistence(env.DB))),
    ).catch(() => undefined)
    const result = await callTool("get_exercise_history", { exerciseId: foreignExercise })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).not.toContain("SecretLift")
  })
})

describe("search_exercises over /mcp", () => {
  it("returns catalog matches as structured content", async () => {
    const result = await callTool("search_exercises", { query: "row", limit: 3 })
    expect(result.isError).toBeUndefined()
    const found = Schema.decodeUnknownSync(SearchExercisesResult)(result.structuredContent)
    expect(found.results.length).toBeGreaterThanOrEqual(3)
    expect(found.total).toBeGreaterThanOrEqual(found.results.length)
  })

  it("runs 0 D1 statements (the catalog is static)", async () => {
    const counting = countingD1(env.DB)
    const countedMcp = makeMcp(mcpEnv, {
      persistence: d1Persistence(counting.db),
      auth: McpAuth.layerDevToken,
    })
    const ctx = createExecutionContext()
    const response = await countedMcp.handle(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          host: "localhost",
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify(
          rpc(6, "tools/call", { name: "search_exercises", arguments: { query: "row" } }),
        ),
      }),
      mcpEnv,
      ctx,
    )
    await waitOnExecutionContext(ctx)
    const result = await rpcResult(response)
    expect(result.isError).toBeUndefined()
    expect(counting.statements()).toBe(0)
    await countedMcp.dispose()
  })
})

afterAll(() => mcp.dispose())
