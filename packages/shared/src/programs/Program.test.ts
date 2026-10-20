import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import { failingPaths } from "../testing"
import { findProgram, PROGRAMS } from "./index"
import { dayDurationSeconds, Program, ProgramDay, ProgramId, SECONDS_PER_REP } from "./Program"

const timed = (seconds: number, restSeconds: number) => ({
  kind: "timed",
  catalogId: "plank",
  seconds,
  restSeconds,
})

const dayWire = {
  dayNumber: 1,
  title: "Day 1 · Foundation",
  rounds: 3,
  items: [timed(30, 15), timed(30, 15), timed(30, 60)],
  restBetweenRoundsSeconds: 60,
}

describe("ProgramDay", () => {
  it.effect("decodes timed and reps items, discriminated on kind", () =>
    Effect.gen(function* () {
      const day = yield* Schema.decodeUnknownEffect(ProgramDay)({
        ...dayWire,
        items: [timed(30, 15), { kind: "reps", catalogId: "sit-up", reps: 12, restSeconds: 15 }],
      })
      expect(day.items.map((item) => item.kind)).toEqual(["timed", "reps"])
    }),
  )

  it.effect("rejects an empty day, a sixth round and a non-slug catalogId", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(ProgramDay, { ...dayWire, items: [] })).toEqual([["items"]])
      expect(yield* failingPaths(ProgramDay, { ...dayWire, rounds: 6 })).toEqual([["rounds"]])
      expect(
        yield* failingPaths(ProgramDay, {
          ...dayWire,
          items: [{ ...timed(30, 15), catalogId: "A" }],
        }),
      ).toEqual([["items", 0, "catalogId"]])
    }),
  )
})

describe("dayDurationSeconds", () => {
  it("sums work, in-round rests and the rests between rounds (none after the last item)", () => {
    const day = Schema.decodeUnknownSync(ProgramDay)(dayWire)
    // 3 rounds × (90 work + 30 in-round rest) + 2 × 60 between rounds; last item's own rest unused
    expect(dayDurationSeconds(day)).toBe(3 * (90 + 30) + 2 * 60)
  })

  it("estimates a reps item at SECONDS_PER_REP per rep", () => {
    const day = Schema.decodeUnknownSync(ProgramDay)({
      ...dayWire,
      rounds: 1,
      items: [{ kind: "reps", catalogId: "sit-up", reps: 10, restSeconds: 30 }],
    })
    expect(dayDurationSeconds(day)).toBe(10 * SECONDS_PER_REP)
  })
})

describe("Program", () => {
  it.effect("decodes a one-day program", () =>
    Effect.gen(function* () {
      const program = yield* Schema.decodeUnknownEffect(Program)({
        programId: "core-30",
        name: "Core 30",
        tagline: "Thirty days of core.",
        description: "A guided core program.",
        days: [dayWire],
      })
      expect(program.days).toHaveLength(1)
    }),
  )

  it("findProgram is None for an unknown id", () => {
    expect(PROGRAMS.length).toBeGreaterThan(0)
    expect(Option.isNone(findProgram(ProgramId.make("no-such-program")))).toBe(true)
  })
})
