import { describe, expect, it } from "@effect/vitest"
import {
  ExerciseId,
  IdGenerator,
  LocalDate,
  Program,
  ProgramDay,
  ProgramEnrollment,
  ProgramEnrollmentId,
  ProgramId,
  SessionRow,
  WorkoutSetRow,
} from "@tanren/shared"
import { DateTime, Effect, Layer, Option, Predicate, Schema } from "effect"
import { TestClock } from "effect/testing"
import { LOCAL_USER_ID } from "../store/localUser"
import { CurrentUser } from "./CurrentUser"
import { ExerciseLink, UnknownCatalogExercise } from "./ExerciseLink"
import { decodeRecords, LocalStore } from "./LocalStore"
import { ProgramRepo, plannedItems } from "./ProgramRepo"
import { type SqlDriver, StoreError } from "./SqlDriver"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"

/** 2026-10-20 22:30 UTC = 2026-10-21 01:30 in Vilnius: `startedOn` is the local date. */
const NOW = Date.UTC(2026, 9, 20, 22, 30)

const PROGRAM_ID = ProgramId.make("test-2")
const OTHER_ID = ProgramId.make("other")
const UNKNOWN_ID = ProgramId.make("gone")

const day = (dayNumber: number) => ({
  dayNumber,
  title: `Day ${dayNumber} · Test`,
  rounds: 1,
  items: [{ kind: "timed", catalogId: "plank", seconds: 30, restSeconds: 15 }],
  restBetweenRoundsSeconds: 30,
})

const fixture = (programId: ProgramId, days: number) =>
  Schema.decodeUnknownSync(Program)({
    programId,
    name: "Test",
    tagline: "A fixture",
    description: "Two short days.",
    days: Array.from({ length: days }, (_, index) => day(index + 1)),
  })

/** Seven timed items × 3 rounds: one round is 7 × 30 s work + 6 × 15 s rest. */
const CIRCUIT_ID = ProgramId.make("circuit")
const CIRCUIT_ITEMS = [
  "plank",
  "dead-bug",
  "bird-dog",
  "glute-bridge",
  "side-plank",
  "squat",
  "lunge",
]
const CIRCUIT_DAY = Schema.decodeUnknownSync(ProgramDay)({
  dayNumber: 1,
  title: "Day 1 · Circuit",
  rounds: 3,
  items: CIRCUIT_ITEMS.map((catalogId) => ({
    kind: "timed",
    catalogId,
    seconds: 30,
    restSeconds: 15,
  })),
  restBetweenRoundsSeconds: 60,
})
const circuit = new Program({
  programId: CIRCUIT_ID,
  name: "Core 30",
  tagline: "A fixture",
  description: "One circuit day.",
  days: [CIRCUIT_DAY],
})

const CATALOG = [fixture(PROGRAM_ID, 2), fixture(OTHER_ID, 3), circuit]
const find = (id: ProgramId) => Option.fromNullishOr(CATALOG.find((p) => p.programId === id))

/** Fake link: catalog id at index n → exercise …00a{n}; `failing` ids fail like an unknown id. */
const exerciseIdOf = (catalogId: string) =>
  ExerciseId.make(`00000000-0000-4000-8000-0000000000a${CIRCUIT_ITEMS.indexOf(catalogId)}`)
const fakeLink = (failing: ReadonlyArray<string>) =>
  Layer.succeed(
    ExerciseLink,
    ExerciseLink.of({
      ensure: (catalogId) =>
        failing.includes(catalogId)
          ? Effect.fail(new StoreError({ cause: new UnknownCatalogExercise({ catalogId }) }))
          : Effect.succeed(exerciseIdOf(catalogId)),
    }),
  )

const testLayer = (failing: ReadonlyArray<string>) =>
  ProgramRepo.layerWith(find).pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        LocalStore.layerNoDeps.pipe(
          Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
        ),
        IdGenerator.layerTest,
        CurrentUser.layerTest(Option.none()),
        DateTime.layerCurrentZoneNamed("Europe/Vilnius").pipe(Layer.orDie),
        fakeLink(failing),
      ),
    ),
  )

const run = <A, E>(
  body: Effect.Effect<A, E, ProgramRepo | LocalStore | StoreEvents | SqlDriver | IdGenerator>,
  failing: ReadonlyArray<string> = [],
) => TestClock.setTime(NOW).pipe(Effect.andThen(body), Effect.provide(testLayer(failing)))

const rows = (sql: string) =>
  Effect.gen(function* () {
    return yield* (yield* LocalStore).all({ sql, params: [] })
  })

const version = Effect.gen(function* () {
  return yield* (yield* StoreEvents).version
})

/** A stored enrollment written as a remote apply (not dirty). */
const stored = (
  id: string,
  fields: Partial<Pick<ProgramEnrollment, "status" | "deletedAt" | "currentDay" | "programId">>,
) =>
  Effect.gen(function* () {
    const at = DateTime.makeUnsafe(NOW - 60_000)
    const row = new ProgramEnrollment({
      id: ProgramEnrollmentId.make(id),
      userId: LOCAL_USER_ID,
      createdAt: at,
      updatedAt: at,
      deletedAt: Option.none(),
      programId: PROGRAM_ID,
      startedOn: LocalDate.make("2026-10-01"),
      status: "active",
      currentDay: 1,
      ...fields,
    })
    yield* (yield* LocalStore).write([{ table: "programEnrollment", row }], { dirty: false })
    return row
  })

const tombstone = Option.some(DateTime.makeUnsafe(NOW - 30_000))

const TWO_DAY = "00000000-0000-4000-8000-0000000000d6"
const dayInput = (enrollmentId: ProgramEnrollmentId, dayNumber: number) => ({
  enrollmentId,
  dayNumber,
  startedAt: DateTime.makeUnsafe(NOW - 900_000),
  durationSeconds: 840,
})

describe("ProgramRepo", () => {
  it.effect("enroll inserts one dirty active row on day 1 with the local date", () =>
    run(
      Effect.gen(function* () {
        const before = yield* version
        const first = yield* (yield* ProgramRepo).enroll(PROGRAM_ID)
        expect(first).toMatchObject({
          programId: PROGRAM_ID,
          status: "active",
          currentDay: 1,
          startedOn: "2026-10-21",
          userId: LOCAL_USER_ID,
        })
        expect(yield* rows(`SELECT "id", "_dirty" FROM "program_enrollment"`)).toEqual([
          { id: first.id, _dirty: 1 },
        ])
        expect(yield* version).toBe(before + 1)
      }),
    ),
  )

  it.effect(
    "enroll again for the same program returns the active enrollment, writing nothing",
    () =>
      run(
        Effect.gen(function* () {
          const repo = yield* ProgramRepo
          const first = yield* repo.enroll(PROGRAM_ID)
          const before = yield* version
          const again = yield* repo.enroll(PROGRAM_ID)
          expect(again.id).toBe(first.id)
          expect(yield* version).toBe(before)
        }),
      ),
  )

  it.effect("enroll in a second program starts a separate enrollment", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const first = yield* repo.enroll(PROGRAM_ID)
        const other = yield* repo.enroll(OTHER_ID)
        expect(other.id).not.toBe(first.id)
      }),
    ),
  )

  it.effect("two concurrent enrolls in the same program create exactly one row", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const [a, b] = yield* Effect.all([repo.enroll(PROGRAM_ID), repo.enroll(PROGRAM_ID)], {
          concurrency: 2,
        })
        expect(a.id).toBe(b.id)
        expect(yield* rows(`SELECT "id" FROM "program_enrollment"`)).toEqual([{ id: a.id }])
      }),
    ),
  )

  it.effect("enrollments skip tombstones (newest first); active skips abandoned too", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        yield* stored("00000000-0000-4000-8000-0000000000d1", { deletedAt: tombstone })
        const abandoned = yield* stored("00000000-0000-4000-8000-0000000000d2", {
          status: "abandoned",
        })
        expect(Option.isNone(yield* repo.active)).toBe(true)
        const live = yield* repo.enroll(PROGRAM_ID)
        expect((yield* repo.enrollments).map((e) => e.id)).toEqual([live.id, abandoned.id])
        expect(Option.map(yield* repo.active, (e) => e.id)).toEqual(Option.some(live.id))
      }),
    ),
  )

  it.effect("abandon marks the row abandoned and dirty; a new enroll starts over", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const old = yield* stored("00000000-0000-4000-8000-0000000000d3", {})
        yield* repo.abandon(old.id)
        expect(yield* rows(`SELECT "status", "_dirty" FROM "program_enrollment"`)).toEqual([
          { status: "abandoned", _dirty: 1 },
        ])
        expect(Option.isNone(yield* repo.active)).toBe(true)
        const fresh = yield* repo.enroll(PROGRAM_ID)
        expect(fresh.id).not.toBe(old.id)
      }),
    ),
  )

  it.effect("abandon and complete fail with StoreError(EnrollmentNotFound) for unknown ids", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const id = ProgramEnrollmentId.make("00000000-0000-4000-8000-0000000000ee")
        const dead = yield* stored("00000000-0000-4000-8000-0000000000d4", { deletedAt: tombstone })
        const abandonError = yield* Effect.flip(repo.abandon(id))
        const completeError = yield* Effect.flip(
          repo.complete({
            enrollmentId: dead.id,
            dayNumber: 1,
            startedAt: DateTime.makeUnsafe(NOW),
            durationSeconds: 60,
          }),
        )
        expect(abandonError._tag).toBe("StoreError")
        expect(Predicate.isTagged(abandonError.cause, "EnrollmentNotFound")).toBe(true)
        expect(Predicate.isTagged(completeError.cause, "EnrollmentNotFound")).toBe(true)
      }),
    ),
  )

  it.effect("todayFor is the current day; None past the last day or for an unknown program", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const live = yield* stored("00000000-0000-4000-8000-0000000000d5", { currentDay: 2 })
        expect(Option.map(repo.todayFor(live), (d) => d.title)).toEqual(Option.some("Day 2 · Test"))
        const past = new ProgramEnrollment({ ...live, currentDay: 3, status: "completed" })
        expect(Option.isNone(repo.todayFor(past))).toBe(true)
        const unknown = new ProgramEnrollment({ ...live, programId: UNKNOWN_ID })
        expect(Option.isNone(repo.todayFor(unknown))).toBe(true)
      }),
    ),
  )

  it.effect("complete writes a dirty completion and bumps currentDay in one batch", () =>
    run(
      Effect.gen(function* () {
        const enrollment = yield* stored(TWO_DAY, {})
        const before = yield* version
        const first = yield* (yield* ProgramRepo).complete(dayInput(enrollment.id, 1))
        expect(first).toMatchObject({
          enrollmentId: enrollment.id,
          dayNumber: 1,
          durationSeconds: 840,
          userId: LOCAL_USER_ID,
        })
        expect(Option.isSome(first.sessionId)).toBe(true)
        expect(DateTime.toEpochMillis(first.completedAt)).toBe(NOW)
        expect(yield* version).toBe(before + 1)
        expect(
          yield* rows(`SELECT "status", "currentDay", "_dirty" FROM "program_enrollment"`),
        ).toEqual([{ status: "active", currentDay: 2, _dirty: 1 }])
      }),
    ),
  )

  it.effect("complete again for the same day returns that completion, writing nothing", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const enrollment = yield* stored(TWO_DAY, {})
        const first = yield* repo.complete(dayInput(enrollment.id, 1))
        const before = yield* version
        const repeat = yield* repo.complete(dayInput(enrollment.id, 1))
        expect(repeat.id).toBe(first.id)
        expect(yield* version).toBe(before)
      }),
    ),
  )

  it.effect("completing the last day marks the enrollment completed and no longer active", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const enrollment = yield* stored(TWO_DAY, { currentDay: 2 })
        yield* repo.complete(dayInput(enrollment.id, 2))
        expect(yield* rows(`SELECT "status", "currentDay" FROM "program_enrollment"`)).toEqual([
          { status: "completed", currentDay: 3 },
        ])
        expect(Option.isNone(yield* repo.active)).toBe(true)
      }),
    ),
  )

  it.effect("completing an older day does not move currentDay backwards", () =>
    run(
      Effect.gen(function* () {
        const enrollment = yield* stored(TWO_DAY, { currentDay: 2 })
        yield* (yield* ProgramRepo).complete(dayInput(enrollment.id, 1))
        expect(yield* rows(`SELECT "status", "currentDay" FROM "program_enrollment"`)).toEqual([
          { status: "active", currentDay: 2 },
        ])
      }),
    ),
  )

  it.effect(
    "complete on an abandoned enrollment fails with EnrollmentNotActive, writing nothing",
    () =>
      run(
        Effect.gen(function* () {
          const enrollment = yield* stored(TWO_DAY, { status: "abandoned" })
          const before = yield* version
          const error = yield* Effect.flip(
            (yield* ProgramRepo).complete(dayInput(enrollment.id, 1)),
          )
          expect(Predicate.isTagged(error.cause, "EnrollmentNotActive")).toBe(true)
          expect(yield* version).toBe(before)
          expect(yield* rows(`SELECT "id" FROM "program_day_completion"`)).toEqual([])
          expect(yield* rows(`SELECT "id" FROM "workout_session"`)).toEqual([])
        }),
      ),
  )
})

const ENROLLMENT = "00000000-0000-4000-8000-0000000000c1"
/** The circuit's planned length: 3 × (7 × 30 + 6 × 15) + 2 × 60. */
const CIRCUIT_SECONDS = 1020

const completeCircuit = (startedAgoSeconds: number) =>
  Effect.gen(function* () {
    const enrollment = yield* stored(ENROLLMENT, { programId: CIRCUIT_ID })
    const input = {
      enrollmentId: enrollment.id,
      dayNumber: 1,
      startedAt: DateTime.makeUnsafe(NOW - startedAgoSeconds * 1000),
      durationSeconds: startedAgoSeconds,
    }
    const before = yield* version
    const completion = yield* (yield* ProgramRepo).complete(input)
    return { input, completion, before }
  })

const sessions = rows(`SELECT * FROM "workout_session"`).pipe(
  Effect.flatMap(decodeRecords(SessionRow)),
)
const sets = rows(`SELECT * FROM "workout_set" ORDER BY "order"`).pipe(
  Effect.flatMap(decodeRecords(WorkoutSetRow)),
)
const millis = DateTime.toEpochMillis

describe("plannedItems", () => {
  it("ends the last item of the final round at the day's planned length", () => {
    const planned = plannedItems(CIRCUIT_DAY)
    expect(planned).toHaveLength(21)
    expect(planned.map((p) => p.endOffset).slice(0, 8)).toEqual([
      30, 75, 120, 165, 210, 255, 300, 390,
    ])
    expect(planned.at(-1)?.endOffset).toBe(CIRCUIT_SECONDS)
  })
})

describe("ProgramRepo.complete logs the day as a session", () => {
  it.effect("writes one dirty session with 21 sets in order; the completion points at it", () =>
    run(
      Effect.gen(function* () {
        const { completion, before } = yield* completeCircuit(1200)
        const [session, ...more] = yield* sessions
        expect(more).toHaveLength(0)
        expect(completion.sessionId).toEqual(Option.map(Option.fromNullishOr(session), (s) => s.id))
        expect(session?.notes).toEqual(Option.some("Core 30 · Day 1"))
        expect(session?.plannedSessionId).toEqual(Option.none())
        expect(session && millis(session.startedAt)).toBe(NOW - 1_200_000)
        expect(session?.finishedAt.pipe(Option.map(millis))).toEqual(Option.some(NOW))

        const logged = yield* sets
        expect(logged).toHaveLength(21)
        expect(logged.map((set) => set.order)).toEqual(Array.from({ length: 21 }, (_, i) => i))
        expect(logged.map((set) => set.exerciseId).slice(0, 8)).toEqual(
          [...CIRCUIT_ITEMS, "plank"].map(exerciseIdOf),
        )
        expect(logged.every((set) => set.reps === 30 && set.weightKg === 0)).toBe(true)
        expect(logged.every((set) => set.sessionId === session?.id)).toBe(true)
        expect(
          logged.every((set) => Option.isNone(set.rpe) && Option.isNone(set.plannedSetId)),
        ).toBe(true)
        const times = logged.map((set) => millis(set.loggedAt))
        expect(times.every((t, i) => i === 0 || t > (times[i - 1] ?? t))).toBe(true)
        expect(times[0]).toBe(NOW - 1_200_000 + 30_000)
        expect(times.at(-1)).toBe(NOW - 1_200_000 + CIRCUIT_SECONDS * 1000)

        const dirty = yield* rows(
          `SELECT "_dirty" AS d FROM "workout_session" UNION ALL SELECT "_dirty" FROM "workout_set"
           UNION ALL SELECT "_dirty" FROM "program_day_completion"
           UNION ALL SELECT "_dirty" FROM "program_enrollment"`,
        )
        expect(dirty).toHaveLength(24)
        expect(dirty.every((row) => row.d === 1)).toBe(true)
        expect(yield* version).toBe(before + 1)
      }),
    ),
  )

  it.effect("clamps loggedAt to now when the player ran faster than planned", () =>
    run(
      Effect.gen(function* () {
        yield* completeCircuit(600)
        const times = (yield* sets).map((set) => millis(set.loggedAt))
        expect(times.every((t) => t <= NOW)).toBe(true)
        expect(times.at(-1)).toBe(NOW)
      }),
    ),
  )

  it.effect("skips the 3 sets of a catalog id that cannot be linked and logs the rest", () =>
    run(
      Effect.gen(function* () {
        const { completion } = yield* completeCircuit(1200)
        const logged = yield* sets
        expect(logged).toHaveLength(18)
        expect(logged.some((set) => set.exerciseId === exerciseIdOf("bird-dog"))).toBe(false)
        expect(logged.map((set) => set.order)).toEqual(Array.from({ length: 18 }, (_, i) => i))
        expect(Option.isSome(completion.sessionId)).toBe(true)
      }),
      ["bird-dog"],
    ),
  )

  it.effect("writes no session and keeps sessionId None when no catalog id links", () =>
    run(
      Effect.gen(function* () {
        const { completion } = yield* completeCircuit(1200)
        expect(completion.sessionId).toEqual(Option.none())
        expect(yield* sessions).toHaveLength(0)
        expect(yield* sets).toHaveLength(0)
        expect(yield* rows(`SELECT "_dirty" FROM "program_day_completion"`)).toEqual([
          { _dirty: 1 },
        ])
        expect(yield* rows(`SELECT "currentDay" FROM "program_enrollment"`)).toEqual([
          { currentDay: 2 },
        ])
      }),
      CIRCUIT_ITEMS,
    ),
  )

  it.effect("a repeated complete writes no second session", () =>
    run(
      Effect.gen(function* () {
        const { input, completion } = yield* completeCircuit(1200)
        const before = yield* version
        const repeat = yield* (yield* ProgramRepo).complete(input)
        expect(repeat.sessionId).toEqual(completion.sessionId)
        expect(yield* sessions).toHaveLength(1)
        expect(yield* sets).toHaveLength(21)
        expect(yield* version).toBe(before)
      }),
    ),
  )
})
