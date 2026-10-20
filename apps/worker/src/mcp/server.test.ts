import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Repositories } from "../repos"
import { userA } from "../sync/fixtures"
import { callTool } from "./server"
import type { AnyReadTool } from "./tools"

/** A tool whose program dies (e.g. the output-encode `orDie`) with a message that must not leak. */
const dyingTool: AnyReadTool = {
  name: "get_overview",
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
    }).pipe(Effect.provide(Repositories.layerMemory)),
  )
})
