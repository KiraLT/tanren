import { describe, expect, it } from "@effect/vitest"
import { Forbidden, IdGenerator, MCP_TOOLS } from "@tanren/shared"
import { Effect, Layer, Schema } from "effect"
import { Repositories } from "../repos"
import { userA } from "../sync/fixtures"
import { callTool, toolsFor } from "./server"
import type { AnyTool } from "./tools"

const TestLayer = Layer.mergeAll(Repositories.layerMemory, IdGenerator.layerTest)

/** A tool whose program dies (e.g. the output-encode `orDie`) with a message that must not leak. */
const dyingTool: AnyTool = {
  name: "get_overview",
  kind: "read",
  description: "dies",
  input: Schema.Unknown,
  output: Schema.Unknown,
  call: () => Effect.die(new Error("secret defect detail")),
}

describe("callTool", () => {
  it.effect("turns a defect into a generic isError result without its message", () =>
    Effect.gen(function* () {
      const result = yield* callTool(dyingTool, userA, {})
      expect(result).toEqual({ isError: true, content: [{ type: "text", text: "internal error" }] })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("turns Forbidden into an isError result with its message", () =>
    Effect.gen(function* () {
      const forbiddenTool: AnyTool = {
        ...dyingTool,
        call: () => Effect.fail(new Forbidden({ message: "not your row" })),
      }
      const result = yield* callTool(forbiddenTool, userA, {})
      expect(result).toEqual({
        isError: true,
        content: [{ type: "text", text: "Forbidden: not your row" }],
      })
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("toolsFor", () => {
  it("registers the six read tools, get_profile included, for a read-only grant", () => {
    const names = toolsFor({ userId: userA, scopes: ["tanren:read"] }).map((t) => t.name)
    expect(names).toEqual(MCP_TOOLS.slice(0, 6))
    expect(names).toHaveLength(6)
    expect(names).toContain("search_exercises")
    expect(names).toContain("get_profile")
  })

  it("adds the three write tools, in MCP_TOOLS order, with tanren:write", () => {
    expect(
      toolsFor({ userId: userA, scopes: ["tanren:read", "tanren:write"] }).map((t) => t.name),
    ).toEqual([...MCP_TOOLS])
  })

  it("registers only the three write tools for a write-only grant", () => {
    expect(toolsFor({ userId: userA, scopes: ["tanren:write"] }).map((t) => t.name)).toEqual(
      MCP_TOOLS.slice(6),
    )
  })

  it("registers nothing without a scope", () => {
    expect(toolsFor({ userId: userA, scopes: [] })).toEqual([])
  })
})
