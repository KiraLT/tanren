import { describe, expect, it } from "@effect/vitest"
import {
  ExerciseId,
  IdGenerator,
  LocalDate,
  Program,
  ProgramEnrollment,
  ProgramEnrollmentId,
  ProgramId,
} from "@tanren/shared"
import { DateTime, Effect, Layer, Option, Result, Schema } from "effect"
import { TestClock } from "effect/testing"
import { LOCAL_USER_ID } from "../store/localUser"
import { CurrentUser } from "./CurrentUser"
import { ExerciseLink } from "./ExerciseLink"
import { LocalStore } from "./LocalStore"
import { ProgramRepo } from "./ProgramRepo"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"

const NOW = Date.UTC(2026, 9, 20, 22, 30)
const PROGRAM_ID = ProgramId.make("edge-2")

const day = (dayNumber: number) => ({
  dayNumber,
  title: `Day ${dayNumber} · Edge`,
  rounds: 1,
  items: [
    { kind: "timed", catalogId: "plank", seconds: 30, restSeconds: 15 },
    { kind: "reps", catalogId: "squat", reps: 10, restSeconds: 15 },
  ],
  restBetweenRoundsSeconds: 30,
})
const program = Schema.decodeUnknownSync(Program)({
  programId: PROGRAM_ID,
  name: "Edge",
  tagline: "fixture",
  description: "Two days.",
  days: [day(1), day(2)],
})
const find = (id: ProgramId) => (id === PROGRAM_ID ? Option.some(program) : Option.none())

const link = Layer.succeed(
  ExerciseLink,
  ExerciseLink.of({
    ensure: (catalogId) =>
      Effect.succeed(
        ExerciseId.make(`00000000-0000-4000-8000-0000000000a${catalogId === "plank" ? 0 : 1}`),
      ),
  }),
)

const layer = ProgramRepo.layerWith(find).pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      LocalStore.layerNoDeps.pipe(
        Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
      ),
      IdGenerator.layerTest,
      CurrentUser.layerTest(Option.none()),
      DateTime.layerCurrentZoneNamed("Europe/Vilnius").pipe(Layer.orDie),
      link,
    ),
  ),
)

const run = <A, E>(body: Effect.Effect<A, E, ProgramRepo | LocalStore>) =>
  TestClock.setTime(NOW).pipe(Effect.andThen(body), Effect.provide(layer))

const count = (table: string, where = "1 = 1") =>
  Effect.gen(function* () {
    const rows = yield* (yield* LocalStore).all({
      sql: `SELECT COUNT(*) AS n FROM "${table}" WHERE ${where}`,
      params: [],
    })
    return Number(rows[0]?.n)
  })

const storedEnrollment = (
  id: string,
  fields: Partial<Pick<ProgramEnrollment, "status" | "deletedAt" | "currentDay">>,
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

const ENR = "00000000-0000-4000-8000-0000000000d7"
const input = (dayNumber: number, performedItems: number, durationSeconds = 60) => ({
  enrollmentId: ProgramEnrollmentId.make(ENR),
  dayNumber: dayNumber as never, // brand is checked by the schema inside; the test passes plain ints
  startedAt: DateTime.makeUnsafe(NOW - 900_000),
  durationSeconds,
  performedItems,
})

describe("ProgramRepo edge cases", () => {
  it.effect("five concurrent enrolls (a double tap storm) leave one active row", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        const all = yield* Effect.all(
          Array.from({ length: 5 }, () => repo.enroll(PROGRAM_ID)),
          { concurrency: "unbounded" },
        )
        expect(new Set(all.map((e) => e.id)).size).toBe(1)
        expect(yield* count("program_enrollment")).toBe(1)
      }),
    ),
  )

  it.effect(
    "completing the same day twice concurrently writes one completion and one session",
    () =>
      run(
        Effect.gen(function* () {
          const repo = yield* ProgramRepo
          yield* storedEnrollment(ENR, {})
          const [a, b] = yield* Effect.all(
            [repo.complete(input(1, 2)), repo.complete(input(1, 2))],
            { concurrency: "unbounded" },
          )
          expect(a.id).toBe(b.id)
          expect(yield* count("program_day_completion")).toBe(1)
          expect(yield* count("workout_session")).toBe(1)
        }),
      ),
  )

  it.effect(
    "a completion whose enrollment was tombstoned by a pull fails typed and writes nothing",
    () =>
      run(
        Effect.gen(function* () {
          const repo = yield* ProgramRepo
          yield* storedEnrollment(ENR, { deletedAt: Option.some(DateTime.makeUnsafe(NOW - 1000)) })
          const result = yield* Effect.result(repo.complete(input(1, 2)))
          expect(Result.isFailure(result) && result.failure).toMatchObject({ _tag: "StoreError" })
          expect(yield* count("program_day_completion")).toBe(0)
          expect(yield* count("workout_session")).toBe(0)
        }),
      ),
  )

  it.effect("completing on an abandoned enrollment writes no session either", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        yield* storedEnrollment(ENR, { status: "abandoned" })
        const result = yield* Effect.result(repo.complete(input(1, 2)))
        expect(Result.isFailure(result)).toBe(true)
        expect(yield* count("workout_session")).toBe(0)
        expect(yield* count("workout_set")).toBe(0)
      }),
    ),
  )

  it.effect("partial performedItems logs exactly that many sets (1 of 2)", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        yield* storedEnrollment(ENR, {})
        const completion = yield* repo.complete(input(1, 1))
        expect(Option.isSome(completion.sessionId)).toBe(true)
        expect(yield* count("workout_set")).toBe(1)
      }),
    ),
  )

  it.effect("performedItems above the total is clamped, negative logs nothing", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        yield* storedEnrollment(ENR, {})
        const over = yield* repo.complete(input(1, 999))
        expect(Option.isSome(over.sessionId)).toBe(true)
        expect(yield* count("workout_set")).toBe(2)
        const under = yield* repo.complete(input(2, -5))
        expect(Option.isNone(under.sessionId)).toBe(true)
        expect(yield* count("workout_set")).toBe(2)
      }),
    ),
  )

  it.effect(
    "performedItems NaN or Infinity never throws and never logs more than the day has",
    () =>
      run(
        Effect.gen(function* () {
          const repo = yield* ProgramRepo
          yield* storedEnrollment(ENR, {})
          yield* repo.complete(input(1, Number.NaN))
          expect(yield* count("workout_set")).toBeLessThanOrEqual(2)
          yield* repo.complete(input(2, Number.POSITIVE_INFINITY))
          expect(yield* count("workout_set")).toBeLessThanOrEqual(4)
        }),
      ),
  )

  it.effect("a fractional durationSeconds fails typed (StoreError) and writes nothing", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        yield* storedEnrollment(ENR, {})
        const result = yield* Effect.result(repo.complete(input(1, 2, 840.5)))
        expect(Result.isFailure(result) && result.failure).toMatchObject({ _tag: "StoreError" })
        expect(yield* count("workout_session")).toBe(0)
        expect(yield* count("program_day_completion")).toBe(0)
      }),
    ),
  )

  it.effect(
    "a day past the last one records the completion with no session and caps nothing silently",
    () =>
      run(
        Effect.gen(function* () {
          const repo = yield* ProgramRepo
          yield* storedEnrollment(ENR, {})
          const completion = yield* repo.complete(input(3, 2))
          expect(Option.isNone(completion.sessionId)).toBe(true)
          const [enrollment] = yield* repo.enrollments
          expect(enrollment).toMatchObject({ currentDay: 4, status: "completed" })
        }),
      ),
  )

  it.effect("completing day 2 while currentDay is 1 skips day 1 (currentDay 3, completed)", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        yield* storedEnrollment(ENR, {})
        yield* repo.complete(input(2, 2))
        const [enrollment] = yield* repo.enrollments
        // Documents current behaviour: day 1 never done, yet the program is marked completed.
        expect(enrollment).toMatchObject({ currentDay: 3, status: "completed" })
      }),
    ),
  )

  it.effect(
    "after completion the same-day replay on a completed enrollment still returns the first completion",
    () =>
      run(
        Effect.gen(function* () {
          const repo = yield* ProgramRepo
          yield* storedEnrollment(ENR, { currentDay: 2 })
          const first = yield* repo.complete(input(2, 2))
          const again = yield* repo.complete(input(2, 2))
          expect(again.id).toBe(first.id)
          expect(yield* count("workout_session")).toBe(1)
        }),
      ),
  )

  it.effect(
    "enroll after the previous enrollment was completed or abandoned starts a fresh one",
    () =>
      run(
        Effect.gen(function* () {
          const repo = yield* ProgramRepo
          yield* storedEnrollment(ENR, { status: "completed", currentDay: 3 })
          const fresh = yield* repo.enroll(PROGRAM_ID)
          expect(fresh).toMatchObject({ status: "active", currentDay: 1 })
          expect(fresh.id).not.toBe(ENR)
          expect(yield* count("program_enrollment", `"status" = 'active'`)).toBe(1)
        }),
      ),
  )

  it.effect("enroll when the only active row is tombstoned starts a new one", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* ProgramRepo
        yield* storedEnrollment(ENR, { deletedAt: Option.some(DateTime.makeUnsafe(NOW - 1000)) })
        const fresh = yield* repo.enroll(PROGRAM_ID)
        expect(fresh.id).not.toBe(ENR)
      }),
    ),
  )
})
