import { describe, expect, it } from "@effect/vitest"
import { Array as Arr, Effect, Option, Schema } from "effect"
import { failingPaths } from "../testing"
import { findProgram, PROGRAMS } from "./index"
import {
  dayDurationSeconds,
  expandDay,
  Program,
  ProgramDay,
  ProgramId,
  ProgramItem,
  RepsItem,
  setsOf,
} from "./Program"

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

  it("estimates 10 reps as 20 seconds (2 s a rep; the item's own rest is unused)", () => {
    const day = Schema.decodeUnknownSync(ProgramDay)({
      ...dayWire,
      rounds: 1,
      items: [{ kind: "reps", catalogId: "sit-up", reps: 10, restSeconds: 30 }],
    })
    expect(dayDurationSeconds(day)).toBe(20)
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

  it.effect("every built-in day decodes and re-encodes through ProgramDay", () =>
    Effect.gen(function* () {
      const all = Arr.flatMap(PROGRAMS, (program) => program.days)
      const back = yield* Effect.forEach(all, (day) =>
        Effect.flatMap(
          Schema.encodeEffect(ProgramDay)(day),
          Schema.decodeUnknownEffect(ProgramDay),
        ),
      )
      expect(back).toEqual(all)
    }),
  )
})

const reps = (sets: number | undefined, restSeconds = 90) => ({
  kind: "reps",
  catalogId: "barbell-bench-press",
  reps: 8,
  restSeconds,
  ...(sets === undefined ? {} : { sets }),
})

describe("RepsItem.sets", () => {
  it.effect("a minimal reps item (no sets key) decodes with sets 1", () =>
    Effect.gen(function* () {
      const item = yield* Schema.decodeUnknownEffect(RepsItem)(reps(undefined))
      expect(item.sets).toBe(1)
    }),
  )

  it.effect("rejects 0 and 11 sets", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(RepsItem, reps(11))).toEqual([["sets"]])
      expect(yield* failingPaths(RepsItem, reps(0))).toEqual([["sets"]])
    }),
  )

  it.effect("round-trips sets as a member of the ProgramItem union", () =>
    Effect.gen(function* () {
      const item = yield* Schema.decodeUnknownEffect(ProgramItem)(reps(4))
      const encoded = yield* Schema.encodeEffect(ProgramItem)(item)
      expect(encoded).toEqual(reps(4))
      expect(yield* Schema.decodeUnknownEffect(ProgramItem)(encoded)).toEqual(item)
    }),
  )
})

describe("expandDay", () => {
  const day = Schema.decodeUnknownSync(ProgramDay)({
    ...dayWire,
    rounds: 1,
    items: [reps(3, 90), timed(30, 20)],
  })

  it("runs a 3-set item as 3 steps, then the timed item", () => {
    const steps = expandDay(day)
    expect(steps.map((s) => [s.exerciseIndex, s.set, s.sets, s.restSeconds])).toEqual([
      [0, 1, 3, 90],
      [0, 2, 3, 90],
      [0, 3, 3, 90],
      [1, 1, 1, 20],
    ])
    expect(steps.every((s) => s.exercises === 2)).toBe(true)
  })

  it("counts every set in dayDurationSeconds (3 × 16 s + 30 s work, 3 × 90 s rest)", () => {
    expect(dayDurationSeconds(day)).toBe(3 * 16 + 30 + 3 * 90)
  })

  it("gives a timed item one set", () => {
    expect(setsOf(Schema.decodeUnknownSync(ProgramItem)(timed(30, 0)))).toBe(1)
  })
})
