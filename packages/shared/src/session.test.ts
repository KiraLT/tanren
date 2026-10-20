import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import { DateTime, Effect, Option, Schema, SchemaIssue } from "effect"
import { OrderIndex, Reps, WeightKg } from "./common"
import { ExerciseId, SessionId, SetId, UserId } from "./ids"
import {
  Session,
  type SessionEncoded,
  SessionInsert,
  WorkoutSet,
  type WorkoutSetEncoded,
  WorkoutSetPatch,
} from "./session"
import { wireRoundTrips } from "./testing"

const userId = UserId.make("00000000-0000-4000-8000-000000000001")
const sessionId = SessionId.make("00000000-0000-4000-8000-000000000002")
const setId = SetId.make("00000000-0000-4000-8000-000000000003")
const exerciseId = ExerciseId.make("00000000-0000-4000-8000-000000000004")
const startedAt = DateTime.makeUnsafe("2026-10-19T08:00:00.000Z")
const beforeStart = DateTime.makeUnsafe("2026-10-19T07:59:59.000Z")

const sessionWire = {
  id: sessionId,
  userId,
  createdAt: "2026-10-19T08:00:00.000Z",
  updatedAt: "2026-10-19T08:00:00.000Z",
  deletedAt: null,
  startedAt: "2026-10-19T08:00:00.000Z",
  finishedAt: "2026-10-19T07:59:59.000Z",
  plannedSessionId: null,
  notes: null,
}

const workoutSetProps = {
  id: setId,
  userId,
  createdAt: startedAt,
  updatedAt: startedAt,
  deletedAt: Option.none(),
  sessionId,
  exerciseId,
  order: OrderIndex.make(0),
  weightKg: WeightKg.make(100),
  reps: Reps.make(5),
  rpe: Option.none(),
  note: Option.none(),
  plannedSetId: Option.none(),
  loggedAt: startedAt,
}
/** Branded but out of range: `disableChecks` skips the brand's own validation. */
const badReps = Reps.make(-1, { disableChecks: true })

describe("Session", () => {
  it.effect("rejects finishedAt before startedAt on decode", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(Schema.decodeUnknownEffect(Session)(sessionWire))
      expect(error.message).toContain("must not be before startedAt")
    }),
  )

  it("rejects finishedAt before startedAt in the constructor", () => {
    const build = () =>
      new Session({
        id: sessionId,
        userId,
        createdAt: startedAt,
        updatedAt: startedAt,
        deletedAt: Option.none(),
        startedAt,
        finishedAt: Option.some(beforeStart),
        plannedSessionId: Option.none(),
        notes: Option.none(),
      })
    // The thrown Error's message is the generic "Schema validation failed"; the reason is in `cause`.
    const thrown = Effect.runSync(Effect.flip(Effect.try({ try: build, catch: (error) => error })))
    const reason =
      thrown instanceof Error && SchemaIssue.isIssue(thrown.cause)
        ? SchemaIssue.makeFormatterDefault()(thrown.cause)
        : ""
    expect(reason).toMatch(/must not be before startedAt/)
  })

  it.effect("rejects finishedAt before startedAt in SessionInsert", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        Schema.decodeUnknownEffect(SessionInsert)({
          startedAt: "2026-10-19T08:00:00.000Z",
          finishedAt: "2026-10-19T07:59:59.000Z",
          plannedSessionId: null,
          notes: null,
        }),
      )
      expect(error.message).toContain("must not be before startedAt")
    }),
  )

  it.effect("accepts an in-progress session (finishedAt null)", () =>
    Effect.gen(function* () {
      const session = yield* Schema.decodeUnknownEffect(Session)({
        ...sessionWire,
        finishedAt: null,
      })
      expect(Option.isNone(session.finishedAt)).toBe(true)
    }),
  )
})

describe("WorkoutSet", () => {
  it("throws an Error whose cause is a SchemaIssue when constructed with bad data", () => {
    const thrown = Effect.runSync(
      Effect.flip(
        Effect.try({
          try: () => new WorkoutSet({ ...workoutSetProps, reps: badReps }),
          catch: (error) => error,
        }),
      ),
    )
    expect(thrown).toBeInstanceOf(Error)
    expect(thrown instanceof Error && SchemaIssue.isIssue(thrown.cause)).toBe(true)
  })

  it.effect("makeEffect fails with a typed SchemaIssue", () =>
    Effect.gen(function* () {
      const issue = yield* Effect.flip(WorkoutSet.makeEffect({ ...workoutSetProps, reps: badReps }))
      expect(SchemaIssue.isIssue(issue)).toBe(true)
    }),
  )

  it.effect("makeEffect builds a valid set", () =>
    Effect.gen(function* () {
      const set = yield* WorkoutSet.makeEffect(workoutSetProps)
      expect(set).toBeInstanceOf(WorkoutSet)
    }),
  )

  it("WorkoutSetPatch omits sessionId", () => {
    expect(Object.keys(WorkoutSetPatch.fields)).not.toContain("sessionId")
    expectTypeOf<WorkoutSetPatch>().not.toHaveProperty("sessionId")
  })
})

const rowWire = {
  userId,
  createdAt: "2026-10-19T08:00:00.000Z",
  updatedAt: "2026-10-19T08:00:00.000Z",
  deletedAt: null,
}
const deleted = { updatedAt: "2026-10-20T08:00:00.000Z", deletedAt: "2026-10-20T08:00:00.000Z" }
const inProgressWire: SessionEncoded = {
  ...rowWire,
  id: sessionId,
  startedAt: "2026-10-19T08:00:00.000Z",
  finishedAt: null,
  plannedSessionId: null,
  notes: null,
}
const setWire: WorkoutSetEncoded = {
  ...rowWire,
  id: setId,
  sessionId,
  exerciseId,
  order: 0,
  weightKg: 102.5,
  reps: 5,
  rpe: null,
  note: null,
  plannedSetId: null,
  loggedAt: "2026-10-19T08:10:00.000Z",
}

describe("Session entities round-trip through the wire", () => {
  it.effect("Session, every Option null", () => wireRoundTrips(Session, inProgressWire))
  it.effect("Session, every Option set", () =>
    wireRoundTrips(Session, {
      ...inProgressWire,
      ...deleted,
      finishedAt: "2026-10-19T09:00:00.000Z",
      plannedSessionId: "33333333-3333-4333-8333-333333333333",
      notes: "Felt strong",
    }),
  )
  it.effect("WorkoutSet, every Option null", () => wireRoundTrips(WorkoutSet, setWire))
  it.effect("WorkoutSet, every Option set", () =>
    wireRoundTrips(WorkoutSet, {
      ...setWire,
      ...deleted,
      rpe: 8.5,
      note: "grindy last rep",
      plannedSetId: "44444444-4444-4444-8444-444444444444",
    }),
  )
})

describe("WorkoutSetPatch", () => {
  it.effect("ignores an immutable parent key: sessionId is stripped, not rejected", () =>
    Effect.gen(function* () {
      const patch = yield* Schema.decodeUnknownEffect(WorkoutSetPatch)({
        sessionId: "x",
        rpe: null,
      })
      expect(patch).toEqual({ rpe: Option.none() })
    }),
  )
})
