import { describe, expect, it } from "@effect/vitest"
import { ExerciseId, SyncChange } from "@tanren/shared"
import { Context, DateTime, Effect, Layer, Option, Ref, Schema } from "effect"
import { TestClock } from "effect/testing"
import { LOCAL_USER_ID } from "../store/localUser"
import { type ExerciseHistory, HistoryRepo } from "./HistoryRepo"
import { LocalStore } from "./LocalStore"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"

/** Counts `LocalStore.all` calls (one per SELECT) so the ≤ 3 SELECTs rule is asserted. */
class SelectCount extends Context.Service<SelectCount, Ref.Ref<number>>()("test/SelectCount") {
  static readonly layer = Layer.effect(this, Ref.make(0))
}

const CountingStore = Layer.effect(
  LocalStore,
  Effect.gen(function* () {
    const base = yield* LocalStore
    const count = yield* SelectCount
    return LocalStore.of({
      ...base,
      all: (statement) => Ref.update(count, (n) => n + 1).pipe(Effect.andThen(base.all(statement))),
    })
  }),
).pipe(
  Layer.provide(
    LocalStore.layerNoDeps.pipe(
      Layer.provide(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
    ),
  ),
  Layer.provideMerge(SelectCount.layer),
)

const TestLayer = HistoryRepo.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      CountingStore,
      DateTime.layerCurrentZoneNamed("Europe/Vilnius").pipe(Layer.orDie),
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
const BENCH = uid(11)
const PULLUP = uid(12)
const UNUSED = uid(13)
const PLANNED = uid(5)
const PLANNED_GONE = uid(6)
const [W0, W1, W2, W3, W4, W_GONE] = [uid(25), uid(20), uid(21), uid(22), uid(24), uid(23)]

const exercise = (id: string, name: string) => ({
  table: "exercise",
  row: { ...row(id), name, aliases: [], muscleGroups: ["quads"], notes: null },
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
 * Squat history (chronological): 90×5 (Aug 31, first) · 100×5 PR · 100×5 equal · 105×5 PR ·
 * 100×8 PR (e1RM 126.67) · 50×5 Sun 23:30 local · 50×5 Mon 00:05 local (after the DST change).
 * Tombstoned: a 200×5 set, and a whole session with a 300×5 set.
 */
const history = [
  exercise(SQUAT, "Back Squat"),
  exercise(BENCH, "Bench Press"),
  exercise(PULLUP, "Pull-up"),
  exercise(UNUSED, "Never logged"),
  plannedSession(PLANNED, "Lower A"),
  plannedSession(PLANNED_GONE, "Dropped", STAMP),
  session(W0, "2026-08-31T08:00:00.000Z", null, null),
  set(41, W0, SQUAT, 90, 5, "2026-08-31T08:05:00.000Z"),
  session(W1, "2026-10-05T08:00:00.000Z", "2026-10-05T08:47:30.000Z", PLANNED),
  set(30, W1, SQUAT, 100, 5, "2026-10-05T08:05:00.000Z"),
  set(31, W1, SQUAT, 100, 5, "2026-10-05T08:10:00.000Z"),
  set(32, W1, BENCH, 60, 8, "2026-10-05T08:20:00.000Z"),
  session(W2, "2026-10-12T08:00:00.000Z", null, PLANNED_GONE),
  set(33, W2, SQUAT, 105, 5, "2026-10-12T08:05:00.000Z"),
  set(34, W2, PULLUP, 0, 8, "2026-10-12T08:15:00.000Z"),
  session(W3, "2026-10-19T08:00:00.000Z", "2026-10-19T09:00:00.000Z", null),
  set(35, W3, SQUAT, 100, 8, "2026-10-19T08:05:00.000Z"),
  set(36, W3, PULLUP, 0, 10, "2026-10-19T08:15:00.000Z"),
  set(37, W3, SQUAT, 200, 5, "2026-10-19T08:20:00.000Z", STAMP),
  session(W_GONE, "2026-10-20T08:00:00.000Z", null, null, STAMP),
  set(38, W_GONE, SQUAT, 300, 5, "2026-10-20T08:05:00.000Z"),
  session(W4, "2026-10-25T21:00:00.000Z", null, null),
  set(39, W4, SQUAT, 50, 5, "2026-10-25T21:30:00.000Z"),
  set(40, W4, SQUAT, 50, 5, "2026-10-25T22:05:00.000Z"),
]

const write = (wire: ReadonlyArray<unknown>) =>
  Schema.decodeUnknownEffect(Schema.Array(SyncChange))(wire).pipe(
    Effect.orDie,
    Effect.flatMap((changes) => LocalStore.use((store) => store.write(changes, { dirty: false }))),
  )

/** Runs `effect` and returns its value with the number of SELECTs it issued. */
const counted = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const count = yield* SelectCount
    yield* Ref.set(count, 0)
    const value = yield* effect
    return { value, selects: yield* Ref.get(count) }
  })

/** Monday 2026-10-26 11:00 in Vilnius (UTC+2 after the 2026-10-25 DST change). */
const NOW = DateTime.toEpochMillis(DateTime.makeUnsafe("2026-10-26T09:00:00.000Z"))

const detail = (id: string) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(NOW)
    const found = yield* counted(HistoryRepo.use((repo) => repo.exercise(ExerciseId.make(id))))
    return {
      selects: found.selects,
      history: yield* Option.match(found.value, {
        onNone: () => Effect.die("expected an exercise history"),
        onSome: (value: ExerciseHistory) => Effect.succeed(value),
      }),
    }
  })

describe("HistoryRepo.exercises", () => {
  it.effect("is empty on an empty store", () =>
    Effect.gen(function* () {
      expect(yield* HistoryRepo.use((repo) => repo.exercises)).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("lists exercises with live sets, newest first, with best set and e1RM", () =>
    Effect.gen(function* () {
      yield* write(history)
      const { value, selects } = yield* counted(HistoryRepo.use((repo) => repo.exercises))
      expect(selects).toBeLessThanOrEqual(3)
      expect(
        value.map((s) => [s.exercise.name, s.totalSets, s.best.weightKg, s.best.reps]),
      ).toEqual([
        ["Back Squat", 7, 100, 8],
        ["Pull-up", 2, 0, 10],
        ["Bench Press", 1, 60, 8],
      ])
      expect(DateTime.formatIso(value[0]?.lastLoggedAt ?? DateTime.makeUnsafe(0))).toBe(
        "2026-10-25T22:05:00.000Z",
      )
      expect(value[0]?.bestE1Rm).toBeCloseTo(126.67, 2)
      expect(value[1]?.bestE1Rm).toBe(0)
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("HistoryRepo.exercise", () => {
  it.effect("is None for an unknown exercise, after one SELECT", () =>
    Effect.gen(function* () {
      yield* write(history)
      const { value, selects } = yield* counted(
        HistoryRepo.use((repo) => repo.exercise(ExerciseId.make(uid(99)))),
      )
      expect(Option.isNone(value)).toBe(true)
      expect(selects).toBe(1)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("gives 8 zero-filled weeks and no best for an exercise without sets", () =>
    Effect.gen(function* () {
      yield* write(history)
      const { history: unused } = yield* detail(UNUSED)
      expect(Option.isNone(unused.best)).toBe(true)
      expect(unused.bestE1Rm).toBe(0)
      expect(unused.weeks).toHaveLength(8)
      expect(unused.weeks.every((w) => w.volumeKg === 0 && w.sets === 0 && w.reps === 0)).toBe(true)
      expect(unused.e1RmTrend.every((w) => Option.isNone(w.e1Rm))).toBe(true)
      expect(unused.recent).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("buckets 8 local weeks across the DST change, skipping tombstones", () =>
    Effect.gen(function* () {
      yield* write(history)
      const { history: squat, selects } = yield* detail(SQUAT)
      expect(selects).toBeLessThanOrEqual(3)
      expect(squat.weeks.map((w) => [w.weekStart, w.volumeKg, w.sets, w.reps])).toEqual([
        ["2026-09-07", 0, 0, 0],
        ["2026-09-14", 0, 0, 0],
        ["2026-09-21", 0, 0, 0],
        ["2026-09-28", 0, 0, 0],
        ["2026-10-05", 1000, 2, 10],
        ["2026-10-12", 525, 1, 5],
        // 100×8 plus the Sunday 23:30 local set (21:30 UTC, UTC+2 after the change).
        ["2026-10-19", 1050, 2, 13],
        // The Monday 00:05 local set (22:05 UTC on Sunday).
        ["2026-10-26", 250, 1, 5],
      ])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("reports the best set and the best e1RM per week", () =>
    Effect.gen(function* () {
      yield* write(history)
      const { history: squat } = yield* detail(SQUAT)
      expect(Option.map(squat.best, (s) => s.id)).toEqual(Option.some(uid(35)))
      expect(squat.bestE1Rm).toBeCloseTo(126.67, 2)
      const trend = squat.e1RmTrend.map((w) => Option.getOrElse(w.e1Rm, () => -1))
      expect(trend.slice(0, 4)).toEqual([-1, -1, -1, -1])
      expect(trend[4]).toBeCloseTo(116.67, 2)
      expect(trend[5]).toBeCloseTo(122.5, 2)
      expect(trend[6]).toBeCloseTo(126.67, 2)
      expect(trend[7]).toBeCloseTo(58.33, 2)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("lists recent live sessions newest first, marking PRs over the full history", () =>
    Effect.gen(function* () {
      yield* write(history)
      const { history: squat } = yield* detail(SQUAT)
      expect(
        squat.recent.map((r) => [
          r.session.id,
          r.sets.map((s) => `${s.weightKg}x${s.reps}:${s.isPr}`),
        ]),
      ).toEqual([
        [W4, ["50x5:false", "50x5:false"]],
        [W3, ["100x8:true"]],
        [W2, ["105x5:true"]],
        [W1, ["100x5:true", "100x5:false"]],
        [W0, ["90x5:false"]],
      ])
    }).pipe(Effect.provide(TestLayer)),
  )
})
