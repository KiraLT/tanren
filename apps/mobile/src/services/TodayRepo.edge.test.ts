import { describe, expect, it } from "@effect/vitest"
import { ExerciseId } from "@tanren/shared"
import { DateTime, Effect, Option } from "effect"
import { TestClock } from "effect/testing"
import { seedIfEmpty } from "../store/seed"
import { EXERCISE_ID, openPhone } from "../testing/phone"
import { LocalStore } from "./LocalStore"
import { MockSyncServer } from "./MockSyncServer"
import { SqlDriver } from "./SqlDriver"
import { TodayRepo } from "./TodayRepo"

const exerciseId = ExerciseId.make(EXERCISE_ID)
const input = (weightKg: number, reps: number, rpe: Option.Option<number> = Option.none()) => ({
  exerciseId,
  plannedSetId: Option.none(),
  weightKg,
  reps,
  rpe,
})
const log = (weightKg: number, reps: number, rpe?: Option.Option<number>) =>
  TodayRepo.use((repo) => repo.logSet(input(weightKg, reps, rpe)))
const count = (sql: string) =>
  LocalStore.use((store) => store.all({ sql, params: [] })).pipe(Effect.map((rows) => rows[0]?.n))
const withServer = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(MockSyncServer.layer))
/** 2026-10-20 20:00 UTC = 23:00 in Vilnius (UTC+3). */
const LATE = Date.UTC(2026, 9, 20, 20)
const HOUR = 3_600_000

describe("TodayRepo edges", () => {
  it.effect("rejects out-of-range inputs with a typed ValidationError", () =>
    withServer(
      Effect.gen(function* () {
        const phone = yield* openPhone()
        const bad = [
          log(-1, 5),
          log(Number.NaN, 5),
          log(100, 1001),
          log(100, -3),
          log(100, 2.5),
          log(Number.POSITIVE_INFINITY, 5),
          log(100, 5, Option.some(10.5)),
          log(100, 5, Option.some(-1)),
        ]
        const tags = yield* Effect.forEach(bad, (attempt) =>
          Effect.flip(phone.run(attempt)).pipe(Effect.map((error) => error._tag)),
        )
        expect(tags).toEqual(bad.map(() => "ValidationError"))
        expect(yield* phone.run(count(`SELECT COUNT(*) AS "n" FROM "workout_set"`))).toBe(0)
        expect(yield* phone.run(count(`SELECT COUNT(*) AS "n" FROM "workout_session"`))).toBe(0)
      }),
    ),
  )

  it.effect("accepts boundary values 0 kg, 0 reps and RPE 10", () =>
    withServer(
      Effect.gen(function* () {
        const phone = yield* openPhone()
        const set = yield* phone.run(log(0, 0, Option.some(10)))
        expect(set.weightKg).toBe(0)
      }),
    ),
  )

  it.effect("twenty concurrent logSets make one session and unique orders", () =>
    withServer(
      Effect.gen(function* () {
        const phone = yield* openPhone()
        yield* phone.run(
          Effect.forEach(
            Array.from({ length: 20 }, (_, i) => i + 1),
            (w) => log(w, 5),
            {
              concurrency: "unbounded",
            },
          ),
        )
        expect(yield* phone.run(count(`SELECT COUNT(*) AS "n" FROM "workout_session"`))).toBe(1)
        expect(
          yield* phone.run(count(`SELECT COUNT(DISTINCT "order") AS "n" FROM "workout_set"`)),
        ).toBe(20)
      }),
    ),
  )

  it.effect("a planned set logged after local midnight does not land in the planned session", () =>
    withServer(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.UTC(2026, 9, 20, 20, 59))
        const phone = yield* openPhone()
        yield* phone.run(seedIfEmpty)
        const today = yield* phone.run(TodayRepo.use((repo) => repo.today))
        expect(Option.isSome(today)).toBe(true)
        yield* TestClock.adjust("2 minutes") // 00:01 Vilnius, next day
        expect(Option.isNone(yield* phone.run(TodayRepo.use((repo) => repo.today)))).toBe(true)
        yield* phone.run(log(50, 5))
        const planned = yield* phone.run(
          count(
            `SELECT COUNT(*) AS "n" FROM "workout_session" WHERE "plannedSessionId" IS NOT NULL`,
          ),
        )
        expect(planned).toBe(0)
      }),
    ),
  )

  // DEFECT: openSession(None) reuses ANY unfinished unplanned session regardless of date
  // (TodayRepo.ts openSession: no `startedAt` bound), and nothing ever sets `finishedAt`. A set
  // logged at 00:30 the next day joins yesterday's session. Fix: bound the unplanned lookup to the
  // local day of `now` (or close sessions after N hours).
  it.effect.fails("an unplanned set after local midnight starts a new session", () =>
    withServer(
      Effect.gen(function* () {
        yield* TestClock.setTime(LATE)
        const phone = yield* openPhone()
        yield* phone.run(log(60, 5))
        yield* TestClock.adjust(`${3 * HOUR} millis`) // 02:00 Vilnius, next day
        yield* phone.run(log(60, 5))
        expect(yield* phone.run(count(`SELECT COUNT(*) AS "n" FROM "workout_session"`))).toBe(2)
      }),
    ),
  )

  it.effect("the local date flips at Vilnius midnight, not UTC midnight", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.UTC(2026, 9, 20, 20, 59))
      const phone = yield* openPhone()
      const before = yield* phone.run(
        DateTime.nowInCurrentZone.pipe(Effect.map(DateTime.formatIsoDate)),
      )
      yield* TestClock.adjust("2 minutes")
      const after = yield* phone.run(
        DateTime.nowInCurrentZone.pipe(Effect.map(DateTime.formatIsoDate)),
      )
      expect([before, after]).toEqual(["2026-10-20", "2026-10-21"])
    }).pipe(Effect.provide(MockSyncServer.layer)),
  )

  // DEFECT (possible): buildToday selects exercises by id without `deletedAt IS NULL`
  // (TodayRepo.ts buildToday), so a pulled exercise tombstone still shows on Today. Fix: add
  // `AND "deletedAt" IS NULL` to that query, if tombstoned exercises should hide.
  it.effect.fails("a tombstoned exercise disappears from Today", () =>
    withServer(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.UTC(2026, 9, 20, 8))
        const phone = yield* openPhone()
        yield* phone.run(seedIfEmpty)
        const before = yield* phone.run(TodayRepo.use((repo) => repo.today))
        yield* phone.run(
          SqlDriver.use((driver) =>
            driver.batch([
              {
                sql: `UPDATE "exercise" SET "deletedAt" = '2026-10-20T08:00:00.000Z', "updatedAt" = '2026-10-20T08:00:00.000Z' WHERE "name" = 'Back Squat'`,
                params: [],
              },
            ]),
          ),
        )
        const after = yield* phone.run(TodayRepo.use((repo) => repo.today))
        const n = (t: typeof before) =>
          Option.match(t, { onNone: () => 0, onSome: (x) => x.exercises.length })
        expect(n(after)).toBe(n(before) - 1)
      }),
    ),
  )
})
