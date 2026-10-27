import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { afterAll, describe, expect, it } from "@effect/vitest"
import {
  EnrollProgramResult,
  MCP_TOOLS,
  type McpScope,
  ProgramList,
  UserId,
  WriteProgramResult,
} from "@tanren/shared"
import { Option, Schema } from "effect"
import { d1Persistence } from "../app"
import { envVars } from "../testing/fixtures"
import { McpAuth } from "./McpAuth"
import { makeMcp } from "./McpRoute"

// The program tools (ADR-0026, docs/design/programs-mcp.md §3) through the real `/mcp` route on D1
// with every migration: fixed principal → stateless SDK handler → tools → repos → D1.
const owner = UserId.make("00000000-0000-4000-8000-0000000b6a01")
const persistence = d1Persistence(env.DB)

const mcpFor = (scopes: ReadonlyArray<McpScope>) =>
  makeMcp(envVars, {
    persistence,
    auth: McpAuth.layerFixed(Option.some({ userId: owner, scopes })),
  })
const writer = mcpFor(["tanren:read", "tanren:write"])
const reader = mcpFor(["tanren:read"])
afterAll(() => Promise.all([writer.dispose(), reader.dispose()]))

const rpcCall = async (mcp: ReturnType<typeof mcpFor>, method: string, params: unknown) => {
  const ctx = createExecutionContext()
  const response = await mcp.handle(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        host: "localhost",
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
    envVars,
    ctx,
  )
  await waitOnExecutionContext(ctx)
  return response.text()
}

/** The JSON of a JSON or SSE (`data: {...}`) body. */
const bodyJson = (text: string): unknown =>
  JSON.parse(
    text.startsWith("data:") || text.includes("\ndata: ")
      ? (text
          .split("\n")
          .find((line) => line.startsWith("data: "))
          ?.slice("data: ".length) ?? "null")
      : text,
  )

const rpcResult = async (
  mcp: ReturnType<typeof mcpFor>,
  method: string,
  params: unknown,
): Promise<Record<string, unknown>> =>
  Schema.decodeUnknownSync(Schema.Struct({ result: Schema.Record(Schema.String, Schema.Unknown) }))(
    bodyJson(await rpcCall(mcp, method, params)),
  ).result

const callTool = (mcp: ReturnType<typeof mcpFor>, name: string, args: unknown) =>
  rpcResult(mcp, "tools/call", { name, arguments: args })

const toolNames = async (mcp: ReturnType<typeof mcpFor>): Promise<ReadonlyArray<string>> =>
  Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ name: Schema.String })))(
    (await rpcResult(mcp, "tools/list", {})).tools,
  ).map((tool) => tool.name)

const PROGRAM_READS = ["list_programs", "get_program", "get_program_progress"]
const PROGRAM_WRITES = [
  "write_program",
  "update_program",
  "delete_program",
  "enroll_program",
  "set_enrollment_status",
  "swap_exercise",
]

const body = {
  slug: "morning-core",
  title: "Morning Core",
  summary: "Two short core days",
  schedule: { kind: "daysPerWeek", days: 3 },
  days: [
    {
      title: "Day one",
      rounds: 2,
      restBetweenRoundsSeconds: 60,
      items: [
        { kind: "reps", catalogId: "crunch", reps: 15, restSeconds: 20 },
        { kind: "timed", catalogId: "plank", seconds: 40, restSeconds: 20 },
      ],
    },
    {
      title: "Day two",
      rounds: 1,
      restBetweenRoundsSeconds: 0,
      items: [{ kind: "reps", catalogId: "dead-bug", reps: 12, restSeconds: 20 }],
    },
  ],
}

describe("program tools over /mcp in workerd", () => {
  it("lists all twenty-two tools for a read + write principal", async () => {
    const names = await toolNames(writer)
    expect(names).toHaveLength(22)
    expect(names).toEqual([...MCP_TOOLS])
    expect(names).toEqual(expect.arrayContaining([...PROGRAM_READS, ...PROGRAM_WRITES]))
  })

  it("a read-only principal sees the three program reads and no program write", async () => {
    const names = await toolNames(reader)
    expect(names).toEqual(MCP_TOOLS.slice(0, 11))
    expect(names).toEqual(expect.arrayContaining(PROGRAM_READS))
    PROGRAM_WRITES.forEach((name) => {
      expect(names).not.toContain(name)
    })
  })

  it("write_program then list_programs round-trips through D1", async () => {
    const written = await callTool(writer, "write_program", body)
    expect(written.isError).toBeUndefined()
    const result = Schema.decodeUnknownSync(WriteProgramResult)(written.structuredContent)
    expect([result.created, result.version, result.days]).toEqual([true, 1, 2])

    const listed = await callTool(reader, "list_programs", {})
    const programs = Schema.decodeUnknownSync(ProgramList)(listed.structuredContent).programs
    expect(programs.map((program) => program.source)).toEqual(["builtin", "builtin", "mcp"])
    expect(programs[2]).toMatchObject({ programId: result.programId, title: "Morning Core" })

    const replaced = Schema.decodeUnknownSync(WriteProgramResult)(
      (await callTool(writer, "write_program", { ...body, title: "Morning Core 2" }))
        .structuredContent,
    )
    expect([replaced.programId, replaced.created, replaced.version]).toEqual([
      result.programId,
      false,
      2,
    ])
  })

  it("enroll_program answers the enrollment, then the same one with alreadyActive", async () => {
    const programId = Schema.decodeUnknownSync(ProgramList)(
      (await callTool(reader, "list_programs", {})).structuredContent,
    ).programs.find((program) => program.source === "mcp")?.programId
    const first = Schema.decodeUnknownSync(EnrollProgramResult)(
      (await callTool(writer, "enroll_program", { programId })).structuredContent,
    )
    expect(first.alreadyActive).toBe(false)
    const second = Schema.decodeUnknownSync(EnrollProgramResult)(
      (await callTool(writer, "enroll_program", { programId })).structuredContent,
    )
    expect(second.alreadyActive).toBe(true)
    expect(second.enrollment.enrollmentId).toBe(first.enrollment.enrollmentId)
  })

  it("an unknown catalog id is an isError result naming it, and a read-only principal cannot write", async () => {
    const bad = await callTool(writer, "write_program", {
      ...body,
      slug: "bad-one",
      days: [
        {
          ...body.days[1],
          items: [{ kind: "reps", catalogId: "made-up", reps: 5, restSeconds: 20 }],
        },
      ],
    })
    expect(bad).toMatchObject({
      isError: true,
      content: [{ type: "text", text: "NotFound: catalogExercise made-up not found" }],
    })
    expect(
      bodyJson(await rpcCall(reader, "tools/call", { name: "write_program", arguments: body })),
    ).toMatchObject({
      error: { code: -32602, message: "Tool write_program not found" },
    })
  })
})
