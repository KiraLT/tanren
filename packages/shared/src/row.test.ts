import { describe, expect, it } from "@effect/vitest"
import { Array as Arr, Effect, Option, Order, Schema } from "effect"
import { SyncTable } from "./common"
import { Exercise } from "./exercise"
import { FoodEntry } from "./nutrition"
import { Plan, type PlanEncoded, PlannedSession, PlannedSet, PlanWeek } from "./plan"
import {
  ExerciseRow,
  FoodEntryRow,
  PlannedSessionRow,
  PlannedSetRow,
  PlanRow,
  PlanWeekRow,
  ProfileRow,
  ROW_KEYS,
  ROW_TABLE,
  SessionRow,
  WorkoutSetRow,
} from "./row"
import { Session, WorkoutSet } from "./session"
import { failingPaths, wireRoundTrips } from "./testing"
import { Profile } from "./user"

const rowColumns = {
  userId: "6f1d2b7e-3c4a-4e2b-9a0e-1f2a3b4c5d6e",
  createdAt: "2026-10-19T08:00:00.000Z",
  updatedAt: "2026-10-19T08:00:00.000Z",
  deletedAt: null,
}
const deleted = { updatedAt: "2026-10-20T08:00:00.000Z", deletedAt: "2026-10-20T08:00:00.000Z" }
const planId = "11111111-1111-4111-8111-111111111111"
const planWeekId = "22222222-2222-4222-8222-222222222222"
const plannedSessionId = "33333333-3333-4333-8333-333333333333"
const exerciseId = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
const sessionId = "55555555-5555-4555-8555-555555555555"

const profileRecord = {
  ...rowColumns,
  id: rowColumns.userId,
  goals: '[{"kind":"strength","note":null},{"kind":"other","note":"handstand"}]',
  constraints: '["no overhead pressing"]',
  availableDays: '["mon","wed","fri"]',
  equipment: "[]",
  locations:
    '[{"id":"0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c","name":"Home","equipment":["dumbbell"]}]',
  activeLocationId: "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c",
  timezone: "Europe/Vilnius",
  nutrition: null,
}
const nutritionJson =
  '{"goal":"gain_muscle","bodyWeightKg":85,"heightCm":180,"birthYear":1990,"sex":"male","activityLevel":"moderate","eatBackActive":false,"kcalTarget":null,"proteinTargetG":null}'
const foodEntryRecord = {
  ...rowColumns,
  id: "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f",
  loggedAt: "2026-10-27T12:40:00.000Z",
  meal: "lunch" as const,
  source: "mcp" as const,
  items:
    '[{"name":"Chicken rice bowl","portion":"1 bowl, ~450 g","grams":450,"kcal":650,"proteinG":45,"carbsG":70,"fatG":15,"fibreG":null,"confidence":0.6}]',
  kcal: 650,
  proteinG: 45,
  carbsG: 70,
  fatG: 15,
  note: null,
}
const exerciseRecord = {
  ...rowColumns,
  id: exerciseId,
  name: "Back squat",
  aliases: '["squat"]',
  muscleGroups: '["quads","glutes"]',
  notes: null,
  catalogId: null,
}
const planRecord: PlanEncoded = {
  ...rowColumns,
  id: planId,
  name: "Strength block",
  goal: "Squat to 140",
  startDate: "2026-10-19",
  status: "active",
}
const planWeekRecord = {
  ...rowColumns,
  id: planWeekId,
  planId,
  weekStart: "2026-10-19",
  intent: null,
}
const plannedSessionRecord = {
  ...rowColumns,
  id: plannedSessionId,
  planWeekId,
  order: 0,
  name: "Lower A",
  scheduledDate: null,
  notes: null,
}
const plannedSetRecord = {
  ...rowColumns,
  id: "44444444-4444-4444-8444-444444444444",
  plannedSessionId,
  exerciseId,
  order: 0,
  targetWeightKg: null,
  targetReps: '{"_tag":"Exact","reps":5}',
  targetRpe: null,
  restSeconds: null,
  note: null,
}
const sessionRecord = {
  ...rowColumns,
  id: sessionId,
  startedAt: "2026-10-19T08:00:00.000Z",
  finishedAt: null,
  plannedSessionId: null,
  notes: null,
}
const workoutSetRecord = {
  ...rowColumns,
  id: "66666666-6666-4666-8666-666666666666",
  sessionId,
  exerciseId,
  order: 0,
  weightKg: 102.5,
  reps: 5,
  rpe: null,
  note: null,
  plannedSetId: null,
  loggedAt: "2026-10-19T08:05:00.000Z",
}

const sorted = (keys: ReadonlyArray<string>) => Arr.sort(keys, Order.String)

/** DB record → entity instance → identical DB record. */
const decodesToInstance = <T, E>(
  row: Schema.Codec<T, E>,
  entity: abstract new (...args: never[]) => unknown,
  record: E,
) =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknownEffect(row)(record)
    expect(decoded).toBeInstanceOf(entity)
    yield* wireRoundTrips(row, record)
  })

describe("row codecs round-trip a DB record through the entity class", () => {
  it.effect("ProfileRow, JSON columns as strings", () =>
    decodesToInstance(ProfileRow, Profile, profileRecord),
  )
  it.effect("ProfileRow, soft deleted", () =>
    decodesToInstance(ProfileRow, Profile, { ...profileRecord, ...deleted }),
  )
  it.effect("ProfileRow, nutrition JSON column set", () =>
    Effect.gen(function* () {
      const record = { ...profileRecord, nutrition: nutritionJson }
      yield* decodesToInstance(ProfileRow, Profile, record)
      const profile = yield* Schema.decodeUnknownEffect(ProfileRow)(record)
      expect(Option.map(profile.nutrition, (n) => n.goal)).toEqual(Option.some("gain_muscle"))
    }),
  )
  it.effect("FoodEntryRow, items as a JSON string", () =>
    decodesToInstance(FoodEntryRow, FoodEntry, foodEntryRecord),
  )
  it.effect("ExerciseRow, empty notes", () =>
    decodesToInstance(ExerciseRow, Exercise, exerciseRecord),
  )
  it.effect("ExerciseRow, notes set and empty JSON arrays", () =>
    decodesToInstance(ExerciseRow, Exercise, {
      ...exerciseRecord,
      aliases: "[]",
      muscleGroups: "[]",
      notes: "keep the chest up",
    }),
  )
  it.effect("PlanRow", () => decodesToInstance(PlanRow, Plan, planRecord))
  it.effect("PlanWeekRow, null intent", () =>
    decodesToInstance(PlanWeekRow, PlanWeek, planWeekRecord),
  )
  it.effect("PlanWeekRow, intent set", () =>
    decodesToInstance(PlanWeekRow, PlanWeek, { ...planWeekRecord, intent: "deload" }),
  )
  it.effect("PlannedSessionRow, scheduled", () =>
    decodesToInstance(PlannedSessionRow, PlannedSession, {
      ...plannedSessionRecord,
      scheduledDate: "2026-10-20",
      notes: "start light",
    }),
  )
  it.effect("PlannedSessionRow, every Option null", () =>
    decodesToInstance(PlannedSessionRow, PlannedSession, plannedSessionRecord),
  )
  it.effect("PlannedSetRow, Exact target", () =>
    decodesToInstance(PlannedSetRow, PlannedSet, plannedSetRecord),
  )
  it.effect("PlannedSetRow, Range target and every Option set", () =>
    decodesToInstance(PlannedSetRow, PlannedSet, {
      ...plannedSetRecord,
      targetReps: '{"_tag":"Range","min":8,"max":12}',
      targetWeightKg: 80,
      targetRpe: 8,
      restSeconds: 120,
      note: "pause at the bottom",
    }),
  )
  it.effect("SessionRow, in progress", () => decodesToInstance(SessionRow, Session, sessionRecord))
  it.effect("SessionRow, finished", () =>
    decodesToInstance(SessionRow, Session, {
      ...sessionRecord,
      finishedAt: "2026-10-19T09:00:00.000Z",
      notes: "felt good",
    }),
  )
  it.effect("WorkoutSetRow, every Option null", () =>
    decodesToInstance(WorkoutSetRow, WorkoutSet, workoutSetRecord),
  )
  it.effect("WorkoutSetRow, every Option set", () =>
    decodesToInstance(WorkoutSetRow, WorkoutSet, {
      ...workoutSetRecord,
      rpe: 8.5,
      note: "grindy",
      plannedSetId: "44444444-4444-4444-8444-444444444444",
    }),
  )
})

describe("row codecs map null and None", () => {
  it.effect("a null column decodes to Option.none", () =>
    Effect.gen(function* () {
      const set = yield* Schema.decodeUnknownEffect(WorkoutSetRow)(workoutSetRecord)
      expect(Option.isNone(set.rpe)).toBe(true)
      expect(Option.isNone(set.deletedAt)).toBe(true)
    }),
  )

  it.effect("Option.none encodes to a null column", () =>
    Effect.gen(function* () {
      const set = yield* Schema.decodeUnknownEffect(WorkoutSetRow)({ ...workoutSetRecord, rpe: 8 })
      const record = yield* Schema.encodeEffect(WorkoutSetRow)(
        new WorkoutSet({ ...set, rpe: Option.none() }),
      )
      expect(record.rpe).toBeNull()
    }),
  )

  it.effect("a JSON null inside a JSON column decodes to Option.none", () =>
    Effect.gen(function* () {
      const profile = yield* Schema.decodeUnknownEffect(ProfileRow)(profileRecord)
      expect(Option.isNone(profile.goals[0]?.note ?? Option.some("missing"))).toBe(true)
    }),
  )
})

describe("ProfileRow locations (ADR-0016)", () => {
  it.effect("decodes the locations JSON column and the active id, and encodes them back", () =>
    Effect.gen(function* () {
      const profile = yield* Schema.decodeUnknownEffect(ProfileRow)(profileRecord)
      expect(profile.locations.map((location) => location.name)).toEqual(["Home"])
      expect(Option.getOrNull(profile.activeLocationId)).toBe(profileRecord.activeLocationId)
      expect(yield* Schema.encodeEffect(ProfileRow)(profile)).toEqual(profileRecord)
    }),
  )

  it.effect("an active id that is not one of the locations fails at activeLocationId", () =>
    Effect.gen(function* () {
      expect(
        yield* failingPaths(ProfileRow, {
          ...profileRecord,
          activeLocationId: "0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d",
        }),
      ).toEqual([["activeLocationId"]])
    }),
  )
})

describe("ProfileRow legacy equipment column (equipment.md §3)", () => {
  it.effect("a pre-v3 record's equipment is dropped on decode and written back as []", () =>
    Effect.gen(function* () {
      const legacy = { ...profileRecord, equipment: '[{"kind":"barbell","note":null}]' }
      const profile = yield* Schema.decodeUnknownEffect(ProfileRow)(legacy)
      expect("equipment" in profile).toBe(false)
      expect(yield* Schema.encodeEffect(ProfileRow)(profile)).toEqual(profileRecord)
    }),
  )

  it.effect("encoding a profile built in code emits equipment: []", () =>
    Effect.gen(function* () {
      const profile = yield* Schema.decodeUnknownEffect(Profile)({
        ...rowColumns,
        id: rowColumns.userId,
        goals: [],
        constraints: [],
        availableDays: [],
        timezone: "UTC",
      })
      const record = yield* Schema.encodeEffect(ProfileRow)(profile)
      expect(record).toMatchObject({ equipment: "[]", locations: "[]", activeLocationId: null })
    }),
  )

  it.effect("a record without the equipment column fails at equipment", () =>
    Effect.gen(function* () {
      const { equipment: _legacy, ...missing } = profileRecord
      expect(yield* failingPaths(ProfileRow, missing)).toEqual([["equipment"]])
    }),
  )

  it("ROW_KEYS.profile keeps the legacy column", () => {
    expect(ROW_KEYS.profile).toContain("equipment")
  })
})

describe("row codecs reject bad JSON columns", () => {
  it.effect("ProfileRow fails on a malformed JSON string", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        Schema.decodeUnknownEffect(ProfileRow)({ ...profileRecord, goals: "[not json" }),
      )
      expect(error).toBeInstanceOf(Schema.SchemaError)
    }),
  )

  it.effect("ExerciseRow reports the column of a JSON value of the wrong shape", () =>
    Effect.gen(function* () {
      expect(
        yield* failingPaths(ExerciseRow, { ...exerciseRecord, muscleGroups: '["wings"]' }),
      ).toEqual([["muscleGroups", 0]])
    }),
  )

  it.effect("PlannedSetRow fails on an unknown RepTarget tag", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        Schema.decodeUnknownEffect(PlannedSetRow)({
          ...plannedSetRecord,
          targetReps: '{"_tag":"Between","min":1}',
        }),
      )
      expect(error).toBeInstanceOf(Schema.SchemaError)
    }),
  )

  it.effect("PlannedSetRow fails when a JSON column holds a non-string", () =>
    Effect.gen(function* () {
      expect(
        yield* failingPaths(PlannedSetRow, { ...plannedSetRecord, targetReps: { _tag: "Exact" } }),
      ).toEqual([["targetReps"]])
    }),
  )

  it.effect("ExerciseRow still applies the entity's alias rule", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        Schema.decodeUnknownEffect(ExerciseRow)({ ...exerciseRecord, aliases: '["back squat"]' }),
      )
      expect(error.message).toContain("must differ from the name")
    }),
  )
})

describe("ROW_TABLE and ROW_KEYS", () => {
  const tables = SyncTable.literals

  it("name a table for every synced entity", () => {
    expect(sorted(Object.keys(ROW_TABLE))).toEqual(sorted(tables))
    expect(ROW_TABLE.set).toBe("workout_set")
    expect(ROW_TABLE.session).toBe("workout_session")
    expect(ROW_TABLE.planWeek).toBe("plan_week")
    expect(ROW_TABLE.importedActivity).toBe("imported_activity")
    expect(ROW_TABLE.dailyHealth).toBe("daily_health")
    expect(ROW_TABLE.foodEntry).toBe("food_entry")
  })

  it("list the record keys of every table", () => {
    expect(sorted(Object.keys(ROW_KEYS))).toEqual(sorted(tables))
    expect(ROW_KEYS.plan).toEqual([
      "id",
      "userId",
      "createdAt",
      "updatedAt",
      "deletedAt",
      "name",
      "goal",
      "startDate",
      "status",
    ])
  })

  it("match the keys of a decoded record", () => {
    expect(sorted(ROW_KEYS.set)).toEqual(sorted(Object.keys(workoutSetRecord)))
    expect(sorted(ROW_KEYS.profile)).toEqual(sorted(Object.keys(profileRecord)))
    expect(sorted(ROW_KEYS.plannedSet)).toEqual(sorted(Object.keys(plannedSetRecord)))
  })
})
