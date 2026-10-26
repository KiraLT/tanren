import {
  type Exercise,
  type ExerciseId,
  ExerciseRow,
  IdGenerator,
  LocalDate,
  newId,
  type PlannedSession,
  PlannedSessionRow,
  PlannedSet,
  PlannedSetId,
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
import { type SqlRecord, StoreError } from "./SqlDriver"

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

/** The unfinished session Today logs into, with its live set count (any exercise). */
export interface OpenSession {
  readonly session: Session
  readonly setCount: number
}

export interface Today {
  readonly plannedSession: PlannedSession
  readonly exercises: ReadonlyArray<TodayExercise>
  /** None before the first set and again after `finishSession`. */
  readonly session: Option.Option<OpenSession>
}

/** `finishSession`'s answer: what the confirmation line shows. */
export interface FinishedSession {
  readonly sessionId: SessionId
  readonly setCount: number
  /** `finishedAt − startedAt`, whole seconds. */
  readonly durationSeconds: number
}

export interface LogSetInput {
  readonly exerciseId: ExerciseId
  readonly plannedSetId: Option.Option<PlannedSetId>
  readonly weightKg: number
  readonly reps: number
  readonly rpe: Option.Option<number>
}

export const DEFAULT_REST_SECONDS = 120

/** The owner's calendar date of `instant`, in the device zone (`DateTime.CurrentTimeZone`). */
export const localDateOf = (
  instant: DateTime.DateTime,
): Effect.Effect<LocalDate, never, DateTime.CurrentTimeZone> =>
  DateTime.setZoneCurrent(instant).pipe(
    Effect.map((zoned) => LocalDate.make(DateTime.formatIsoDate(zoned))),
  )

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
  /**
   * Exercises offered by swap / add exercise: live ones only, by name. Planned sets that point at a
   * tombstoned exercise still render on `today` (history and plan stay readable).
   */
  readonly exerciseChoices: Effect.Effect<ReadonlyArray<Exercise>, StoreError>
  /**
   * Puts an exercise on today's planned session: appends `ADDED_SET_COUNT` planned sets (Exact
   * `ADDED_SET_REPS` reps, no weight / RPE / rest / note) after the current max `order`, dirty.
   * `"added"` after the write, `"alreadyPlanned"` when a live planned set already has it (no
   * write), `"noSession"` when nothing is planned today (no write).
   */
  readonly addExercise: (exerciseId: ExerciseId) => Effect.Effect<AddExerciseResult, StoreError>
  /**
   * Finishes an open session (ADR-0018 decision 2026-10-26): `finishedAt` = now (never before
   * `startedAt`), `updatedAt` bumped, dirty for push. `None` and no write when the session is
   * unknown, deleted, already finished or has no live set. The next `logSet` opens a new session.
   */
  readonly finishSession: (
    sessionId: SessionId,
  ) => Effect.Effect<Option.Option<FinishedSession>, StoreError>
  /**
   * Auto-finish (ADR-0018, AUTO-FIN): every open session of this user whose last live set was
   * logged more than `STALE_SESSION_HOURS` before `now` is finished at that `loggedAt`; one with no
   * live set started that long ago is soft-deleted only if it was never pushed (`_dirty` = 1).
   * `updatedAt` bumped, dirty, one batch; no write (and no `StoreEvents` bump) when nothing is
   * stale. Returns how many sessions it changed. Called only by `SyncEngine` (after a complete
   * pull, and at `background` start), never from a Today read.
   */
  readonly finishStaleSessions: (now: DateTime.Utc) => Effect.Effect<number, StoreError>
}

/** An open session idle longer than this is closed by `finishStaleSessions`. */
export const STALE_SESSION_HOURS = 3

/** `TodayRepo.addExercise`'s answer; consumers match it exhaustively. */
export type AddExerciseResult = "added" | "alreadyPlanned" | "noSession"

export const ADDED_SET_COUNT = 3
export const ADDED_SET_REPS = 10

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

      /**
       * The open session for this planned session, or when `None` the unplanned one started on
       * today's local date (a planned session is already bound to its `scheduledDate`).
       */
      const openSession = (plannedSessionId: Option.Option<string>) =>
        Effect.gen(function* () {
          const latest = yield* latestOpenSession(plannedSessionId)
          const today = yield* localToday
          const started = yield* Effect.transposeOption(
            Option.map(latest, (session) => localDateOf(session.startedAt)),
          )
          return Option.isSome(plannedSessionId) || Option.exists(started, (d) => d === today)
            ? latest
            : Option.none<Session>()
        })

      /** Newest unfinished session for this planned session (unplanned when `None`), any date. */
      const latestOpenSession = (plannedSessionId: Option.Option<string>) =>
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
          // Tombstoned exercises included on purpose: a planned set keeps its name (plan integrity).
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
          return {
            plannedSession,
            exercises: todayExercises,
            session: Option.map(
              session,
              (open): OpenSession => ({
                session: open,
                setCount: logged.length,
              }),
            ),
          }
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

      const exerciseChoices = owner.pipe(
        Effect.flatMap((userId) =>
          store.all(
            q(
              `SELECT * FROM "exercise" WHERE "userId" = ? AND "deletedAt" IS NULL
               ORDER BY "name", "id"`,
              userId,
            ),
          ),
        ),
        Effect.flatMap(decodeRecords(ExerciseRow)),
      )

      /** Same lock as `logSet`: two quick adds must not both append or reuse an order. */
      const addExercise = (exerciseId: ExerciseId) =>
        logLock.withPermits(1)(
          withDeps(
            Effect.gen(function* () {
              const found = yield* plannedSessionToday
              if (Option.isNone(found)) {
                return "noSession" as const
              }
              const plannedSessionId = found.value.id
              const existing = yield* store.all(
                q(
                  `SELECT 1 FROM "planned_set"
                   WHERE "plannedSessionId" = ? AND "exerciseId" = ? AND "deletedAt" IS NULL LIMIT 1`,
                  plannedSessionId,
                  exerciseId,
                ),
              )
              if (Arr.isReadonlyArrayNonEmpty(existing)) {
                return "alreadyPlanned" as const
              }
              const now = yield* DateTime.now
              const userId = yield* owner
              // Tombstones count too: a revived order never collides with a synced row's.
              const first = nextOrder(
                yield* store.all(
                  q(
                    `SELECT COALESCE(MAX("order"), -1) + 1 AS "next" FROM "planned_set" WHERE "plannedSessionId" = ?`,
                    plannedSessionId,
                  ),
                ),
              )
              const sets = yield* Effect.forEach(Arr.range(0, ADDED_SET_COUNT - 1), (offset) =>
                newId(PlannedSetId).pipe(
                  Effect.flatMap((id) =>
                    PlannedSet.makeEffect({
                      id,
                      userId,
                      createdAt: now,
                      updatedAt: now,
                      deletedAt: Option.none(),
                      plannedSessionId,
                      exerciseId,
                      order: first + offset,
                      targetWeightKg: Option.none(),
                      targetReps: { _tag: "Exact", reps: Reps.make(ADDED_SET_REPS) },
                      targetRpe: Option.none(),
                      restSeconds: Option.none(),
                      note: Option.none(),
                    }),
                  ),
                  // Constant targets and a computed order: an invalid row is a store-side fault.
                  Effect.mapError((cause) => new StoreError({ cause })),
                ),
              )
              yield* store.write(
                sets.map((row): SyncChange => ({ table: "plannedSet", row })),
                { dirty: true },
              )
              return "added" as const
            }),
          ),
        )

      /** Same lock as `logSet`: a set logged mid-finish lands before the session closes. */
      const finishSession = (sessionId: SessionId) =>
        logLock.withPermits(1)(
          Effect.gen(function* () {
            const userId = yield* owner
            const found = Arr.head(
              yield* store
                .all(
                  q(
                    `SELECT * FROM "workout_session"
                     WHERE "id" = ? AND "userId" = ? AND "deletedAt" IS NULL AND "finishedAt" IS NULL`,
                    sessionId,
                    userId,
                  ),
                )
                .pipe(Effect.flatMap(decodeRecords(SessionRow))),
            )
            const sets = yield* loggedSets(Option.some(sessionId))
            const setCount = sets.length
            if (Option.isNone(found) || setCount === 0) {
              return Option.none<FinishedSession>()
            }
            const session = found.value
            const now = yield* DateTime.now
            // A device clock set back must not put the finish before the start or the last set,
            // nor lose LWW.
            const finishedAt = Arr.reduce(
              sets,
              DateTime.max(now, session.startedAt),
              (latest, set) => DateTime.max(latest, set.loggedAt),
            )
            const finished = yield* Session.makeEffect({
              ...session,
              finishedAt: Option.some(finishedAt),
              updatedAt: DateTime.max(now, DateTime.add(session.updatedAt, { milliseconds: 1 })),
            }).pipe(Effect.mapError((cause) => new StoreError({ cause })))
            yield* store.write([{ table: "session", row: finished }], { dirty: true })
            return Option.some<FinishedSession>({
              sessionId,
              setCount,
              durationSeconds: Math.floor(
                (DateTime.toEpochMillis(finishedAt) - DateTime.toEpochMillis(session.startedAt)) /
                  1000,
              ),
            })
          }),
        )

      /** Same lock as `logSet`: a set logged meanwhile is counted before the session closes. */
      const finishStaleSessions = (now: DateTime.Utc) =>
        logLock.withPermits(1)(
          Effect.gen(function* () {
            const userId = yield* owner
            const records = yield* store.all(
              q(
                `SELECT * FROM "workout_session"
                 WHERE "userId" = ? AND "deletedAt" IS NULL AND "finishedAt" IS NULL`,
                userId,
              ),
            )
            const open = yield* decodeRecords(SessionRow)(records)
            // Never-pushed rows (created here, server never acknowledged them) may be deleted.
            const unpushed = records.filter((r) => r._dirty === 1).map((r) => r.id)
            const cutoff = DateTime.subtract(now, { hours: STALE_SESSION_HOURS })
            const changes = yield* Effect.forEach(open, (session) =>
              loggedSets(Option.some(session.id)).pipe(
                Effect.flatMap((sets) =>
                  closeIfStale(session, sets, {
                    cutoff,
                    now,
                    deletable: Arr.contains(unpushed, session.id),
                  }),
                ),
              ),
            ).pipe(Effect.map(Arr.getSomes))
            if (Arr.isReadonlyArrayNonEmpty(changes)) {
              yield* store.write(
                changes.map((row): SyncChange => ({ table: "session", row })),
                { dirty: true },
              )
            }
            return changes.length
          }),
        )

      return TodayRepo.of({
        today,
        logSet,
        exerciseChoices,
        addExercise,
        finishSession,
        finishStaleSessions,
      })
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

/**
 * The closed row for an open session idle since before `cutoff`, else None: finished at its last
 * live set's `loggedAt` (never before `startedAt`), or, with no live set, soft-deleted at `now`
 * only when `deletable` (never pushed; a pulled empty session is left alone, REV-AF).
 * `updatedAt` is bumped as in `finishSession`.
 */
const closeIfStale = (
  session: Session,
  sets: ReadonlyArray<WorkoutSet>,
  {
    cutoff,
    now,
    deletable,
  }: { readonly cutoff: DateTime.Utc; readonly now: DateTime.Utc; readonly deletable: boolean },
): Effect.Effect<Option.Option<Session>, StoreError> => {
  const last = Arr.reduce(sets, Option.none<DateTime.Utc>(), (latest, set) =>
    Option.some(
      Option.match(latest, {
        onNone: () => set.loggedAt,
        onSome: (at) => DateTime.max(at, set.loggedAt),
      }),
    ),
  )
  const idleSince = Option.getOrElse(last, () => session.startedAt)
  if (!DateTime.isLessThan(idleSince, cutoff) || (Option.isNone(last) && !deletable)) {
    return Effect.succeed(Option.none())
  }
  const closed = Option.match(last, {
    onSome: (at) => ({ finishedAt: Option.some(DateTime.max(at, session.startedAt)) }),
    onNone: () => ({ deletedAt: Option.some(now) }),
  })
  return Session.makeEffect({
    ...session,
    ...closed,
    updatedAt: DateTime.max(now, DateTime.add(session.updatedAt, { milliseconds: 1 })),
  }).pipe(
    Effect.map(Option.some),
    Effect.mapError((cause) => new StoreError({ cause })),
  )
}

const nextOrder = (rows: ReadonlyArray<SqlRecord>): number =>
  pipe(
    Arr.head(rows),
    Option.flatMap((row) => Option.fromNullishOr(row.next)),
    Option.filter((value): value is number => typeof value === "number"),
    Option.getOrElse(() => 0),
  )
