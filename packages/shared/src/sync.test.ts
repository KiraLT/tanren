import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import { Array as Arr, Effect, Match, Option, Schema } from "effect"
import type { SyncTable } from "./common"
import {
  MAX_PUSH_CHANGES,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  SYNC_TABLE_ORDER,
  type SyncChange,
  SyncCursor,
} from "./sync"
import { rejects } from "./testing"

const userId = "6f1d2b7e-3c4a-4e2b-9a0e-1f2a3b4c5d6e"

/** §10.4 push request, verbatim. */
const pushRequestJson = {
  changes: [
    {
      table: "session",
      row: {
        id: "b3e7c0a2-5d1f-4a7b-8c9d-0e1f2a3b4c5d",
        userId,
        startedAt: "2026-10-19T17:02:11.000Z",
        finishedAt: null,
        plannedSessionId: "7c8d9e0f-1a2b-4c3d-9e4f-5a6b7c8d9e0f",
        notes: null,
        createdAt: "2026-10-19T17:02:11.000Z",
        updatedAt: "2026-10-19T17:02:11.000Z",
        deletedAt: null,
      },
    },
    {
      table: "set",
      row: {
        id: "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b",
        userId,
        sessionId: "b3e7c0a2-5d1f-4a7b-8c9d-0e1f2a3b4c5d",
        exerciseId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
        order: 0,
        weightKg: 102.5,
        reps: 5,
        rpe: 8.5,
        note: null,
        plannedSetId: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a",
        loggedAt: "2026-10-19T17:08:40.000Z",
        createdAt: "2026-10-19T17:08:40.000Z",
        updatedAt: "2026-10-19T17:08:40.000Z",
        deletedAt: null,
      },
    },
  ],
}

/** §10.4 push response, verbatim. */
const pushResponseJson = {
  accepted: [
    {
      table: "session",
      id: "b3e7c0a2-5d1f-4a7b-8c9d-0e1f2a3b4c5d",
      updatedAt: "2026-10-19T17:02:11.000Z",
    },
    {
      table: "set",
      id: "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b",
      updatedAt: "2026-10-19T17:08:40.000Z",
    },
  ],
  conflicts: [],
  rejected: [],
  serverTime: "2026-10-19T17:09:12.418Z",
}

/** §10.4 pull response, verbatim. */
const pullResponseJson = {
  changes: [
    {
      table: "exercise",
      row: {
        id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
        userId,
        name: "Back squat",
        aliases: ["squat", "high-bar squat"],
        muscleGroups: ["quads", "glutes", "core"],
        notes: null,
        catalogId: null,
        createdAt: "2026-10-01T06:00:00.000Z",
        updatedAt: "2026-10-01T06:00:00.000Z",
        deletedAt: null,
      },
    },
  ],
  cursor: "MjAyNi0xMC0xOVQxNzowOToxMi4wMDBafGV4ZXJjaXNlfDBhMWIyYzNk",
  serverTime: "2026-10-19T17:09:12.418Z",
  hasMore: false,
}

describe("PushRequest", () => {
  it("decodes the §10.4 example and re-encodes it to the same JSON", () => {
    const decoded = Schema.decodeUnknownSync(PushRequest)(pushRequestJson)
    expect(decoded.changes.map((change) => change.table)).toEqual(["session", "set"])
    expect(Schema.encodeSync(PushRequest)(decoded)).toStrictEqual(pushRequestJson)
  })

  it.effect(`rejects ${MAX_PUSH_CHANGES + 1} changes`, () =>
    Effect.gen(function* () {
      const [session] = pushRequestJson.changes
      const changes = Arr.replicate(session, MAX_PUSH_CHANGES + 1)
      const error = yield* Effect.flip(Schema.decodeUnknownEffect(PushRequest)({ changes }))
      expect(error).toBeInstanceOf(Schema.SchemaError)
    }),
  )

  it.effect(`accepts exactly ${MAX_PUSH_CHANGES} changes`, () =>
    Effect.gen(function* () {
      const [session] = pushRequestJson.changes
      const changes = Arr.replicate(session, MAX_PUSH_CHANGES)
      const decoded = yield* Schema.decodeUnknownEffect(PushRequest)({ changes })
      expect(decoded.changes).toHaveLength(MAX_PUSH_CHANGES)
    }),
  )
})

describe("PushResponse", () => {
  it("decodes the §10.4 example and re-encodes it to the same JSON", () => {
    const decoded = Schema.decodeUnknownSync(PushResponse)(pushResponseJson)
    expect(Schema.encodeSync(PushResponse)(decoded)).toStrictEqual(pushResponseJson)
  })
})

describe("PullRequest", () => {
  it("decodes since: null to None", () => {
    const decoded = Schema.decodeUnknownSync(PullRequest)({ since: null, limit: 200 })
    expect(Option.isNone(decoded.since)).toBe(true)
  })

  it("decodes a cursor to Some", () => {
    const decoded = Schema.decodeUnknownSync(PullRequest)({ since: "abc", limit: 200 })
    expect(decoded.since).toEqual(Option.some("abc"))
  })
})

describe("PullResponse", () => {
  it("decodes the §10.4 example and re-encodes it to the same JSON", () => {
    const decoded = Schema.decodeUnknownSync(PullResponse)(pullResponseJson)
    expect(decoded.hasMore).toBe(false)
    expect(Schema.encodeSync(PullResponse)(decoded)).toStrictEqual(pullResponseJson)
  })
})

describe("SyncChange", () => {
  it("is matched exhaustively on table (adding a member breaks this at compile time)", () => {
    const parentId = (change: SyncChange): Option.Option<string> =>
      Match.value(change).pipe(
        Match.discriminatorsExhaustive("table")({
          profile: () => Option.none(),
          exercise: () => Option.none(),
          plan: () => Option.none(),
          planWeek: ({ row }) => Option.some(row.planId),
          plannedSession: ({ row }) => Option.some(row.planWeekId),
          plannedSet: ({ row }) => Option.some(row.plannedSessionId),
          session: () => Option.none(),
          set: ({ row }) => Option.some(row.sessionId),
          programEnrollment: () => Option.none(),
          programDayCompletion: ({ row }) => Option.some(row.enrollmentId),
        }),
      )
    const decoded = Schema.decodeUnknownSync(PushRequest)(pushRequestJson)
    expect(decoded.changes.map(parentId)).toEqual([
      Option.none(),
      Option.some("b3e7c0a2-5d1f-4a7b-8c9d-0e1f2a3b4c5d"),
    ])
  })
})

describe("SYNC_TABLE_ORDER", () => {
  it("lists every SyncTable literal exactly once", () => {
    expectTypeOf<(typeof SYNC_TABLE_ORDER)[number]>().toEqualTypeOf<SyncTable>()
    expect(new globalThis.Set(SYNC_TABLE_ORDER).size).toBe(SYNC_TABLE_ORDER.length)
  })
})

describe("SyncChange rejects", () => {
  const [sessionChange] = pushRequestJson.changes

  it.effect("a row whose shape does not match its table (plan + session row)", () =>
    rejects(PushRequest, { changes: [{ table: "plan", row: sessionChange?.row }] }),
  )
  it.effect("the unsynced table user", () =>
    rejects(PushRequest, { changes: [{ table: "user", row: sessionChange?.row }] }),
  )
})

describe("Push round-trip with a tombstone", () => {
  it("re-encodes a soft-deleted row to the same JSON", () => {
    const tombstone = {
      changes: pushRequestJson.changes.map((change) => ({
        ...change,
        row: {
          ...change.row,
          updatedAt: "2026-10-20T08:00:00.000Z",
          deletedAt: "2026-10-20T08:00:00.000Z",
        },
      })),
    }
    const decoded = Schema.decodeUnknownSync(PushRequest)(tombstone)
    expect(Schema.encodeSync(PushRequest)(decoded)).toStrictEqual(tombstone)
  })
})

describe("Boundaries", () => {
  it.effect("PullRequest rejects limit 0", () => rejects(PullRequest, { since: null, limit: 0 }))
  it.effect("PullRequest rejects limit 501", () =>
    rejects(PullRequest, { since: null, limit: 501 }),
  )
  it.effect("SyncCursor rejects the empty string", () => rejects(SyncCursor, ""))
  it.effect("SyncCursor rejects 513 characters", () => rejects(SyncCursor, "a".repeat(513)))
})
