import { describe, expect, it } from "@effect/vitest"
import {
  CORE30,
  IdGenerator,
  LEAN_BUILD_12,
  type ProgramSummary,
  summarize,
  UserProgram,
} from "@tanren/shared"
import { Effect, Option, Random, Schema } from "effect"
import { blankContent, duplicateContent, newProgramRow } from "./newProgram"

const builtinSummary = (program: typeof CORE30): ProgramSummary =>
  summarize(program, { source: "builtin", version: 1, schedule: Option.none() }, Option.none())

const build = (content: Parameters<typeof newProgramRow>[0]) =>
  newProgramRow(content).pipe(Effect.provide(IdGenerator.layerTest), Random.withSeed(42))

describe("newProgramRow", () => {
  it.effect("a blank program is a manual row, version 1, and decodes as a UserProgram", () =>
    Effect.gen(function* () {
      const row = yield* build(blankContent)
      expect(row.source).toBe("manual")
      expect(row.version).toBe(1)
      expect(row.days).toHaveLength(1)
      expect(row.slug).toMatch(/^new-program-[a-z0-9]{4}$/)
      const encoded = yield* Schema.encodeEffect(UserProgram)(row)
      const decoded = yield* Schema.decodeUnknownEffect(UserProgram)(encoded)
      expect(decoded.title).toBe("New program")
    }),
  )

  it.effect("the suffix comes from Random: same seed, same slug", () =>
    Effect.gen(function* () {
      const first = yield* build(blankContent)
      const second = yield* build(blankContent)
      expect(second.slug).toBe(first.slug)
    }),
  )

  it.effect("duplicating a built-in keeps the day count and derives a schedule", () =>
    Effect.gen(function* () {
      const content = duplicateContent(CORE30, builtinSummary(CORE30))
      expect(content.title).toBe(`${CORE30.name} copy`)
      expect(content.days).toHaveLength(CORE30.days.length)
      expect(content.schedule).toEqual({ kind: "daysPerWeek", days: 6 })
      const row = yield* build(content)
      expect(row.source).toBe("manual")
      expect(row.version).toBe(1)
      expect(row.days).toHaveLength(CORE30.days.length)
      expect(row.days).toEqual(CORE30.days)
    }),
  )

  it.effect("a duplicate of the 84-day built-in keeps 84 days and a row's schedule", () =>
    Effect.gen(function* () {
      const schedule = { kind: "weekdays", weekdays: ["mon", "thu"] } as const
      const summary = { ...builtinSummary(LEAN_BUILD_12), schedule: Option.some(schedule) }
      const content = duplicateContent(LEAN_BUILD_12, summary)
      expect(content.schedule).toEqual(schedule)
      expect(content.days).toHaveLength(84)
      const row = yield* build(content)
      expect(row.days).toHaveLength(84)
    }),
  )
})
