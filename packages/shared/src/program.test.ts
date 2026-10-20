import { describe, expect, it } from "@effect/vitest"
import { Array as Arr, Effect, Option, Order, Schema } from "effect"
import {
  ProgramDayCompletion,
  ProgramDayCompletionInsert,
  ProgramDayCompletionPatch,
  ProgramEnrollment,
  ProgramEnrollmentPatch,
} from "./program"
import { ProgramDayCompletionRow, ProgramEnrollmentRow, ROW_KEYS, ROW_TABLE } from "./row"
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
}
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
        yield* failingPaths(ProgramEnrollment, { ...enrollmentWire, status: "paused" }),
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
      const enrollment = yield* Schema.decodeUnknownEffect(ProgramEnrollmentRow)(enrollmentWire)
      expect(yield* Schema.encodeEffect(ProgramEnrollmentRow)(enrollment)).toEqual(enrollmentWire)
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
