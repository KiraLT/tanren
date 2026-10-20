import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Option, Schema } from "effect"
import {
  Email,
  Label,
  LocalDate,
  Note,
  OrderIndex,
  PageLimit,
  Reps,
  RestSeconds,
  ROW_COLUMNS,
  Rpe,
  rowFields,
  SyncTable,
  Text,
  Timestamp,
  TimeZone,
  WeightKg,
} from "./common"
import { SetId, UserId } from "./ids"
import { accepts, rejects } from "./testing"

describe("WeightKg", () => {
  it.effect("accepts 62.75 kg and 0 (bodyweight)", () =>
    Effect.all([accepts(WeightKg, 62.75), accepts(WeightKg, 0)]),
  )
  it.effect("rejects 100.1 kg (not a 0.25 step)", () => rejects(WeightKg, 100.1))
  it.effect("accepts 1000 kg", () => accepts(WeightKg, 1000))
  it.effect("rejects 1000.25 kg (above 1000)", () => rejects(WeightKg, 1000.25))
})

describe("Rpe", () => {
  it.effect("accepts 7.5", () => accepts(Rpe, 7.5))
  it.effect("rejects 7.25 (not a 0.5 step)", () => rejects(Rpe, 7.25))
  it.effect("accepts 1 and 10", () => Effect.all([accepts(Rpe, 1), accepts(Rpe, 10)]))
  it.effect("rejects 0.5 (below 1)", () => rejects(Rpe, 0.5))
  it.effect("rejects 10.5 (above 10)", () => rejects(Rpe, 10.5))
})

describe("Reps", () => {
  it.effect("accepts 0", () => accepts(Reps, 0))
  it.effect("rejects -1", () => rejects(Reps, -1))
  it.effect("rejects 5.5 (not an integer)", () => rejects(Reps, 5.5))
})

describe("LocalDate", () => {
  it.effect("accepts the leap day 2024-02-29", () => accepts(LocalDate, "2024-02-29"))
  it.effect("rejects 2026-02-30", () => rejects(LocalDate, "2026-02-30"))
  it.effect("rejects 2026-1-5 (not zero-padded)", () => rejects(LocalDate, "2026-1-5"))
  it.effect("rejects month 13", () => rejects(LocalDate, "2026-13-01"))
  it.effect("rejects 2100-02-29 (2100 is not a leap year)", () => rejects(LocalDate, "2100-02-29"))
})

describe("Label", () => {
  it.effect("accepts a trimmed string", () => accepts(Label, "Squat"))
  it.effect("rejects an untrimmed string", () => rejects(Label, " x"))
  it.effect("rejects 81 characters", () => rejects(Label, "x".repeat(81)))
})

describe("Note", () => {
  it.effect("accepts 500 characters", () => accepts(Note, "x".repeat(500)))
  it.effect("rejects 501 characters", () => rejects(Note, "x".repeat(501)))
  it.effect("rejects the empty string", () => rejects(Note, ""))
})

describe("Text", () => {
  it.effect("accepts 4000 characters", () => accepts(Text, "x".repeat(4000)))
  it.effect("rejects 4001 characters", () => rejects(Text, "x".repeat(4001)))
  it.effect("rejects the empty string", () => rejects(Text, ""))
})

describe("Email", () => {
  it.effect("accepts lukas@tanren.me", () => accepts(Email, "lukas@tanren.me"))
  it.effect("rejects a string without @", () => rejects(Email, "lukas.tanren.me"))
})

describe("OrderIndex", () => {
  it.effect("accepts 0", () => accepts(OrderIndex, 0))
  it.effect("rejects -1", () => rejects(OrderIndex, -1))
  it.effect("rejects 1.5 (not an integer)", () => rejects(OrderIndex, 1.5))
})

describe("RestSeconds", () => {
  it.effect("accepts 3600", () => accepts(RestSeconds, 3600))
  it.effect("rejects 3601 (above an hour)", () => rejects(RestSeconds, 3601))
})

describe("PageLimit", () => {
  it.effect("accepts 1 and 500", () => Effect.all([accepts(PageLimit, 1), accepts(PageLimit, 500)]))
  it.effect("rejects 0", () => rejects(PageLimit, 0))
  it.effect("rejects 501", () => rejects(PageLimit, 501))
})

describe("TimeZone", () => {
  it.effect("accepts Europe/Berlin", () => accepts(TimeZone, "Europe/Berlin"))
  it.effect("rejects a name with a space", () => rejects(TimeZone, "Europe/Berlin Mitte"))
})

describe("SyncTable", () => {
  it.effect("rejects user, which is not synced", () => rejects(SyncTable, "user"))
})

describe("Timestamp", () => {
  it.effect("normalises an offset to UTC and encodes canonically", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(Timestamp)("2026-10-19T12:00:00+02:00")
      expect(DateTime.isUtc(decoded)).toBe(true)
      const encoded = yield* Schema.encodeEffect(Timestamp)(decoded)
      expect(encoded).toBe("2026-10-19T10:00:00.000Z")
    }),
  )
  it.effect("rejects an unparsable string", () => rejects(Timestamp, "not a date"))
  it.effect("accepts a Z timestamp without milliseconds", () =>
    accepts(Timestamp, "2026-10-19T12:00:00Z"),
  )
  it.effect("rejects a bare year", () => rejects(Timestamp, "2026"))
  it.effect("rejects a bare date", () => rejects(Timestamp, "2026-10-19"))
  it.effect("rejects a zone-less date-time", () => rejects(Timestamp, "2026-10-19T12:00:00"))
})

class Row extends Schema.Class<Row>("@tanren/shared/test/Row")({
  ...rowFields(SetId),
  reps: Reps,
}) {}

const wireRow = {
  id: "0b9f5c1e-6d43-4c1a-9a3e-2f4f1a2b3c4d",
  userId: "1b9f5c1e-6d43-4c1a-9a3e-2f4f1a2b3c4d",
  createdAt: "2026-10-19T10:00:00.000Z",
  updatedAt: "2026-10-19T10:00:00.000Z",
  deletedAt: null,
  reps: 5,
}

describe("rowFields", () => {
  it.effect("spreads into a Schema.Class and decodes null deletedAt as None", () =>
    Effect.gen(function* () {
      const row = yield* Schema.decodeUnknownEffect(Row)(wireRow)
      expect(row.id).toBe(SetId.make(wireRow.id))
      expect(row.userId).toBe(UserId.make(wireRow.userId))
      expect(Option.isNone(row.deletedAt)).toBe(true)
    }),
  )
  it.effect("names ROW_COLUMNS as the keys rowFields defines", () =>
    Effect.sync(() => {
      expect(Object.keys(rowFields(SetId))).toEqual([...ROW_COLUMNS])
    }),
  )
})
