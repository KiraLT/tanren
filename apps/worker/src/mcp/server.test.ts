import { describe, expect, it } from "@effect/vitest"
import { PersistenceError } from "@tanren/db"
import { Forbidden, IdGenerator, MCP_TOOLS } from "@tanren/shared"
import { Effect, Layer, Schema } from "effect"
import { Repositories } from "../repos"
import { MemoryGarminImport } from "../repos/MemoryGarminImport"
import { MemoryIntegrations } from "../repos/MemoryIntegrations"
import { userA } from "../sync/fixtures"
import { callTool, GONE_USER, guardWrite, toolsFor } from "./server"
import type { AnyTool } from "./tools"

const TestLayer = Layer.mergeAll(
  MemoryGarminImport.layer.pipe(Layer.provide(MemoryIntegrations.layer)),
  IdGenerator.layerTest,
).pipe(Layer.provideMerge(Layer.merge(Repositories.layerMemory, IdGenerator.layerTest)))

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
  it("registers the twelve read tools, get_profile and the program reads included, for a read-only grant", () => {
    const names = toolsFor({ userId: userA, scopes: ["tanren:read"] }).map((t) => t.name)
    expect(names).toEqual(MCP_TOOLS.slice(0, 12))
    expect(names).toHaveLength(12)
    expect(names).toEqual(
      expect.arrayContaining(["list_programs", "get_program", "get_program_progress"]),
    )
    expect(names).toContain("search_exercises")
    expect(names).toContain("get_profile")
  })

  it("adds the eleven write tools, in MCP_TOOLS order, with tanren:write", () => {
    expect(
      toolsFor({ userId: userA, scopes: ["tanren:read", "tanren:write"] }).map((t) => t.name),
    ).toEqual([...MCP_TOOLS])
  })

  it("registers only the eleven write tools for a write-only grant", () => {
    expect(toolsFor({ userId: userA, scopes: ["tanren:write"] }).map((t) => t.name)).toEqual(
      MCP_TOOLS.slice(12),
    )
  })

  it("registers nothing without a scope", () => {
    expect(toolsFor({ userId: userA, scopes: [] })).toEqual([])
  })
})

describe("guardWrite (STLS-F4)", () => {
  const written = Effect.succeed({ content: [{ type: "text" as const, text: "written" }] })

  it.effect("a failing user-row check answers the storage-unavailable error result", () =>
    Effect.gen(function* () {
      const failing = Effect.fail(
        new PersistenceError({ operation: "userTokens.tokenGens", cause: "D1 down" }),
      )
      expect(yield* guardWrite(failing, written)).toEqual({
        content: [{ type: "text", text: "storage unavailable" }],
        isError: true,
      })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a gone user gets the Forbidden result and an existing one runs the write", () =>
    Effect.gen(function* () {
      const gone = yield* guardWrite(Effect.succeed(false), written)
      const live = yield* guardWrite(Effect.succeed(true), written)
      expect([gone, live]).toEqual([
        { content: [{ type: "text", text: GONE_USER }], isError: true },
        { content: [{ type: "text", text: "written" }] },
      ])
    }).pipe(Effect.provide(TestLayer)),
  )
})
