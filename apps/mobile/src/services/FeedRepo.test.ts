import { describe, expect, it } from "@effect/vitest"
import { SessionId, SyncChange } from "@tanren/shared"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import { TestClock } from "effect/testing"
import { LOCAL_USER_ID } from "../store/localUser"
import { FEED_PAGE, FeedRepo } from "./FeedRepo"
import { HistoryRepo } from "./HistoryRepo"
import { LocalStore } from "./LocalStore"
import { StoreError } from "./SqlDriver"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"

const StoreLayer = LocalStore.layerNoDeps.pipe(
  Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
)

const TestLayer = Layer.mergeAll(FeedRepo.layer, HistoryRepo.layer).pipe(
  Layer.provideMerge(
    Layer.mergeAll(StoreLayer, DateTime.layerCurrentZoneNamed("Europe/Vilnius").pipe(Layer.orDie)),
  ),
)

/** A store whose every read fails, to prove the error surfaces as `StoreError`. */
const FailingLayer = FeedRepo.layer.pipe(
  Layer.provide(
    Layer.succeed(
      LocalStore,
      LocalStore.of({
        all: () => Effect.fail(new StoreError({ cause: "boom" })),
        write: () => Effect.fail(new StoreError({ cause: "boom" })),
      }),
    ),
  ),
)

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const STAMP = "2026-10-01T08:00:00.000Z"
const row = (id: string, deletedAt: string | null = null) => ({
  id,
  userId: LOCAL_USER_ID,
  createdAt: STAMP,
  updatedAt: STAMP,
  deletedAt,
})

const SQUAT = uid(10)
const BENCH = uid(11) // tombstoned exercise that still names its old sets
const PLANNED = uid(5)
const PLANNED_GONE = uid(6)
const ENROLLMENT = uid(7)

const S_EMPTY = SessionId.make(uid(20))
const S_DELETED_SETS = SessionId.make(uid(21))
const S_A = SessionId.make(uid(22))
const S_B = SessionId.make(uid(23))
const S_C = SessionId.make(uid(24)) // same startedAt as S_B, larger id: sorts first
const S_PROGRAM = SessionId.make(uid(25))
const S_OPEN = SessionId.make(uid(26))
const S_GONE = SessionId.make(uid(27)) // tombstoned session with a live set

const exercise = (id: string, name: string, deletedAt: string | null = null) => ({
  table: "exercise",
  row: { ...row(id, deletedAt), name, aliases: [], muscleGroups: ["quads"], notes: null },
})

const plannedSession = (id: string, name: string, deletedAt: string | null = null) => ({
  table: "plannedSession",
  row: {
    ...row(id, deletedAt),
    planWeekId: uid(4),
    order: 0,
    name,
    scheduledDate: null,
    notes: null,
  },
})

const session = (
  id: string,
  startedAt: string,
  finishedAt: string | null,
  plannedSessionId: string | null,
  deletedAt: string | null = null,
) => ({
  table: "session",
  row: { ...row(id, deletedAt), startedAt, finishedAt, plannedSessionId, notes: null },
})

const set = (
  n: number,
  sessionId: string,
  exerciseId: string,
  weightKg: number,
  reps: number,
  loggedAt: string,
  deletedAt: string | null = null,
) => ({
  table: "set",
  row: {
    ...row(uid(n), deletedAt),
    sessionId,
    exerciseId,
    order: n,
    weightKg,
    reps,
    rpe: null,
    note: null,
    plannedSetId: null,
    loggedAt,
  },
})

/**
 * Squat history: 100x5, 100x5 (S_A) · 105x5 PR (S_B) · 110x5 PR (S_C) · 100x8 PR (S_PROGRAM) ·
 * 50x5 (S_OPEN). Bench (deleted exercise) 60x8 in S_A.
 */
const fixture = [
  exercise(SQUAT, "Back Squat"),
  exercise(BENCH, "Bench Press", STAMP),
  plannedSession(PLANNED, "Lower A"),
  plannedSession(PLANNED_GONE, "Dropped", STAMP),
  session(S_EMPTY, "2026-10-04T08:00:00.000Z", null, null),
  session(S_DELETED_SETS, "2026-10-04T09:00:00.000Z", null, null),
  set(50, S_DELETED_SETS, SQUAT, 80, 5, "2026-10-04T09:05:00.000Z", STAMP),
  session(S_A, "2026-10-05T08:00:00.000Z", "2026-10-05T08:47:30.000Z", PLANNED),
  set(30, S_A, SQUAT, 100, 5, "2026-10-05T08:05:00.000Z"),
  set(31, S_A, SQUAT, 100, 5, "2026-10-05T08:10:00.000Z"),
  set(32, S_A, BENCH, 60, 8, "2026-10-05T08:20:00.000Z"),
  session(S_B, "2026-10-12T08:00:00.000Z", null, PLANNED_GONE),
  set(33, S_B, SQUAT, 105, 5, "2026-10-12T08:05:00.000Z"),
  session(S_C, "2026-10-12T08:00:00.000Z", "2026-10-12T08:30:00.000Z", null),
  set(34, S_C, SQUAT, 110, 5, "2026-10-12T08:10:00.000Z"),
  session(S_PROGRAM, "2026-10-19T08:00:00.000Z", "2026-10-19T08:15:00.000Z", null),
  set(35, S_PROGRAM, SQUAT, 100, 8, "2026-10-19T08:05:00.000Z"),
  {
    table: "programEnrollment",
    row: {
      ...row(ENROLLMENT),
      programId: "core-30",
      startedOn: "2026-10-01",
      status: "active",
      currentDay: 4,
    },
  },
  {
    table: "programDayCompletion",
    row: {
      ...row(uid(8)),
      enrollmentId: ENROLLMENT,
      dayNumber: 3,
      completedAt: "2026-10-19T08:15:00.000Z",
      durationSeconds: 900,
      sessionId: S_PROGRAM,
    },
  },
  session(S_OPEN, "2026-10-26T08:00:00.000Z", null, null),
  set(36, S_OPEN, SQUAT, 50, 5, "2026-10-26T08:30:00.000Z"),
  session(S_GONE, "2026-10-20T08:00:00.000Z", null, null, STAMP),
  set(37, S_GONE, SQUAT, 300, 5, "2026-10-20T08:05:00.000Z"),
]

const write = (wire: ReadonlyArray<unknown>) =>
  Schema.decodeUnknownEffect(Schema.Array(SyncChange))(wire).pipe(
    Effect.orDie,
    Effect.flatMap((changes) => LocalStore.use((store) => store.write(changes, { dirty: false }))),
  )

/** Tuesday 2026-10-26 09:00 UTC: S_OPEN started an hour ago. */
const NOW = DateTime.toEpochMillis(DateTime.makeUnsafe("2026-10-26T09:00:00.000Z"))

const seeded = Effect.gen(function* () {
  yield* TestClock.setTime(NOW)
  yield* write(fixture)
})

const feed = (limit: number) => FeedRepo.use((repo) => repo.activities(limit))

describe("FeedRepo.activities", () => {
  it.effect("is empty on an empty store", () =>
    Effect.gen(function* () {
      expect(yield* feed(FEED_PAGE)).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("lists only live sessions with a live set, newest first, id desc on a tie", () =>
    Effect.gen(function* () {
      yield* seeded
      const ids = (yield* feed(FEED_PAGE)).map((a) => a.sessionId)
      // S_EMPTY (no sets), S_DELETED_SETS (only a tombstoned set) and S_GONE (tombstoned) are absent.
      expect(ids).toEqual([S_OPEN, S_PROGRAM, S_C, S_B, S_A])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("respects the limit, and 0 or a negative limit is empty", () =>
    Effect.gen(function* () {
      yield* seeded
      expect((yield* feed(2)).map((a) => a.sessionId)).toEqual([S_OPEN, S_PROGRAM])
      expect(yield* feed(0)).toEqual([])
      expect(yield* feed(-3)).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("PR counts equal HistoryRepo.sessions for the same ids", () =>
    Effect.gen(function* () {
      yield* seeded
      const activities = yield* feed(FEED_PAGE)
      const summaries = yield* HistoryRepo.use((repo) => repo.sessions(FEED_PAGE))
      const prsOf = (id: string) => summaries.find((s) => s.session.id === id)?.prs
      expect(activities.map((a) => [a.sessionId, a.prs])).toEqual(
        activities.map((a) => [a.sessionId, prsOf(a.sessionId)]),
      )
      // The fixture really has PRs, so the parity is not 0 === 0 everywhere.
      expect(activities.map((a) => a.prs)).toEqual([0, 0, 1, 1, 0])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("titles a planned session from its live planned_session", () =>
    Effect.gen(function* () {
      yield* seeded
      const byId = new Map((yield* feed(FEED_PAGE)).map((a) => [a.sessionId, a]))
      expect(byId.get(S_A)).toMatchObject({ kind: "planned", title: "Lower A" })
      // A tombstoned planned session no longer names it.
      expect(byId.get(S_B)).toMatchObject({ kind: "free", title: "Workout" })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("marks a program-day session from program_day_completion", () =>
    Effect.gen(function* () {
      yield* seeded
      const byId = new Map((yield* feed(FEED_PAGE)).map((a) => [a.sessionId, a]))
      const program = byId.get(S_PROGRAM)
      expect(program).toMatchObject({ kind: "program", title: "Core 30 · Day 3" })
      expect(
        Option.map(program?.program ?? Option.none(), (p) => [p.programId, p.dayNumber]),
      ).toEqual(Option.some(["core-30", 3]))
      expect(byId.get(S_A)?.program).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a deleted exercise still names its old sets", () =>
    Effect.gen(function* () {
      yield* seeded
      const a = (yield* feed(FEED_PAGE)).find((activity) => activity.sessionId === S_A)
      expect(a?.exercises.map((e) => [e.name, e.sets.length])).toEqual([
        ["Back Squat", 2],
        ["Bench Press", 1],
      ])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("an unfinished session started under 12 h ago is inProgress, an old one is done", () =>
    Effect.gen(function* () {
      yield* seeded
      const byId = new Map((yield* feed(FEED_PAGE)).map((a) => [a.sessionId, a.status]))
      expect(byId.get(S_OPEN)).toBe("inProgress")
      expect(byId.get(S_B)).toBe("done")
      expect(byId.get(S_A)).toBe("done")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails with StoreError when the store fails", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(feed(FEED_PAGE))
      expect(error._tag).toBe("StoreError")
    }).pipe(Effect.provide(FailingLayer)),
  )
})

describe("FeedRepo.activity", () => {
  const one = (id: SessionId) => FeedRepo.use((repo) => repo.activity(id))

  it.effect("is None for an unknown id", () =>
    Effect.gen(function* () {
      yield* seeded
      expect(Option.isNone(yield* one(SessionId.make(uid(99))))).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("is None for a session without live sets, empty or only tombstoned", () =>
    Effect.gen(function* () {
      yield* seeded
      expect(Option.isNone(yield* one(S_EMPTY))).toBe(true)
      expect(Option.isNone(yield* one(S_DELETED_SETS))).toBe(true)
      expect(Option.isNone(yield* one(S_GONE))).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("equals the feed's entry for the same session", () =>
    Effect.gen(function* () {
      yield* seeded
      const fromFeed = (yield* feed(FEED_PAGE)).find((a) => a.sessionId === S_PROGRAM)
      expect(Option.getOrUndefined(yield* one(S_PROGRAM))).toEqual(fromFeed)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails with StoreError when the store fails", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(one(S_A))
      expect(error._tag).toBe("StoreError")
    }).pipe(Effect.provide(FailingLayer)),
  )
})
