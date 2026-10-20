import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Option, Schema } from "effect"
import {
  Forbidden,
  NotFound,
  SessionStoreUnavailable,
  SyncConflict,
  ValidationError,
} from "./errors"
import { Uuid } from "./ids"
import { Goal, Profile } from "./user"

const id = Uuid.make("0a1b2c3d-6d43-4c1a-9a3e-2f4f1a2b3c4d")

describe("error wire shapes", () => {
  it("encodes NotFound as _tag + entity + id", () => {
    const error = new NotFound({ entity: "exercise", id })
    expect(Schema.encodeSync(NotFound)(error)).toEqual({ _tag: "NotFound", entity: "exercise", id })
  })

  it("encodes Forbidden as _tag + message", () => {
    const error = new Forbidden({ message: "not your row" })
    expect(Schema.encodeSync(Forbidden)(error)).toEqual({
      _tag: "Forbidden",
      message: "not your row",
    })
  })

  it("encodes SessionStoreUnavailable as _tag + message, status 503", () => {
    const error = new SessionStoreUnavailable({ message: "session store unavailable" })
    expect(Schema.encodeSync(SessionStoreUnavailable)(error)).toEqual({
      _tag: "SessionStoreUnavailable",
      message: "session store unavailable",
    })
  })

  it("encodes ValidationError as _tag + message + issues", () => {
    const issues = [{ path: ["sets", 0, "reps"], message: "Expected a value >= 0" }]
    const error = new ValidationError({ message: "invalid", issues })
    expect(Schema.encodeSync(ValidationError)(error)).toEqual({
      _tag: "ValidationError",
      message: "invalid",
      issues,
    })
  })

  it("encodes SyncConflict with ISO timestamps", () => {
    const error = new SyncConflict({
      table: "set",
      id,
      clientUpdatedAt: DateTime.makeUnsafe("2026-10-19T08:00:00.000Z"),
      serverUpdatedAt: DateTime.makeUnsafe("2026-10-19T09:00:00.000Z"),
    })
    expect(Schema.encodeSync(SyncConflict)(error)).toEqual({
      _tag: "SyncConflict",
      table: "set",
      id,
      clientUpdatedAt: "2026-10-19T08:00:00.000Z",
      serverUpdatedAt: "2026-10-19T09:00:00.000Z",
    })
  })
})

describe("ValidationError", () => {
  it.effect("fromSchemaError maps a nested failure to its path", () =>
    Effect.gen(function* () {
      const input = {
        id,
        userId: id,
        createdAt: "2026-10-19T08:00:00.000Z",
        updatedAt: "2026-10-19T08:00:00.000Z",
        deletedAt: null,
        goals: [{ kind: "strength", note: null }],
        constraints: [],
        availableDays: [],
        equipment: [{ kind: "barbell", note: null }],
        timezone: "Europe/Berlin",
      }
      const nested = { ...input, goals: [...input.goals, { kind: "other", note: null }] }
      const error = yield* Effect.flip(Schema.decodeUnknownEffect(Profile)(nested))
      const mapped = ValidationError.fromSchemaError(error)
      expect(mapped.issues.map((issue) => issue.path)).toEqual([["goals", 1, "note"]])
      expect(mapped.message).toContain("goals")
    }),
  )

  it.effect("fromIssue maps a makeEffect failure", () =>
    Effect.gen(function* () {
      const issue = yield* Effect.flip(Goal.makeEffect({ kind: "other", note: Option.none() }))
      expect(ValidationError.fromIssue(issue).issues).toEqual([
        { path: ["note"], message: 'required when kind is "other"' },
      ])
    }),
  )
})
