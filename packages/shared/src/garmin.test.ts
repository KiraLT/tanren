import { describe, expect, it } from "@effect/vitest"
import { Array as Arr, Effect, Option, Order, Schema } from "effect"
import {
  DailyHealth,
  DailyHealthInsert,
  DailyHealthPatch,
  GarminCursor,
  GarminCursorJson,
  ImportedActivity,
  ImportedActivityInsert,
  ImportedActivityPatch,
  ImportedSport,
  sportOf,
} from "./garmin"
import { ImportedActivityId } from "./ids"
import { DailyHealthRow, ImportedActivityRow } from "./row"
import { failingPaths, roundTrips, wireRoundTrips } from "./testing"

const rowColumns = {
  userId: "6f1d2b7e-3c4a-4e2b-9a0e-1f2a3b4c5d6e",
  createdAt: "2026-10-27T08:00:00.000Z",
  updatedAt: "2026-10-27T08:00:00.000Z",
  deletedAt: null,
}

const activityWire = {
  ...rowColumns,
  id: "99999999-9999-4999-8999-999999999999",
  provider: "garmin",
  externalId: "18012345678",
  sport: "running",
  title: "Morning Run",
  startedAt: "2026-10-27T06:30:00.000Z",
  durationSeconds: 1800,
  distanceMeters: 5120.5,
  calories: 410,
  avgHeartRate: 152,
  maxHeartRate: 171,
} as const
const strengthWire = {
  ...activityWire,
  id: "99999999-9999-4999-8999-99999999999a",
  externalId: "18012345679",
  sport: "strength",
  title: "Strength",
  distanceMeters: null,
  calories: null,
  avgHeartRate: null,
  maxHeartRate: null,
} as const
const dayWire = {
  ...rowColumns,
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  provider: "garmin",
  date: "2026-10-27",
  totalCalories: 2450,
  activeCalories: 600,
  steps: 9120,
  restingHeartRate: 52,
} as const
const emptyDayWire = {
  ...dayWire,
  totalCalories: null,
  activeCalories: null,
  steps: null,
  restingHeartRate: null,
} as const

const sorted = Arr.sort(Order.String)

describe("ImportedActivity", () => {
  it.effect("round-trips the wire shape, null fields decoded as None", () =>
    Effect.gen(function* () {
      yield* wireRoundTrips(ImportedActivity, activityWire)
      yield* wireRoundTrips(ImportedActivity, strengthWire)
      const strength = yield* Schema.decodeUnknownEffect(ImportedActivity)(strengthWire)
      expect(Option.isNone(strength.distanceMeters)).toBe(true)
      expect(Option.isNone(strength.calories)).toBe(true)
      const run = Schema.decodeUnknownSync(ImportedActivity)(activityWire)
      expect(Option.getOrNull(run.distanceMeters)).toBe(5120.5)
      yield* roundTrips(ImportedActivity, run)
    }),
  )

  it.effect("rejects an unknown sport, a negative duration and an out-of-range heart rate", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(ImportedActivity, { ...activityWire, sport: "yoga" })).toEqual([
        ["sport"],
      ])
      expect(
        yield* failingPaths(ImportedActivity, { ...activityWire, durationSeconds: -1 }),
      ).toEqual([["durationSeconds"]])
      expect(yield* failingPaths(ImportedActivity, { ...activityWire, avgHeartRate: 19 })).toEqual([
        ["avgHeartRate"],
      ])
      expect(yield* failingPaths(ImportedActivity, { ...activityWire, maxHeartRate: 261 })).toEqual(
        [["maxHeartRate"]],
      )
      expect(yield* failingPaths(ImportedActivity, { ...activityWire, provider: "polar" })).toEqual(
        [["provider"]],
      )
    }),
  )

  it("Insert omits the sync columns; Patch also the immutable provider and externalId", () => {
    expect(sorted(Object.keys(ImportedActivityInsert.fields))).toEqual(
      sorted([
        "provider",
        "externalId",
        "sport",
        "title",
        "startedAt",
        "durationSeconds",
        "distanceMeters",
        "calories",
        "avgHeartRate",
        "maxHeartRate",
      ]),
    )
    expect(sorted(Object.keys(ImportedActivityPatch.fields))).toEqual(
      sorted([
        "sport",
        "title",
        "startedAt",
        "durationSeconds",
        "distanceMeters",
        "calories",
        "avgHeartRate",
        "maxHeartRate",
      ]),
    )
  })

  it.effect("Patch `{}` decodes to zero keys", () =>
    Effect.gen(function* () {
      const patch = yield* Schema.decodeUnknownEffect(ImportedActivityPatch)({})
      expect(Object.keys(patch)).toEqual([])
    }),
  )

  it("brands the id", () => {
    expect(Schema.is(ImportedActivityId)(activityWire.id)).toBe(true)
    expect(Schema.is(ImportedActivityId)("nope")).toBe(false)
  })
})

describe("DailyHealth", () => {
  it.effect("round-trips the wire shape, with all-null metrics decoded as None", () =>
    Effect.gen(function* () {
      yield* wireRoundTrips(DailyHealth, dayWire)
      yield* wireRoundTrips(DailyHealth, emptyDayWire)
      const empty = yield* Schema.decodeUnknownEffect(DailyHealth)(emptyDayWire)
      expect(Option.isNone(empty.steps)).toBe(true)
      yield* roundTrips(DailyHealth, Schema.decodeUnknownSync(DailyHealth)(dayWire))
    }),
  )

  it.effect("rejects a malformed date, negative steps and a resting heart rate of 0", () =>
    Effect.gen(function* () {
      expect(yield* failingPaths(DailyHealth, { ...dayWire, date: "27-10-2026" })).toEqual([
        ["date"],
      ])
      expect(yield* failingPaths(DailyHealth, { ...dayWire, steps: -5 })).toEqual([["steps"]])
      expect(yield* failingPaths(DailyHealth, { ...dayWire, restingHeartRate: 0 })).toEqual([
        ["restingHeartRate"],
      ])
    }),
  )

  it("Insert omits the sync columns; Patch also the immutable provider and date", () => {
    expect(sorted(Object.keys(DailyHealthInsert.fields))).toEqual(
      sorted(["provider", "date", "totalCalories", "activeCalories", "steps", "restingHeartRate"]),
    )
    expect(sorted(Object.keys(DailyHealthPatch.fields))).toEqual(
      sorted(["totalCalories", "activeCalories", "steps", "restingHeartRate"]),
    )
  })

  it.effect("Patch `{}` decodes to zero keys", () =>
    Effect.gen(function* () {
      const patch = yield* Schema.decodeUnknownEffect(DailyHealthPatch)({})
      expect(Object.keys(patch)).toEqual([])
    }),
  )
})

describe("sportOf", () => {
  it("maps Garmin type keys", () => {
    expect(sportOf("running")).toBe("running")
    expect(sportOf("trail_running")).toBe("running")
    expect(sportOf("lap_swimming")).toBe("swimming")
    expect(sportOf("indoor_cycling")).toBe("cycling")
    expect(sportOf("strength_training")).toBe("strength")
    expect(sportOf("hiking")).toBe("hiking")
    expect(sportOf("Walking ")).toBe("walking")
  })

  it("maps unknown keys, the empty string and Object prototype names to other", () => {
    expect(sportOf("yoga")).toBe("other")
    expect(sportOf("")).toBe("other")
    expect(sportOf("constructor")).toBe("other")
    expect(sportOf("__proto__")).toBe("other")
  })

  it("only ever returns a member of ImportedSport", () => {
    expect(
      ["running", "pilates", "hiit", "stair_stepper"].every((key) =>
        ImportedSport.literals.includes(sportOf(key)),
      ),
    ).toBe(true)
  })
})

describe("GarminCursor", () => {
  const cursorWire = {
    activitiesSince: "2026-10-26T00:00:00.000Z",
    healthThrough: "2026-10-26",
    lastPullAt: "2026-10-27T08:05:00.000Z",
    lastError: null,
  } as const

  it.effect("round-trips the wire shape", () =>
    Effect.gen(function* () {
      yield* wireRoundTrips(GarminCursor, cursorWire)
      yield* wireRoundTrips(GarminCursor, {
        ...cursorWire,
        lastPullAt: null,
        lastError: "token_rejected",
      })
    }),
  )

  it.effect("the JSON codec reads and writes the `scope` column text", () =>
    Effect.gen(function* () {
      const text = JSON.stringify(cursorWire)
      const cursor = yield* Schema.decodeUnknownEffect(GarminCursorJson)(text)
      expect(Option.isNone(cursor.lastError)).toBe(true)
      expect(JSON.parse(yield* Schema.encodeEffect(GarminCursorJson)(cursor))).toEqual(cursorWire)
    }),
  )

  it.effect("rejects the empty scope text a fresh row carries", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(Schema.decodeUnknownEffect(GarminCursorJson)(""))
      expect(error).toBeInstanceOf(Schema.SchemaError)
    }),
  )
})

// The SyncTable / SyncChange / ROW_TABLE / ROW_KEYS members land with GM-2 (they force db + worker + app edits).
describe("garmin row codecs", () => {
  it.effect("row codecs decode a flat DB record into the entity and encode it back", () =>
    Effect.gen(function* () {
      const activity = yield* Schema.decodeUnknownEffect(ImportedActivityRow)(activityWire)
      expect(yield* Schema.encodeEffect(ImportedActivityRow)(activity)).toEqual(activityWire)
      const day = yield* Schema.decodeUnknownEffect(DailyHealthRow)(dayWire)
      expect(yield* Schema.encodeEffect(DailyHealthRow)(day)).toEqual(dayWire)
    }),
  )
})
