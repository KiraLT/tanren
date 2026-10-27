import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { afterAll, describe, expect, it } from "@effect/vitest"
import {
  GetNutritionDayResult,
  LogFoodResult,
  MCP_TOOLS,
  type McpScope,
  UserId,
} from "@tanren/shared"
import { Option, Schema } from "effect"
import { d1Persistence } from "../app"
import { envVars } from "../testing/fixtures"
import { McpAuth } from "./McpAuth"
import { makeMcp } from "./McpRoute"

// The nutrition tools (ADR-0025, docs/design/nutrition.md §3) through the real `/mcp` route on D1
// with every migration: fixed principal → stateless SDK handler → tools → repos → D1.
const owner = UserId.make("00000000-0000-4000-8000-0000000a5301")
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

const item = (name: string, kcal: number, proteinG: number, carbsG: number, fatG: number) => ({
  name,
  portion: "1 serving",
  grams: null,
  kcal,
  proteinG,
  carbsG,
  fatG,
  fibreG: null,
  confidence: null,
})

describe("nutrition tools over /mcp in workerd", () => {
  it("lists all twenty-two tools for a read + write principal", async () => {
    const names = await toolNames(writer)
    expect(names).toHaveLength(22)
    expect(names).toEqual([...MCP_TOOLS])
  })

  it("update_profile sets the nutrition goal, log_food answers a day with kcalLeft = budget − eaten", async () => {
    const profile = await callTool(writer, "update_profile", {
      timezone: "Europe/Berlin",
      nutrition: {
        goal: "gain_muscle",
        bodyWeightKg: 85,
        heightCm: 180,
        birthYear: 1990,
        sex: "male",
        activityLevel: "moderate",
        eatBackActive: false,
        kcalTarget: 2500,
        proteinTargetG: null,
      },
    })
    expect(profile.isError).toBeUndefined()

    const logged = await callTool(writer, "log_food", {
      meal: "lunch",
      items: [item("Chicken breast", 330, 62, 0, 7), item("Rice", 260, 5, 57, 1)],
    })
    expect(logged.isError).toBeUndefined()
    const result = Schema.decodeUnknownSync(LogFoodResult)(logged.structuredContent)
    expect(result.entry.meal).toBe("lunch")
    expect(result.day.eaten.kcal).toBe(590)
    expect(result.day.budgetKcal).toEqual(Option.some(2500))
    const { budgetKcal, kcalLeft } = result.day
    expect(Option.isSome(budgetKcal) && Option.isSome(kcalLeft)).toBe(true)
    expect(
      Option.zipWith(
        budgetKcal,
        kcalLeft,
        (budget, left) => left === budget - result.day.eaten.kcal,
      ),
    ).toEqual(Option.some(true))
    expect(kcalLeft).toEqual(Option.some(1910))
  })

  it("get_nutrition_day lists the entry just logged", async () => {
    const result = await callTool(writer, "get_nutrition_day", {})
    expect(result.isError).toBeUndefined()
    const day = Schema.decodeUnknownSync(GetNutritionDayResult)(result.structuredContent)
    expect(day.entries.map((entry) => entry.items.map((each) => each.name))).toEqual([
      ["Chicken breast", "Rice"],
    ])
    expect(day.eaten.kcal).toBe(590)
    expect(day.kcalLeft).toEqual(Option.some(1910))
  })

  it("a read-only principal lists get_nutrition_day but not log_food", async () => {
    const names = await toolNames(reader)
    expect(names).toContain("get_nutrition_day")
    expect(names).not.toContain("log_food")
    expect(names).not.toContain("delete_food_entry")
  })

  it("a read-only principal reads the day but log_food is refused and stores nothing", async () => {
    const day = Schema.decodeUnknownSync(GetNutritionDayResult)(
      (await callTool(reader, "get_nutrition_day", {})).structuredContent,
    )
    expect(day.entries).toHaveLength(1)

    const refused = await rpcCall(reader, "tools/call", {
      name: "log_food",
      arguments: { meal: "snack", items: [item("Apple", 95, 0, 25, 0)] },
    })
    // The SDK answers an unregistered tool with an error (JSON-RPC error or an isError result).
    expect(bodyJson(refused)).toMatchObject({
      error: { code: -32602, message: "Tool log_food not found" },
    })

    const after = Schema.decodeUnknownSync(GetNutritionDayResult)(
      (await callTool(writer, "get_nutrition_day", {})).structuredContent,
    )
    expect(after.entries).toHaveLength(1)
    expect(after.eaten.kcal).toBe(590)
  })
})
