import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { afterAll, describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Effect, Schema } from "effect"
import { d1Persistence } from "../app"
import { Tokens } from "../auth/Tokens"
import { WorkerConfig } from "../Config"
import { ExerciseRepo } from "../repos"
import { exercise } from "../sync/fixtures"
import { envVars } from "../testing/fixtures"
import { McpAuth } from "./McpAuth"
import { makeMcp } from "./McpRoute"
import { GONE_USER } from "./server"

// STLS-F4 (ADR-0022 amendment): an MCP access JWT outlives an erased account by up to 15 minutes.
// Reads keep answering (no D1 read for the identity); write tools need the `user` row. The Worker's
// `McpAuth.layerLive` on the migrated D1.
const owner = UserId.make("00000000-0000-4000-8000-0000000f4a01")
const SQUAT = 0xf4b01
const squatId = `00000000-0000-4000-8000-${SQUAT.toString(16).padStart(12, "0")}`
const T0 = "2026-10-27T00:00:00.000Z"

const persistence = d1Persistence(env.DB)
const mcp = makeMcp(envVars, { persistence, auth: McpAuth.layerLive })
afterAll(() => mcp.dispose())

const callTool = async (token: string, name: string, args: unknown) => {
  const ctx = createExecutionContext()
  const response = await mcp.handle(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        host: "localhost",
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
    envVars,
    ctx,
  )
  await waitOnExecutionContext(ctx)
  const text = await response.text()
  const body = (response.headers.get("content-type") ?? "").includes("text/event-stream")
    ? (text
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice("data: ".length) ?? "null")
    : text
  return Schema.decodeUnknownSync(
    Schema.Struct({
      result: Schema.Struct({
        isError: Schema.optionalKey(Schema.Boolean),
        content: Schema.Array(Schema.Struct({ text: Schema.String })),
      }),
    }),
  )(JSON.parse(body)).result
}

const planWeek = (weekStart: string) => ({
  planId: null,
  newPlan: { name: `Block ${weekStart}`, goal: "Strength" },
  weekStart,
  intent: "Volume",
  sessions: [
    {
      order: 0,
      name: "Lower A",
      scheduledDate: null,
      notes: null,
      sets: [
        {
          exerciseId: squatId,
          order: 0,
          targetWeightKg: 100,
          targetReps: { _tag: "Exact", reps: 5 },
          targetRpe: null,
          restSeconds: 120,
          note: null,
        },
      ],
    },
  ],
})

const plansOf = (userId: string) =>
  env.DB.prepare("SELECT COUNT(*) AS n FROM plan WHERE user_id = ?").bind(userId).first("n")

describe("a deleted user's MCP token cannot write (STLS-F4)", () => {
  it("write_plan_week works, then is refused once the user row is gone; get_overview still answers", async () => {
    await env.DB.prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?, 'F4', 'f4-mcp@tanren.test', 1, ?, ?)`,
    )
      .bind(owner, T0, T0)
      .run()
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* (yield* ExerciseRepo).put(owner, [
          exercise(SQUAT, { userId: owner, name: "Back Squat" }),
        ])
      }).pipe(Effect.provide(persistence)),
    )
    const { accessToken } = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Tokens).issueMcpPair({
          userId: owner,
          scopes: ["tanren:read", "tanren:write"],
          clientId: "https://claude.ai/oauth/claude-code-client-metadata",
          gen: 0,
        })
      }).pipe(Effect.provide(Tokens.layer), Effect.provide(WorkerConfig.layerFromEnv(envVars))),
    )

    const control = await callTool(accessToken, "write_plan_week", planWeek("2026-10-19"))
    expect(control.isError).toBeUndefined()
    const plansBefore = await plansOf(owner)
    expect(plansBefore).toBe(1)

    await env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind(owner).run()
    const write = await callTool(accessToken, "write_plan_week", planWeek("2026-10-26"))
    const read = await callTool(accessToken, "get_overview", { period: "7d" })
    console.log(
      "STLS-F4 after delete: write_plan_week",
      JSON.stringify(write),
      "get_overview isError",
      read.isError ?? false,
    )
    expect(write).toEqual({ isError: true, content: [{ text: GONE_USER }] })
    expect(await plansOf(owner)).toBe(1) // no new plan under the erased id
    expect(read.isError).toBeUndefined()
  })
})
