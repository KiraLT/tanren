import { describe, expect, it } from "@effect/vitest"
import {
  CatalogId,
  CORE30,
  ExerciseId,
  IdGenerator,
  LocalDate,
  Program,
  ProgramDay,
  ProgramEnrollment,
  ProgramEnrollmentId,
  ProgramId,
  programIdOfRow,
  SessionRow,
  UserId,
  UserProgram,
  UserProgramId,
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
const find = (id: ProgramId) =>
  Effect.succeed(Option.fromNullishOr(CATALOG.find((p) => p.programId === id)))

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
      swaps: [],
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
  performedItems: 1,
  performedIds: [],
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

  it.effect("enrollments skip tombstones (newest first); activeEnrollments skips abandoned", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        yield* stored("00000000-0000-4000-8000-0000000000d1", { deletedAt: tombstone })
        const abandoned = yield* stored("00000000-0000-4000-8000-0000000000d2", {
          status: "abandoned",
        })
        expect(yield* repo.activeEnrollments()).toEqual([])
        const live = yield* repo.enroll(PROGRAM_ID)
        expect((yield* repo.enrollments).map((e) => e.id)).toEqual([live.id, abandoned.id])
        expect((yield* repo.activeEnrollments()).map((a) => a.enrollment.id)).toEqual([live.id])
      }),
    ),
  )

  it.effect("setStatus abandoned marks the row dirty; a new enroll starts over", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const old = yield* stored("00000000-0000-4000-8000-0000000000d3", {})
        yield* repo.setStatus(old.id, "abandoned")
        expect(yield* rows(`SELECT "status", "_dirty" FROM "program_enrollment"`)).toEqual([
          { status: "abandoned", _dirty: 1 },
        ])
        expect(yield* repo.activeEnrollments()).toEqual([])
        const fresh = yield* repo.enroll(PROGRAM_ID)
        expect(fresh.id).not.toBe(old.id)
      }),
    ),
  )

  it.effect("setStatus and complete fail with StoreError(EnrollmentNotFound) for unknown ids", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const id = ProgramEnrollmentId.make("00000000-0000-4000-8000-0000000000ee")
        const dead = yield* stored("00000000-0000-4000-8000-0000000000d4", { deletedAt: tombstone })
        const abandonError = yield* Effect.flip(repo.setStatus(id, "abandoned"))
        const completeError = yield* Effect.flip(
          repo.complete({
            enrollmentId: dead.id,
            dayNumber: 1,
            startedAt: DateTime.makeUnsafe(NOW),
            durationSeconds: 60,
            performedItems: 1,
            performedIds: [],
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
        expect(Option.map(yield* repo.todayFor(live), (d) => d.title)).toEqual(
          Option.some("Day 2 · Test"),
        )
        const past = new ProgramEnrollment({ ...live, currentDay: 3, status: "completed" })
        expect(Option.isNone(yield* repo.todayFor(past))).toBe(true)
        const unknown = new ProgramEnrollment({ ...live, programId: UNKNOWN_ID })
        expect(Option.isNone(yield* repo.todayFor(unknown))).toBe(true)
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
        expect(yield* repo.activeEnrollments()).toEqual([])
      }),
    ),
  )

  it.effect.each([
    { currentDay: 2, day: 1 },
    { currentDay: 1, day: 2 },
  ])(
    "complete for day $day while currentDay is $currentDay fails DayOutOfOrder, writing nothing",
    ({ currentDay, day }) =>
      run(
        Effect.gen(function* () {
          const enrollment = yield* stored(TWO_DAY, { currentDay })
          const before = yield* version
          const error = yield* Effect.flip(
            (yield* ProgramRepo).complete(dayInput(enrollment.id, day)),
          )
          expect(error.cause).toMatchObject({
            _tag: "DayOutOfOrder",
            expected: currentDay,
            got: day,
          })
          expect(yield* version).toBe(before)
          expect(yield* rows(`SELECT "status", "currentDay" FROM "program_enrollment"`)).toEqual([
            { status: "active", currentDay },
          ])
          expect(yield* rows(`SELECT "id" FROM "program_day_completion"`)).toEqual([])
          expect(yield* rows(`SELECT "id" FROM "workout_session"`)).toEqual([])
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

const completeCircuit = (
  startedAgoSeconds: number,
  performedItems = 21,
  performedIds: ReadonlyArray<CatalogId> = [],
) =>
  Effect.gen(function* () {
    const enrollment = yield* stored(ENROLLMENT, { programId: CIRCUIT_ID })
    const input = {
      enrollmentId: enrollment.id,
      dayNumber: 1,
      startedAt: DateTime.makeUnsafe(NOW - startedAgoSeconds * 1000),
      durationSeconds: startedAgoSeconds,
      performedItems,
      performedIds,
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

  it.effect("an early finish logs only the first performedItems item-rounds, in order", () =>
    run(
      Effect.gen(function* () {
        yield* completeCircuit(1200, 9)
        const logged = yield* sets
        expect(logged.map((set) => set.order)).toEqual(Array.from({ length: 9 }, (_, i) => i))
        expect(logged.map((set) => set.exerciseId)).toEqual(
          [...CIRCUIT_ITEMS, "plank", "dead-bug"].map(exerciseIdOf),
        )
        expect(logged.map((set) => millis(set.loggedAt))).toEqual(
          plannedItems(CIRCUIT_DAY)
            .slice(0, 9)
            .map((planned) => NOW - 1_200_000 + planned.endOffset * 1000),
        )
      }),
    ),
  )

  it.effect("performedItems 0 writes no session but still records the completion", () =>
    run(
      Effect.gen(function* () {
        const { completion } = yield* completeCircuit(20, 0)
        expect(completion.sessionId).toEqual(Option.none())
        expect(yield* sessions).toHaveLength(0)
        expect(yield* rows(`SELECT "dayNumber" FROM "program_day_completion"`)).toEqual([
          { dayNumber: 1 },
        ])
      }),
    ),
  )
})

const rowsLayer = ProgramRepo.layerNoDeps.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      LocalStore.layerNoDeps.pipe(
        Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
      ),
      IdGenerator.layerTest,
      CurrentUser.layerTest(Option.none()),
      DateTime.layerCurrentZoneNamed("Europe/Vilnius").pipe(Layer.orDie),
      fakeLink([]),
    ),
  ),
)

/** The app's layer: built-ins plus the store's `program` rows. */
const runRows = <A, E>(
  body: Effect.Effect<A, E, ProgramRepo | LocalStore | StoreEvents | SqlDriver | IdGenerator>,
) => TestClock.setTime(NOW).pipe(Effect.andThen(body), Effect.provide(rowsLayer))

const USER_PROGRAM = Schema.decodeUnknownSync(UserProgram)({
  id: "00000000-0000-4000-8000-0000000000f1",
  userId: LOCAL_USER_ID,
  createdAt: "2026-10-20T08:00:00.000Z",
  updatedAt: "2026-10-20T08:00:00.000Z",
  deletedAt: null,
  title: "Zebra split",
  slug: "zebra-split",
  summary: "Three short days.",
  description: null,
  days: [day(1), day(2)],
  schedule: { kind: "daysPerWeek", days: 3 },
  source: "manual",
  version: 1,
})
const USER_PROGRAM_ID = programIdOfRow(USER_PROGRAM.id)
const PLANK = CatalogId.make("plank")
const DEAD_BUG = CatalogId.make("dead-bug")

describe("ProgramRepo statuses (v6b)", () => {
  it.effect("complete on a paused enrollment fails EnrollmentNotActive and writes nothing", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const paused = yield* stored("00000000-0000-4000-8000-0000000000c1", { status: "paused" })
        const before = yield* version
        const error = yield* Effect.flip(repo.complete(dayInput(paused.id, 1)))
        expect(Predicate.isTagged(error.cause, "EnrollmentNotActive")).toBe(true)
        expect(yield* version).toBe(before)
        expect(yield* rows(`SELECT "id" FROM "program_day_completion"`)).toEqual([])
      }),
    ),
  )

  it.effect("setStatus on a completed enrollment fails EnrollmentTerminal and writes nothing", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const done = yield* stored("00000000-0000-4000-8000-0000000000c2", {
          status: "completed",
          currentDay: 3,
        })
        const before = yield* version
        const error = yield* Effect.flip(repo.setStatus(done.id, "active"))
        expect(Predicate.isTagged(error.cause, "EnrollmentTerminal")).toBe(true)
        expect(yield* version).toBe(before)
      }),
    ),
  )

  it.effect("setStatus pauses and resumes, dirty; the same status writes nothing", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const live = yield* stored("00000000-0000-4000-8000-0000000000c3", {})
        expect((yield* repo.setStatus(live.id, "paused")).status).toBe("paused")
        const before = yield* version
        yield* repo.setStatus(live.id, "paused")
        expect(yield* version).toBe(before)
        expect((yield* repo.setStatus(live.id, "active")).status).toBe("active")
        expect(yield* rows(`SELECT "status", "_dirty" FROM "program_enrollment"`)).toEqual([
          { status: "active", _dirty: 1 },
        ])
      }),
    ),
  )
})

describe("ProgramRepo.dueToday", () => {
  it.effect("lists two active programs and never a paused one", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const a = yield* repo.enroll(PROGRAM_ID)
        const b = yield* repo.enroll(OTHER_ID)
        yield* stored("00000000-0000-4000-8000-0000000000c4", {
          status: "paused",
          programId: CIRCUIT_ID,
        })
        const due = yield* repo.dueToday(DateTime.makeUnsafe(NOW))
        // Same createdAt (TestClock): newest first falls back to id desc.
        expect(due.map((entry) => entry.enrollment.id)).toEqual([b.id, a.id])
        expect((yield* repo.activeEnrollments()).length).toBe(3)
      }),
    ),
  )

  it.effect("drops a program whose day was completed today; it is due again tomorrow", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const enrollment = yield* repo.enroll(PROGRAM_ID)
        yield* repo.complete(dayInput(enrollment.id, 1))
        expect(yield* repo.dueToday(DateTime.makeUnsafe(NOW))).toEqual([])
        const tomorrow = yield* repo.dueToday(DateTime.makeUnsafe(NOW + 86_400_000))
        expect(tomorrow.map((entry) => Option.map(entry.day, (d) => d.dayNumber))).toEqual([
          Option.some(2),
        ])
      }),
    ),
  )
})

describe("ProgramRepo swaps", () => {
  it.effect("a swap is applied to todayFor, plannedItems and the logged sets", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const enrollment = yield* repo.enroll(PROGRAM_ID)
        const swapped = yield* repo.setSwap(enrollment.id, PLANK, Option.some(DEAD_BUG))
        expect(swapped.swaps).toEqual([{ from: PLANK, to: DEAD_BUG }])
        const today = yield* repo.todayFor(swapped)
        expect(
          Option.map(today, (d) => plannedItems(d).map((planned) => planned.item.catalogId)),
        ).toEqual(Option.some([DEAD_BUG]))
        yield* repo.complete(dayInput(enrollment.id, 1))
        expect((yield* sets).map((set) => set.exerciseId)).toEqual([exerciseIdOf(DEAD_BUG)])
      }),
    ),
  )

  it.effect("setSwap with None reverts to the original exercise, dirty", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const enrollment = yield* repo.enroll(PROGRAM_ID)
        yield* repo.setSwap(enrollment.id, PLANK, Option.some(DEAD_BUG))
        const reverted = yield* repo.setSwap(enrollment.id, PLANK, Option.none())
        expect(reverted.swaps).toEqual([])
        expect(
          Option.map(yield* repo.todayFor(reverted), (d) => d.items.map((i) => i.catalogId)),
        ).toEqual(Option.some([PLANK]))
        expect(yield* rows(`SELECT "swaps", "_dirty" FROM "program_enrollment"`)).toEqual([
          { swaps: "[]", _dirty: 1 },
        ])
      }),
    ),
  )
})

describe("ProgramRepo user programs", () => {
  it.effect("find returns a built-in and a user row as a Program", () =>
    runRows(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        yield* repo.save(USER_PROGRAM)
        expect(Option.map(yield* repo.find(CORE30.programId), (p) => p.name)).toEqual(
          Option.some(CORE30.name),
        )
        const own = yield* repo.find(USER_PROGRAM_ID)
        expect(Option.map(own, (p) => [p.name, p.days.length])).toEqual(
          Option.some(["Zebra split", 2]),
        )
      }),
    ),
  )

  it.effect("save inserts at the given version, then bumps it and keeps the slug", () =>
    runRows(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        expect((yield* repo.save(USER_PROGRAM)).version).toBe(1)
        const edited = yield* UserProgram.makeEffect({
          ...USER_PROGRAM,
          title: "Zebra split v2",
          slug: "renamed",
        })
        const saved = yield* repo.save(edited)
        expect([saved.version, saved.slug, saved.title]).toEqual([
          2,
          "zebra-split",
          "Zebra split v2",
        ])
        expect(yield* rows(`SELECT "version", "_dirty" FROM "program"`)).toEqual([
          { version: 2, _dirty: 1 },
        ])
      }),
    ),
  )

  it.effect("list puts built-ins first, then rows, each with its running enrollment", () =>
    runRows(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        yield* repo.save(USER_PROGRAM)
        const enrollment = yield* repo.enroll(USER_PROGRAM_ID)
        const list = yield* repo.list()
        expect(list.map((s) => s.source)).toEqual(["builtin", "builtin", "manual"])
        expect(Option.map(list[2]?.enrollment ?? Option.none(), (e) => e.enrollmentId)).toEqual(
          Option.some(enrollment.id),
        )
      }),
    ),
  )

  it.effect("deleteProgram is refused while enrolled and tombstones the row after leaving", () =>
    runRows(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        yield* repo.save(USER_PROGRAM)
        const enrollment = yield* repo.enroll(USER_PROGRAM_ID)
        const error = yield* Effect.flip(repo.deleteProgram(USER_PROGRAM.id))
        expect(Predicate.isTagged(error.cause, "ProgramInUse")).toBe(true)
        yield* repo.setStatus(enrollment.id, "abandoned")
        yield* repo.deleteProgram(USER_PROGRAM.id)
        expect(Option.isNone(yield* repo.find(USER_PROGRAM_ID))).toBe(true)
        expect(yield* rows(`SELECT "_dirty" FROM "program" WHERE "deletedAt" IS NOT NULL`)).toEqual(
          [{ _dirty: 1 }],
        )
      }),
    ),
  )
})

describe("ProgramRepo.findRow", () => {
  it.effect("returns the stored row with its description and schedule", () =>
    runRows(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const withDescription = yield* UserProgram.makeEffect({
          ...USER_PROGRAM,
          description: Option.some("A longer description."),
        })
        yield* repo.save(withDescription)
        const found = yield* repo.findRow(USER_PROGRAM.id)
        expect(
          Option.map(found, (row) => [row.title, row.description, row.schedule, row.version]),
        ).toEqual(
          Option.some([
            "Zebra split",
            Option.some("A longer description."),
            { kind: "daysPerWeek", days: 3 },
            1,
          ]),
        )
      }),
    ),
  )

  it.effect("matches an id stored upper-case, and save keeps that spelling (no second row)", () =>
    runRows(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const upper = UserProgramId.make(USER_PROGRAM.id.toUpperCase())
        yield* repo.save(yield* UserProgram.makeEffect({ ...USER_PROGRAM, id: upper }))
        expect(Option.map(yield* repo.findRow(USER_PROGRAM.id), (row) => row.id)).toEqual(
          Option.some(upper),
        )
        const saved = yield* repo.save(
          yield* UserProgram.makeEffect({ ...USER_PROGRAM, title: "Renamed" }),
        )
        expect([saved.id, saved.version]).toEqual([upper, 2])
        expect(yield* rows(`SELECT "id", "version" FROM "program"`)).toEqual([
          { id: upper, version: 2 },
        ])
      }),
    ),
  )

  it.effect("is None for an unknown or tombstoned id", () =>
    runRows(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        expect(Option.isNone(yield* repo.findRow(USER_PROGRAM.id))).toBe(true)
        yield* repo.save(USER_PROGRAM)
        yield* repo.deleteProgram(USER_PROGRAM.id)
        expect(Option.isNone(yield* repo.findRow(USER_PROGRAM.id))).toBe(true)
      }),
    ),
  )
})

describe("ProgramRepo test debt (REV-1b)", () => {
  it.effect("setSwap on a terminal enrollment fails EnrollmentTerminal and writes nothing", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const done = yield* stored("00000000-0000-4000-8000-0000000000c4", {
          status: "completed",
          currentDay: 3,
        })
        const before = yield* version
        const error = yield* Effect.flip(repo.setSwap(done.id, PLANK, Option.some(DEAD_BUG)))
        expect(Predicate.isTagged(error.cause, "EnrollmentTerminal")).toBe(true)
        expect(yield* version).toBe(before)
        expect(yield* rows(`SELECT "swaps", "_dirty" FROM "program_enrollment"`)).toEqual([
          { swaps: "[]", _dirty: 0 },
        ])
      }),
    ),
  )

  it.effect("setStatus on an abandoned enrollment is refused and writes nothing", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const left = yield* stored("00000000-0000-4000-8000-0000000000c5", {
          status: "abandoned",
        })
        const before = yield* version
        const error = yield* Effect.flip(repo.setStatus(left.id, "active"))
        expect(Predicate.isTagged(error.cause, "EnrollmentTerminal")).toBe(true)
        expect(yield* version).toBe(before)
        expect(yield* rows(`SELECT "status", "_dirty" FROM "program_enrollment"`)).toEqual([
          { status: "abandoned", _dirty: 0 },
        ])
      }),
    ),
  )

  it.effect("deleteProgram with an unknown id fails StoreError(ProgramNotFound)", () =>
    runRows(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const before = yield* version
        const error = yield* Effect.flip(repo.deleteProgram(USER_PROGRAM.id))
        expect(error).toBeInstanceOf(StoreError)
        expect(Predicate.isTagged(error.cause, "ProgramNotFound")).toBe(true)
        expect(yield* version).toBe(before)
      }),
    ),
  )

  it.effect("save on update keeps createdAt, source and the owner as userId", () =>
    runRows(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const first = yield* repo.save(USER_PROGRAM)
        // The caller's copy claims another author, source and creation time: the stored ones win.
        const tampered = yield* UserProgram.makeEffect({
          ...USER_PROGRAM,
          title: "Zebra split v2",
          userId: UserId.make("00000000-0000-4000-8000-00000000beef"),
          createdAt: DateTime.makeUnsafe(NOW + 86_400_000),
          source: "mcp",
        })
        const saved = yield* repo.save(tampered)
        expect(saved.title).toBe("Zebra split v2")
        expect(saved.userId).toBe(LOCAL_USER_ID)
        expect(saved.source).toBe("manual")
        expect(DateTime.toEpochMillis(saved.createdAt)).toBe(
          DateTime.toEpochMillis(first.createdAt),
        )
        expect(DateTime.toEpochMillis(saved.createdAt)).toBe(
          DateTime.toEpochMillis(USER_PROGRAM.createdAt),
        )
        expect(yield* rows(`SELECT "userId", "source", "createdAt" FROM "program"`)).toEqual([
          {
            userId: LOCAL_USER_ID,
            source: "manual",
            createdAt: DateTime.formatIso(USER_PROGRAM.createdAt),
          },
        ])
      }),
    ),
  )

  it.effect("setSwap that changes nothing writes nothing: no updatedAt bump, no dirty flag", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const live = yield* stored("00000000-0000-4000-8000-0000000000c6", {})
        const before = yield* version
        // Revert of an id that was never swapped.
        yield* repo.setSwap(live.id, PLANK, Option.none())
        // A swap to itself is a revert too.
        yield* repo.setSwap(live.id, PLANK, Option.some(PLANK))
        expect(yield* version).toBe(before)
        expect(yield* rows(`SELECT "updatedAt", "_dirty" FROM "program_enrollment"`)).toEqual([
          { updatedAt: DateTime.formatIso(live.updatedAt), _dirty: 0 },
        ])
        // Setting the same pair twice: the second call is the no-op.
        yield* repo.setSwap(live.id, PLANK, Option.some(DEAD_BUG))
        const afterFirst = yield* version
        yield* repo.setSwap(live.id, PLANK, Option.some(DEAD_BUG))
        expect(yield* version).toBe(afterFirst)
      }),
    ),
  )
})

describe("ProgramRepo.deleteProgram with an upper-case stored id", () => {
  it.effect("is refused while an enrollment is active, whatever spelling the caller uses", () =>
    runRows(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const upper = UserProgramId.make(USER_PROGRAM.id.toUpperCase())
        yield* repo.save(yield* UserProgram.makeEffect({ ...USER_PROGRAM, id: upper }))
        yield* repo.enroll(programIdOfRow(upper))
        const refusedLower = yield* Effect.flip(repo.deleteProgram(USER_PROGRAM.id))
        const refusedUpper = yield* Effect.flip(repo.deleteProgram(upper))
        expect(
          [refusedLower, refusedUpper].map((error) =>
            Predicate.isTagged(error.cause, "ProgramInUse"),
          ),
        ).toEqual([true, true])
        expect(Option.isSome(yield* repo.findRow(upper))).toBe(true)
      }),
    ),
  )
})

describe("ProgramRepo.complete logs what was performed (mid-workout swaps)", () => {
  /** The circuit's 21 item-rounds, round-major, as the day writes them. */
  const WRITTEN = Array.from({ length: 21 }, (_, index) =>
    CatalogId.make(CIRCUIT_ITEMS[index % 7] ?? "plank"),
  )
  const SQUAT = CatalogId.make("squat")
  const loggedIds = sets.pipe(Effect.map((logged) => logged.map((set) => set.exerciseId)))

  it.effect("2 rounds before a swap and 1 after: 2 sets under the original, 1 under the new", () =>
    run(
      Effect.gen(function* () {
        // plank (item 0) was swapped to squat during round 3 (item-round 14 on).
        const ids = WRITTEN.map((id, index) => (index % 7 === 0 && index >= 14 ? SQUAT : id))
        yield* completeCircuit(1200, 21, ids)
        const logged = yield* loggedIds
        const plankSets = [0, 7, 14].map((index) => logged[index])
        expect(plankSets).toEqual([
          exerciseIdOf("plank"),
          exerciseIdOf("plank"),
          exerciseIdOf("squat"),
        ])
        expect(logged.filter((id) => id === exerciseIdOf("plank"))).toHaveLength(2)
        expect(logged).toHaveLength(21)
      }),
    ),
  )

  it.effect("a swap then a revert: only the middle round carries the swapped exercise", () =>
    run(
      Effect.gen(function* () {
        const ids = WRITTEN.map((id, index) => (index % 7 === 0 && index === 7 ? SQUAT : id))
        yield* completeCircuit(1200, 21, ids)
        const logged = yield* loggedIds
        expect([0, 7, 14].map((index) => logged[index])).toEqual([
          exerciseIdOf("plank"),
          exerciseIdOf("squat"),
          exerciseIdOf("plank"),
        ])
      }),
    ),
  )

  it.effect("the recorded ids win over the swaps stored on the enrollment", () =>
    run(
      Effect.gen(function* () {
        const enrollment = yield* stored(ENROLLMENT, { programId: CIRCUIT_ID })
        yield* (yield* ProgramRepo).setSwap(
          enrollment.id,
          CatalogId.make("plank"),
          Option.some(SQUAT),
        )
        yield* (yield* ProgramRepo).complete({
          enrollmentId: enrollment.id,
          dayNumber: 1,
          startedAt: DateTime.makeUnsafe(NOW - 1_200_000),
          durationSeconds: 1200,
          performedItems: 21,
          performedIds: WRITTEN,
        })
        const logged = yield* loggedIds
        expect(logged[0]).toBe(exerciseIdOf("plank"))
        expect(logged[14]).toBe(exerciseIdOf("plank"))
      }),
    ),
  )

  it.effect("with no ids recorded the day as written (swaps as stored) is logged, as before", () =>
    run(
      Effect.gen(function* () {
        yield* completeCircuit(1200)
        expect(yield* loggedIds).toEqual(WRITTEN.map(exerciseIdOf))
      }),
    ),
  )
})
