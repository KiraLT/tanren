import { describe, expect, it } from "@effect/vitest"
import { IdGenerator, PushRequest, SessionId, SessionRow } from "@tanren/shared"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import { TestClock } from "effect/testing"
import { seedIfEmpty } from "../store/seed"
import { pushableRows } from "../store/syncQueries"
import { CurrentUser } from "./CurrentUser"
import { decodeRecords, LocalStore } from "./LocalStore"
import type { SqlDriver } from "./SqlDriver"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"
import { type LogSetInput, type Today, TodayRepo } from "./TodayRepo"

/** 2026-10-20 08:00 UTC, a Tuesday; the seed plans a session on it. */
const NOW = Date.UTC(2026, 9, 20, 8)

const TestLayer = TodayRepo.layerNoDeps.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      LocalStore.layerNoDeps.pipe(
        Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
      ),
      IdGenerator.layerTest,
      CurrentUser.layerTest(Option.none()),
      DateTime.layerCurrentZoneNamed("Europe/Vilnius").pipe(Layer.orDie),
    ),
  ),
)

const run = <A, E>(
  body: Effect.Effect<
    A,
    E,
    | TodayRepo
    | LocalStore
    | StoreEvents
    | SqlDriver
    | IdGenerator
    | CurrentUser
    | DateTime.CurrentTimeZone
  >,
) => TestClock.setTime(NOW).pipe(Effect.andThen(body), Effect.provide(TestLayer))

const seededToday = Effect.gen(function* () {
  yield* seedIfEmpty
  return yield* readToday
})

const readToday = Effect.gen(function* () {
  const today = yield* (yield* TodayRepo).today
  return yield* Option.match(today, {
    onNone: () => Effect.die("expected a planned session today"),
    onSome: Effect.succeed,
  })
})

const squatOf = (today: Today) =>
  Option.match(Option.fromNullishOr(today.exercises[0]), {
    onNone: () => Effect.die("expected a first exercise"),
    onSome: ({ exercise }) => Effect.succeed(exercise.id),
  })

const input = (exerciseId: LogSetInput["exerciseId"]): LogSetInput => ({
  exerciseId,
  plannedSetId: Option.none(),
  weightKg: 100,
  reps: 5,
  rpe: Option.none(),
})

const millis = (at: DateTime.DateTime) => DateTime.toEpochMillis(at)

const UNKNOWN_SESSION = SessionId.make("00000000-0000-4000-8000-0000000000ff")

describe("TodayRepo.finishSession", () => {
  it.effect("exposes the open session with its live set count, None before the first set", () =>
    run(
      Effect.gen(function* () {
        const before = yield* seededToday
        expect(Option.isNone(before.session)).toBe(true)
        const set = yield* (yield* TodayRepo).logSet(input(yield* squatOf(before)))
        const after = yield* readToday
        expect(after.session.pipe(Option.map((open) => open.session.id))).toEqual(
          Option.some(set.sessionId),
        )
        expect(after.session.pipe(Option.map((open) => open.setCount))).toEqual(Option.some(1))
      }),
    ),
  )

  it.effect("sets finishedAt and updatedAt to now and reports sets and duration", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* TodayRepo
        const squat = yield* squatOf(yield* seededToday)
        const first = yield* repo.logSet(input(squat))
        yield* TestClock.adjust("20 minutes")
        yield* repo.logSet(input(squat))
        yield* TestClock.adjust("25 minutes")
        const result = yield* repo.finishSession(first.sessionId)
        expect(result).toEqual(
          Option.some({ sessionId: first.sessionId, setCount: 2, durationSeconds: 45 * 60 }),
        )
        const rows = yield* (yield* LocalStore).all({
          sql: `SELECT * FROM "workout_session" WHERE "id" = ?`,
          params: [first.sessionId],
        })
        const [stored] = yield* decodeRecords(SessionRow)(rows)
        const finishedAt = NOW + 45 * 60 * 1000
        expect(stored?.finishedAt.pipe(Option.map(millis))).toEqual(Option.some(finishedAt))
        expect(stored ? millis(stored.updatedAt) : 0).toBe(finishedAt)
        expect(rows[0]?._dirty).toBe(1)
        expect(Option.isNone((yield* readToday).session)).toBe(true)
      }),
    ),
  )

  it.effect("never finishes before the last set when the clock stepped back", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* TodayRepo
        const squat = yield* squatOf(yield* seededToday)
        const first = yield* repo.logSet(input(squat))
        yield* TestClock.adjust("10 minutes")
        const last = yield* repo.logSet(input(squat))
        yield* TestClock.setTime(NOW + 5 * 60 * 1000)
        const result = yield* repo.finishSession(first.sessionId)
        expect(result.pipe(Option.map((finished) => finished.durationSeconds))).toEqual(
          Option.some(10 * 60),
        )
        const rows = yield* (yield* LocalStore).all({
          sql: `SELECT * FROM "workout_session" WHERE "id" = ?`,
          params: [first.sessionId],
        })
        const [stored] = yield* decodeRecords(SessionRow)(rows)
        expect(stored?.finishedAt.pipe(Option.map(millis))).toEqual(
          Option.some(millis(last.loggedAt)),
        )
      }),
    ),
  )

  it.effect("logs the next set into a new session once the open one is finished", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* TodayRepo
        const squat = yield* squatOf(yield* seededToday)
        const first = yield* repo.logSet(input(squat))
        yield* repo.finishSession(first.sessionId)
        yield* TestClock.adjust("1 minute")
        const second = yield* repo.logSet(input(squat))
        expect(second.sessionId).not.toBe(first.sessionId)
        expect(second.order).toBe(0)
        const today = yield* readToday
        expect(today.session.pipe(Option.map((open) => open.session.id))).toEqual(
          Option.some(second.sessionId),
        )
        expect(today.exercises[0]?.loggedSets.map((set) => set.id)).toEqual([second.id])
      }),
    ),
  )

  it.effect("is a no-op for a session with zero live sets, a finished one or an unknown id", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* TodayRepo
        const store = yield* LocalStore
        const squat = yield* squatOf(yield* seededToday)
        const set = yield* repo.logSet(input(squat))
        // Tombstone the only set: the session is left with zero live sets.
        yield* store.all({
          sql: `UPDATE "workout_set" SET "deletedAt" = "updatedAt" WHERE "id" = ?`,
          params: [set.id],
        })
        expect(yield* repo.finishSession(set.sessionId)).toEqual(Option.none())
        const open = yield* store.all({
          sql: `SELECT "finishedAt" FROM "workout_session" WHERE "id" = ?`,
          params: [set.sessionId],
        })
        expect(open[0]?.finishedAt).toBeNull()

        const live = yield* repo.logSet(input(squat))
        expect(Option.isSome(yield* repo.finishSession(live.sessionId))).toBe(true)
        expect(yield* repo.finishSession(live.sessionId)).toEqual(Option.none())
        expect(yield* repo.finishSession(UNKNOWN_SESSION)).toEqual(Option.none())
      }),
    ),
  )

  it.effect("puts the finished row in the push batch, which round-trips through PushRequest", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* TodayRepo
        const set = yield* repo.logSet(input(yield* squatOf(yield* seededToday)))
        yield* TestClock.adjust("30 minutes")
        yield* repo.finishSession(set.sessionId)
        const rows = yield* (yield* LocalStore).all(pushableRows("session", 100))
        const sessions = yield* decodeRecords(SessionRow)(rows)
        const encoded = yield* Schema.encodeEffect(PushRequest)({
          changes: sessions.map((row) => ({ table: "session" as const, row })),
        })
        const decoded = yield* Schema.decodeUnknownEffect(PushRequest)(
          JSON.parse(JSON.stringify(encoded)),
        )
        const [change] = decoded.changes
        expect(change?.table).toBe("session")
        expect(
          change?.table === "session" ? change.row.finishedAt.pipe(Option.map(millis)) : null,
        ).toEqual(Option.some(NOW + 30 * 60 * 1000))
      }),
    ),
  )
})
