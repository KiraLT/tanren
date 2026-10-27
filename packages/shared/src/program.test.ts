import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import { Array as Arr, Effect, Option, Order, Schema } from "effect"
import { UserProgramId } from "./ids"
import {
  ProgramDayCompletion,
  ProgramDayCompletionInsert,
  ProgramDayCompletionPatch,
  ProgramEnrollment,
  ProgramEnrollmentInsert,
  ProgramEnrollmentPatch,
  ProgramSchedule,
  ProgramSummary,
  programIdOfRow,
  Swaps,
  summarize,
  toProgram,
  UserProgram,
  UserProgramInsert,
  UserProgramPatch,
} from "./program"
import { CORE30 } from "./programs/core30"
import { ProgramId } from "./programs/Program"
import {
  ProgramDayCompletionRow,
  ProgramEnrollmentRow,
  ROW_KEYS,
  ROW_TABLE,
  UserProgramRow,
} from "./row"
import { failingPaths, roundTrips, wireRoundTrips } from "./testing"

const rowColumns = {
  userId: "6f1d2b7e-3c4a-4e2b-9a0e-1f2a3b4c5d6e",
  createdAt: "2026-10-21T08:00:00.000Z",
  updatedAt: "2026-10-21T08:00:00.000Z",
  deletedAt: null,
}
const enrollmentId = "77777777-7777-4777-8777-777777777777"

const enrollmentWire = {
  ...rowColumns,
  id: enrollmentId,
  programId: "core-30",
  startedOn: "2026-10-21",
  status: "active" as const,
  currentDay: 1,
  swaps: [{ from: "push-up", to: "incline-push-up" }],
}
/** The DB record: `swaps` is a JSON TEXT column. */
const enrollmentRecord = { ...enrollmentWire, swaps: JSON.stringify(enrollmentWire.swaps) }
const completionWire = {
  ...rowColumns,
  id: "88888888-8888-4888-8888-888888888888",
  enrollmentId,
  dayNumber: 1,
  completedAt: "2026-10-21T08:15:00.000Z",
  durationSeconds: 900,
  sessionId: null,
}

const sorted = Arr.sort(Order.String)

describe("ProgramEnrollment", () => {
  it.effect("round-trips the wire shape", () =>
    Effect.gen(function* () {
      yield* wireRoundTrips(ProgramEnrollment, enrollmentWire)
      yield* roundTrips(
        ProgramEnrollment,
        Schema.decodeUnknownSync(ProgramEnrollment)(enrollmentWire),
      )
    }),
  )

  it.effect("rejects an unknown status and a programId that is not a slug", () =>
    Effect.gen(function* () {
      expect(
        yield* failingPaths(ProgramEnrollment, { ...enrollmentWire, status: "frozen" }),
      ).toEqual([["status"]])
      expect(
        yield* failingPaths(ProgramEnrollment, { ...enrollmentWire, programId: "Core 30" }),
      ).toEqual([["programId"]])
    }),
  )

  it.effect("accepts currentDay = days.length + 1 for a 365-day program (completed)", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(ProgramEnrollment)({
        ...enrollmentWire,
        currentDay: 366,
      })
      expect(decoded.currentDay).toBe(366)
    }),
  )

  it("Patch cannot change the immutable programId or startedOn", () => {
    expect(Object.keys(ProgramEnrollmentPatch.fields)).not.toContain("programId")
    expect(Object.keys(ProgramEnrollmentPatch.fields)).not.toContain("startedOn")
  })
})

describe("ProgramDayCompletion", () => {
  it.effect("round-trips the wire shape, with a null sessionId decoded as None", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(ProgramDayCompletion)(completionWire)
      expect(Option.isNone(decoded.sessionId)).toBe(true)
      yield* wireRoundTrips(ProgramDayCompletion, completionWire)
    }),
  )

  it.effect("rejects day 0 and a negative duration", () =>
    Effect.gen(function* () {
      expect(
        yield* failingPaths(ProgramDayCompletion, { ...completionWire, dayNumber: 0 }),
      ).toEqual([["dayNumber"]])
      expect(
        yield* failingPaths(ProgramDayCompletion, { ...completionWire, durationSeconds: -1 }),
      ).toEqual([["durationSeconds"]])
    }),
  )

  it("Insert omits the sync columns; Patch also the parent key and dayNumber", () => {
    expect(sorted(Object.keys(ProgramDayCompletionInsert.fields))).toEqual(
      sorted(["enrollmentId", "dayNumber", "completedAt", "durationSeconds", "sessionId"]),
    )
    expect(sorted(Object.keys(ProgramDayCompletionPatch.fields))).toEqual(
      sorted(["completedAt", "durationSeconds", "sessionId"]),
    )
  })
})

describe("program row codecs", () => {
  it.effect("decode a flat DB record into the entity and encode it back", () =>
    Effect.gen(function* () {
      const enrollment = yield* Schema.decodeUnknownEffect(ProgramEnrollmentRow)(enrollmentRecord)
      expect(enrollment.swaps).toEqual(enrollmentWire.swaps)
      expect(yield* Schema.encodeEffect(ProgramEnrollmentRow)(enrollment)).toEqual(enrollmentRecord)
      const completion = yield* Schema.decodeUnknownEffect(ProgramDayCompletionRow)(completionWire)
      expect(yield* Schema.encodeEffect(ProgramDayCompletionRow)(completion)).toEqual(
        completionWire,
      )
    }),
  )

  it("name their tables and list the record keys", () => {
    expect(ROW_TABLE.programEnrollment).toBe("program_enrollment")
    expect(ROW_TABLE.programDayCompletion).toBe("program_day_completion")
    expect(sorted(ROW_KEYS.programEnrollment)).toEqual(sorted(Object.keys(enrollmentWire)))
    expect(sorted(ROW_KEYS.programDayCompletion)).toEqual(sorted(Object.keys(completionWire)))
  })
})

const userProgramWire = {
  ...rowColumns,
  id: "99999999-9999-4999-8999-999999999999",
  title: "Push Pull",
  slug: "push-pull",
  summary: "Two days a week.",
  description: null,
  days: [
    {
      dayNumber: 1,
      title: "Day 1",
      rounds: 2,
      items: [{ kind: "reps" as const, catalogId: "push-up", reps: 10, restSeconds: 30, sets: 3 }],
      restBetweenRoundsSeconds: 60,
    },
  ],
  schedule: { kind: "daysPerWeek" as const, days: 2 },
  source: "mcp" as const,
  version: 1,
}
const userProgramRecord = {
  ...userProgramWire,
  days: JSON.stringify(userProgramWire.days),
  schedule: JSON.stringify(userProgramWire.schedule),
}
const swap = (from: string, to: string) => ({ from, to })

describe("ProgramEnrollment v6 (paused, swaps)", () => {
  it.effect("accepts the paused status", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(ProgramEnrollment)({
        ...enrollmentWire,
        status: "paused",
      })
      expect(decoded.status).toBe("paused")
    }),
  )

  it.effect("decodes a pre-v6 wire row without swaps as []", () =>
    Effect.gen(function* () {
      const { swaps: _omitted, ...legacy } = enrollmentWire
      const decoded = yield* Schema.decodeUnknownEffect(ProgramEnrollment)(legacy)
      expect(decoded.swaps).toEqual([])
    }),
  )

  it("Insert's Type carries swaps (the wire may omit it: it decodes as [])", () => {
    expectTypeOf<ProgramEnrollmentInsert["swaps"]>().toEqualTypeOf<Swaps>()
    expect(Object.keys(ProgramEnrollmentInsert.fields)).toContain("swaps")
  })

  it.effect("Patch: {} decodes to zero keys and { swaps } to exactly that key", () =>
    Effect.gen(function* () {
      expect(Object.keys(yield* Schema.decodeUnknownEffect(ProgramEnrollmentPatch)({}))).toEqual([])
      const one = yield* Schema.decodeUnknownEffect(ProgramEnrollmentPatch)({ swaps: [] })
      expect(Object.keys(one)).toEqual(["swaps"])
    }),
  )
})

describe("Swaps", () => {
  it.effect("accepts 30 swaps with distinct from ids", () =>
    Effect.gen(function* () {
      const thirty = Arr.makeBy(30, (i) => swap(`ex-${i}`, "plank"))
      expect(yield* Schema.decodeUnknownEffect(Swaps)(thirty)).toHaveLength(30)
    }),
  )

  it.effect("rejects 31 swaps", () =>
    Effect.gen(function* () {
      const thirtyOne = Arr.makeBy(31, (i) => swap(`ex-${i}`, "plank"))
      expect(yield* failingPaths(Swaps, thirtyOne)).toEqual([[]])
    }),
  )

  it.effect("rejects a second swap for the same from, pointing at it", () =>
    Effect.gen(function* () {
      const twice = [swap("push-up", "incline-push-up"), swap("push-up", "knee-push-up")]
      expect(yield* failingPaths(Swaps, twice)).toEqual([[1, "from"]])
    }),
  )
})

describe("ProgramSchedule", () => {
  it.effect("decodes both arms and round-trips them", () =>
    Effect.gen(function* () {
      yield* wireRoundTrips(ProgramSchedule, { kind: "daysPerWeek", days: 3 })
      yield* wireRoundTrips(ProgramSchedule, { kind: "weekdays", weekdays: ["mon", "thu"] })
    }),
  )

  it.effect("rejects 8 days per week and an empty weekday list", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(ProgramSchedule, { kind: "daysPerWeek", days: 8 })).toEqual([
        ["days"],
      ])
      expect(yield* failingPaths(ProgramSchedule, { kind: "weekdays", weekdays: [] })).toEqual([
        ["weekdays"],
      ])
    }),
  )
})

describe("UserProgram", () => {
  it.effect("round-trips the wire shape and the DB record", () =>
    Effect.gen(function* () {
      yield* wireRoundTrips(UserProgram, userProgramWire)
      const row = yield* Schema.decodeUnknownEffect(UserProgramRow)(userProgramRecord)
      expect(yield* Schema.encodeEffect(UserProgramRow)(row)).toEqual(userProgramRecord)
    }),
  )

  it.effect("accepts 84 days, rejects 85 days and the builtin source", () =>
    Effect.gen(function* () {
      const [day] = userProgramWire.days
      const daysOf = (n: number) => Arr.makeBy(n, (i) => ({ ...day, dayNumber: i + 1 }))
      yield* Schema.decodeUnknownEffect(UserProgram)({ ...userProgramWire, days: daysOf(84) })
      expect(yield* failingPaths(UserProgram, { ...userProgramWire, days: daysOf(85) })).toEqual([
        ["days"],
      ])
      expect(yield* failingPaths(UserProgram, { ...userProgramWire, source: "builtin" })).toEqual([
        ["source"],
      ])
    }),
  )

  it("names its table and lists the record keys", () => {
    expect(ROW_TABLE.program).toBe("program")
    expect(sorted(ROW_KEYS.program)).toEqual(sorted(Object.keys(userProgramWire)))
  })

  it("Insert omits the sync columns", () => {
    expect(sorted(Object.keys(UserProgramInsert.fields))).toEqual(
      sorted(["title", "slug", "summary", "description", "days", "schedule", "source", "version"]),
    )
  })

  it.effect("Patch: {} decodes to zero keys, { title } to exactly that key, slug is absent", () =>
    Effect.gen(function* () {
      expect(Object.keys(yield* Schema.decodeUnknownEffect(UserProgramPatch)({}))).toEqual([])
      const one = yield* Schema.decodeUnknownEffect(UserProgramPatch)({ title: "Renamed" })
      expect(one).toEqual({ title: "Renamed" })
      expect(Object.keys(UserProgramPatch.fields)).not.toContain("slug")
      expect(Object.keys(UserProgramPatch.fields)).not.toContain("source")
    }),
  )
})

describe("programIdOfRow / toProgram", () => {
  it.effect("a lower-case UUID decodes as a ProgramId", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(ProgramId)(userProgramWire.id)
      expect(decoded).toBe(userProgramWire.id)
    }),
  )

  it("programIdOfRow lower-cases the row id", () => {
    const upper = UserProgramId.make("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA")
    expect(programIdOfRow(upper)).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
  })

  it.effect("toProgram maps title, summary and a missing description to the summary", () =>
    Effect.gen(function* () {
      const row = yield* Schema.decodeUnknownEffect(UserProgram)(userProgramWire)
      const program = toProgram(row)
      expect(program.programId).toBe(userProgramWire.id)
      expect(program.name).toBe("Push Pull")
      expect(program.tagline).toBe("Two days a week.")
      expect(program.description).toBe("Two days a week.")
      expect(program.days).toHaveLength(1)
    }),
  )
})

describe("summarize", () => {
  it("reports a built-in with source builtin, schedule None and no enrollment", () => {
    const summary = summarize(
      CORE30,
      { source: "builtin", version: 1, schedule: Option.none() },
      Option.none(),
    )
    expect(summary.source).toBe("builtin")
    expect(Option.isNone(summary.schedule)).toBe(true)
    expect(Option.isNone(summary.enrollment)).toBe(true)
    expect(summary.days).toBe(CORE30.days.length)
    expect(summary.minutesPerDay.min).toBeLessThanOrEqual(summary.minutesPerDay.max)
  })

  it.effect("carries the live enrollment and encodes as ProgramSummary", () =>
    Effect.gen(function* () {
      const enrollment = yield* Schema.decodeUnknownEffect(ProgramEnrollment)(enrollmentWire)
      const row = yield* Schema.decodeUnknownEffect(UserProgram)(userProgramWire)
      const summary = summarize(
        toProgram(row),
        { source: row.source, version: row.version, schedule: Option.some(row.schedule) },
        Option.some(enrollment),
      )
      expect(Option.map(summary.enrollment, (e) => e.status)).toEqual(Option.some("active"))
      // 2 rounds × (3 sets × 20 s + 2 × 30 s between sets) + 60 s between rounds = 300 s
      expect(summary.minutesPerDay).toEqual({ min: 5, max: 5 })
      yield* roundTrips(ProgramSummary, summary)
    }),
  )
})
