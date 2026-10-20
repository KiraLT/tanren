import { describe, expect, it } from "@effect/vitest"
import {
  Exercise,
  LocalDate,
  Plan,
  PlannedSession,
  PlannedSet,
  PlanWeek,
  Profile,
  Session,
  WorkoutSet,
} from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Option, Schema } from "effect"
import { SEED_USER_ID, type SeedData, seedMonth } from "./month"
import { seededIdGenerator } from "./seededIdGenerator"

const endDate = LocalDate.make("2026-10-20")

const run = (seed: number, end: LocalDate) =>
  seedMonth({ userId: SEED_USER_ID, seed, endDate: end }).pipe(Effect.provide(seededIdGenerator))

/** Every row survives encode then decode with its shared schema. */
const roundTrip = <S extends Schema.Codec<unknown, unknown>>(
  schema: S,
  rows: ReadonlyArray<S["Type"]>,
) =>
  Effect.forEach(rows, (row) =>
    Schema.encodeEffect(schema)(row).pipe(Effect.flatMap(Schema.decodeUnknownEffect(schema))),
  ).pipe(Effect.map((decoded) => expect(decoded).toEqual(rows)))

const ids = (data: SeedData): ReadonlyArray<string> =>
  [
    ...data.profile,
    ...data.exercise,
    ...data.plan,
    ...data.planWeek,
    ...data.plannedSession,
    ...data.plannedSet,
    ...data.session,
    ...data.set,
  ].map((row) => row.id)

describe("seedMonth", () => {
  it.effect("is deterministic: same (seed, endDate) gives deep-equal data and the same ids", () =>
    Effect.gen(function* () {
      const first = yield* run(1, endDate)
      const second = yield* run(1, endDate)
      expect(second).toEqual(first)
      expect(ids(second)).toEqual(ids(first))
    }),
  )

  it.effect("a different seed gives different ids", () =>
    Effect.gen(function* () {
      const one = yield* run(1, endDate)
      const two = yield* run(2, endDate)
      expect(ids(two)).not.toEqual(ids(one))
    }),
  )

  it.effect("every row decodes with its shared schema", () =>
    Effect.gen(function* () {
      const data = yield* run(1, endDate)
      yield* roundTrip(Profile, data.profile)
      yield* roundTrip(Exercise, data.exercise)
      yield* roundTrip(Plan, data.plan)
      yield* roundTrip(PlanWeek, data.planWeek)
      yield* roundTrip(PlannedSession, data.plannedSession)
      yield* roundTrip(PlannedSet, data.plannedSet)
      yield* roundTrip(Session, data.session)
      yield* roundTrip(WorkoutSet, data.set)
    }),
  )

  it.effect("has the volume and shape of docs/design/db.md §7", () =>
    Effect.gen(function* () {
      const data = yield* run(1, endDate)
      expect(data.profile).toHaveLength(1)
      expect(data.profile[0]?.id).toBe(SEED_USER_ID)
      expect(data.exercise).toHaveLength(14)
      expect(data.plan).toHaveLength(1)
      expect(data.plan[0]?.status).toBe("active")
      expect(data.planWeek).toHaveLength(5)
      expect(data.plannedSession).toHaveLength(20)
      expect(data.plannedSet.length).toBeGreaterThanOrEqual(20 * 4 * 3)
      expect(data.plannedSet.length).toBeLessThanOrEqual(20 * 6 * 5)

      const planned = data.session.filter((s) => Option.isSome(s.plannedSessionId))
      expect(planned.length).toBeGreaterThanOrEqual(13)
      expect(planned.length).toBeLessThanOrEqual(16)
      expect(data.session.length - planned.length).toBe(1)
      expect(data.set.filter((s) => Option.isSome(s.deletedAt))).toHaveLength(1)

      const rpes = data.set.flatMap((s) => Option.toArray(s.rpe))
      expect(Math.min(...rpes)).toBeGreaterThanOrEqual(6.5)
      expect(Math.max(...rpes)).toBeLessThanOrEqual(9.5)
      expect(data.set.some((s) => Option.isSome(s.note))).toBe(true)
      expect(
        data.plannedSet.every((s) => s.restSeconds.pipe(Option.exists((r) => r >= 90 && r <= 180))),
      ).toBe(true)
      expect(data.plannedSet.some((s) => s.targetReps._tag === "Exact")).toBe(true)
      expect(data.plannedSet.some((s) => s.targetReps._tag === "Range")).toBe(true)
    }),
  )

  it.effect("keeps foreign keys valid, one user, and every timestamp inside the window", () =>
    Effect.gen(function* () {
      const data = yield* run(1, endDate)
      const has = (rows: ReadonlyArray<{ readonly id: string }>) => new Set(rows.map((r) => r.id))
      const weeks = has(data.planWeek)
      const planSessions = has(data.plannedSession)
      const planSets = has(data.plannedSet)
      const sessions = has(data.session)
      const exercises = has(data.exercise)
      expect(data.planWeek.every((w) => data.plan[0]?.id === w.planId)).toBe(true)
      expect(data.plannedSession.every((s) => weeks.has(s.planWeekId))).toBe(true)
      expect(data.plannedSet.every((s) => planSessions.has(s.plannedSessionId))).toBe(true)
      expect(data.plannedSet.every((s) => exercises.has(s.exerciseId))).toBe(true)
      expect(data.set.every((s) => sessions.has(s.sessionId) && exercises.has(s.exerciseId))).toBe(
        true,
      )
      expect(
        data.session.every((s) =>
          Option.match(s.plannedSessionId, {
            onNone: () => true,
            onSome: (id) => planSessions.has(id),
          }),
        ),
      ).toBe(true)
      expect(
        data.set.every((s) =>
          Option.match(s.plannedSetId, {
            onNone: () => true,
            onSome: (id) => planSets.has(id),
          }),
        ),
      ).toBe(true)

      const users = new Set(
        [...data.exercise, ...data.plan, ...data.planWeek, ...data.session, ...data.set].map(
          (r) => r.userId,
        ),
      )
      expect([...users]).toEqual([SEED_USER_ID])
      expect(new Set(ids(data)).size).toBe(ids(data).length)

      const endOfWindow = Date.UTC(2026, 9, 21)
      const startOfWindow = endOfWindow - 30 * 86_400_000
      expect(
        data.set.every((s) => {
          const at = DateTime.toEpochMillis(s.loggedAt)
          return at >= startOfWindow && at < endOfWindow
        }),
      ).toBe(true)
    }),
  )

  it.effect("progresses the compounds week over week, with a lighter deload week", () =>
    Effect.gen(function* () {
      const data = yield* run(1, endDate)
      const bench = data.exercise.find((e) => e.name === "Bench Press")
      const weekOf = new Map(data.plannedSession.map((s) => [s.id, s.planWeekId]))
      const weekIds = data.planWeek.map((w) => w.id)
      const topWeight = (weekIndex: number) =>
        Math.max(
          ...data.plannedSet
            .filter(
              (s) =>
                s.exerciseId === bench?.id && weekOf.get(s.plannedSessionId) === weekIds[weekIndex],
            )
            .flatMap((s) => Option.toArray(s.targetWeightKg)),
        )
      expect(topWeight(1)).toBe(topWeight(0) + 2.5)
      expect(topWeight(2)).toBe(topWeight(1) + 2.5)
      expect(topWeight(3)).toBeLessThan(topWeight(2))
      expect(topWeight(4)).toBe(topWeight(2) + 2.5)
    }),
  )

  it.effect("holds its shape for every weekday alignment of endDate", () =>
    Effect.gen(function* () {
      const ends = Arr.range(14, 20).map((day) => LocalDate.make(`2026-10-${day}`))
      yield* Effect.forEach(ends, (end) =>
        Effect.gen(function* () {
          const data = yield* run(7, end)
          const planned = data.session.filter((s) => Option.isSome(s.plannedSessionId))
          expect(planned.length).toBeGreaterThanOrEqual(13)
          expect(planned.length).toBeLessThanOrEqual(16)
          expect(data.session.length - planned.length).toBe(1)
          yield* roundTrip(Session, data.session)
          yield* roundTrip(WorkoutSet, data.set)
        }),
      )
    }),
  )
})
