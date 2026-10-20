import {
  type Exercise,
  type ExerciseId,
  ExerciseRow,
  IdGenerator,
  LocalDate,
  newId,
  type PlannedSession,
  PlannedSessionRow,
  type PlannedSet,
  type PlannedSetId,
  PlannedSetRow,
  Reps,
  Rpe,
  Session,
  SessionId,
  SessionRow,
  SetId,
  type SyncChange,
  ValidationError,
  WeightKg,
  WorkoutSet,
  WorkoutSetRow,
} from "@tanren/shared"
import {
  Array as Arr,
  Context,
  DateTime,
  Effect,
  Layer,
  Match,
  Option,
  pipe,
  Semaphore,
} from "effect"
import { CurrentUser, ownerId } from "./CurrentUser"
import { decodeRecords, LocalStore } from "./LocalStore"
import type { SqlRecord, StoreError } from "./SqlDriver"

export interface TodayExercise {
  readonly exercise: Exercise
  readonly plannedSets: ReadonlyArray<PlannedSet>
  /** Today's session, this exercise. */
  readonly loggedSets: ReadonlyArray<WorkoutSet>
  /** The next planned set's targets, else the last logged set. */
  readonly prefill: { readonly weightKg: number; readonly reps: number }
  /** The next planned set's `restSeconds`, default `DEFAULT_REST_SECONDS`. */
  readonly restSeconds: number
}

export interface Today {
  readonly plannedSession: PlannedSession
  readonly exercises: ReadonlyArray<TodayExercise>
}

export interface LogSetInput {
  readonly exerciseId: ExerciseId
  readonly plannedSetId: Option.Option<PlannedSetId>
  readonly weightKg: number
  readonly reps: number
  readonly rpe: Option.Option<number>
}

export const DEFAULT_REST_SECONDS = 120

/** The owner's calendar date now, in the device zone (`DateTime.CurrentTimeZone`). */
export const localToday: Effect.Effect<LocalDate, never, DateTime.CurrentTimeZone> =
  DateTime.nowInCurrentZone.pipe(Effect.map((now) => LocalDate.make(DateTime.formatIsoDate(now))))

/** Next planned set = the first one not yet matched by a logged set, counting in order. */
export const nextPlannedSet = (
  plannedSets: ReadonlyArray<PlannedSet>,
  loggedSets: ReadonlyArray<WorkoutSet>,
): Option.Option<PlannedSet> => Arr.get(plannedSets, loggedSets.length)

export const prefillFor = (
  plannedSets: ReadonlyArray<PlannedSet>,
  loggedSets: ReadonlyArray<WorkoutSet>,
): TodayExercise["prefill"] => {
  const last = Arr.last(loggedSets)
  const lastWeight = Option.match(last, { onNone: () => 0, onSome: (set) => set.weightKg })
  return Option.match(nextPlannedSet(plannedSets, loggedSets), {
    onNone: () =>
      Option.match(last, {
        onNone: () => ({ weightKg: 0, reps: 0 }),
        onSome: (set) => ({ weightKg: set.weightKg, reps: set.reps }),
      }),
    onSome: (planned) => ({
      weightKg: Option.getOrElse(planned.targetWeightKg, () => lastWeight),
      reps: Match.value(planned.targetReps).pipe(
        Match.tagsExhaustive({ Exact: ({ reps }) => reps, Range: ({ min }) => min }),
      ),
    }),
  })
}

const q = (sql: string, ...params: ReadonlyArray<string | number | null>) => ({ sql, params })

export interface TodayRepoShape {
  /** Today's planned session (active plan, not deleted) with its exercises; `None` when none. */
  readonly today: Effect.Effect<Option.Option<Today>, StoreError>
  /** Logs a set into today's session, creating the session on the first set. Marks both dirty. */
  readonly logSet: (input: LogSetInput) => Effect.Effect<WorkoutSet, StoreError | ValidationError>
}

export class TodayRepo extends Context.Service<TodayRepo, TodayRepoShape>()("@tanren/TodayRepo") {
  static readonly layerNoDeps = Layer.effect(
    this,
    Effect.gen(function* () {
      const store = yield* LocalStore
      const ids = yield* IdGenerator
      /** One logSet at a time: two quick taps must not both create a session or reuse an order. */
      const logLock = yield* Semaphore.make(1)
      const zone = yield* DateTime.CurrentTimeZone
      /** Rows are read and written as the signed-in user, else `LOCAL_USER_ID`. */
      const owner = ownerId(yield* CurrentUser)
      const withDeps = <A, E>(
        effect: Effect.Effect<A, E, IdGenerator | DateTime.CurrentTimeZone>,
      ): Effect.Effect<A, E> =>
        effect.pipe(
          Effect.provideService(IdGenerator, ids),
          Effect.provideService(DateTime.CurrentTimeZone, zone),
        )

      const plannedSessionToday = Effect.gen(function* () {
        const date = yield* localToday
        const userId = yield* owner
        const rows = yield* store.all(
          q(
            `SELECT ps.* FROM "planned_session" ps
             JOIN "plan_week" pw ON pw."id" = ps."planWeekId"
             JOIN "plan" p ON p."id" = pw."planId"
             WHERE ps."userId" = ? AND ps."scheduledDate" = ? AND p."status" = 'active'
               AND ps."deletedAt" IS NULL AND pw."deletedAt" IS NULL AND p."deletedAt" IS NULL
             ORDER BY ps."order", ps."id" LIMIT 1`,
            userId,
            date,
          ),
        )
        return Arr.head(yield* decodeRecords(PlannedSessionRow)(rows))
      })

      /** The open session for this planned session (or the unplanned one when `None`). */
      const openSession = (plannedSessionId: Option.Option<string>) =>
        owner.pipe(
          Effect.flatMap((userId) =>
            store.all(
              q(
                `SELECT * FROM "workout_session"
                 WHERE "userId" = ? AND "deletedAt" IS NULL AND "finishedAt" IS NULL
                   AND ("plannedSessionId" = ?2 OR (?2 IS NULL AND "plannedSessionId" IS NULL))
                 ORDER BY "startedAt" DESC LIMIT 1`,
                userId,
                Option.getOrNull(plannedSessionId),
              ),
            ),
          ),
          Effect.flatMap(decodeRecords(SessionRow)),
          Effect.map(Arr.head),
        )

      const loggedSets = (sessionId: Option.Option<SessionId>) =>
        Option.match(sessionId, {
          onNone: () => Effect.succeed<ReadonlyArray<WorkoutSet>>([]),
          onSome: (id) =>
            store
              .all(
                q(
                  `SELECT * FROM "workout_set" WHERE "sessionId" = ? AND "deletedAt" IS NULL
                   ORDER BY "order", "loggedAt"`,
                  id,
                ),
              )
              .pipe(Effect.flatMap(decodeRecords(WorkoutSetRow))),
        })

      const buildToday = (plannedSession: PlannedSession) =>
        Effect.gen(function* () {
          const plannedSets = yield* store
            .all(
              q(
                `SELECT * FROM "planned_set" WHERE "plannedSessionId" = ? AND "deletedAt" IS NULL
                 ORDER BY "order", "id"`,
                plannedSession.id,
              ),
            )
            .pipe(Effect.flatMap(decodeRecords(PlannedSetRow)))
          const exerciseIds = Arr.dedupe(plannedSets.map((set) => set.exerciseId))
          const exercises = yield* store
            .all(
              q(
                `SELECT * FROM "exercise" WHERE "id" IN (${exerciseIds.map(() => "?").join(", ")})`,
                ...exerciseIds,
              ),
            )
            .pipe(Effect.flatMap(decodeRecords(ExerciseRow)))
          const session = yield* openSession(Option.some(plannedSession.id))
          const logged = yield* loggedSets(Option.map(session, (s) => s.id))
          const todayExercises = pipe(
            exerciseIds.map((exerciseId) =>
              Arr.findFirst(exercises, (exercise) => exercise.id === exerciseId),
            ),
            Arr.getSomes,
            Arr.map((exercise): TodayExercise => {
              const planned = plannedSets.filter((set) => set.exerciseId === exercise.id)
              const done = logged.filter((set) => set.exerciseId === exercise.id)
              return {
                exercise,
                plannedSets: planned,
                loggedSets: done,
                prefill: prefillFor(planned, done),
                restSeconds: pipe(
                  nextPlannedSet(planned, done),
                  Option.flatMap((set) => set.restSeconds),
                  Option.getOrElse(() => DEFAULT_REST_SECONDS),
                ),
              }
            }),
          )
          return { plannedSession, exercises: todayExercises }
        })

      const today = withDeps(
        plannedSessionToday.pipe(
          Effect.flatMap((found) =>
            Effect.transposeOption(
              Option.map(found, (plannedSession) => buildToday(plannedSession)),
            ),
          ),
        ),
      )

      const validated = (input: LogSetInput) =>
        Effect.all({
          weightKg: WeightKg.makeEffect(input.weightKg),
          reps: Reps.makeEffect(input.reps),
          rpe: Effect.transposeOption(Option.map(input.rpe, (rpe) => Rpe.makeEffect(rpe))),
        }).pipe(Effect.mapError(ValidationError.fromIssue))

      const logSet = (input: LogSetInput) =>
        logLock.withPermits(1)(
          withDeps(
            Effect.gen(function* () {
              const values = yield* validated(input)
              const now = yield* DateTime.now
              const userId = yield* owner
              const plannedSessionId = Option.map(yield* plannedSessionToday, (ps) => ps.id)
              const existing = yield* openSession(plannedSessionId)
              const session = yield* Option.match(existing, {
                onSome: Effect.succeed,
                onNone: () =>
                  newId(SessionId).pipe(
                    Effect.flatMap((id) =>
                      Session.makeEffect({
                        id,
                        userId,
                        createdAt: now,
                        updatedAt: now,
                        deletedAt: Option.none(),
                        startedAt: now,
                        finishedAt: Option.none(),
                        plannedSessionId,
                        notes: Option.none(),
                      }),
                    ),
                    Effect.mapError(ValidationError.fromIssue),
                  ),
              })
              const orderRows = yield* store.all(
                q(
                  `SELECT COALESCE(MAX("order"), -1) + 1 AS "next" FROM "workout_set" WHERE "sessionId" = ?`,
                  session.id,
                ),
              )
              const order = nextOrder(orderRows)
              const set = yield* newId(SetId).pipe(
                Effect.flatMap((id) =>
                  WorkoutSet.makeEffect({
                    id,
                    userId,
                    createdAt: now,
                    updatedAt: now,
                    deletedAt: Option.none(),
                    sessionId: session.id,
                    exerciseId: input.exerciseId,
                    order,
                    weightKg: values.weightKg,
                    reps: values.reps,
                    rpe: values.rpe,
                    note: Option.none(),
                    plannedSetId: input.plannedSetId,
                    loggedAt: now,
                  }),
                ),
                Effect.mapError(ValidationError.fromIssue),
              )
              const setChange: SyncChange = { table: "set", row: set }
              const changes: ReadonlyArray<SyncChange> = Option.isNone(existing)
                ? [{ table: "session", row: session }, setChange]
                : [setChange]
              yield* store.write(changes, { dirty: true })
              return set
            }),
          ),
        )

      return TodayRepo.of({ today, logSet })
    }),
  )

  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(
      Layer.mergeAll(CurrentUser.layer, IdGenerator.layer, DateTime.layerCurrentZoneLocal).pipe(
        Layer.provideMerge(LocalStore.layer),
      ),
    ),
  )
}

const nextOrder = (rows: ReadonlyArray<SqlRecord>): number =>
  pipe(
    Arr.head(rows),
    Option.flatMap((row) => Option.fromNullishOr(row.next)),
    Option.filter((value): value is number => typeof value === "number"),
    Option.getOrElse(() => 0),
  )
