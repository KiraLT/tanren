import { D1Client } from "@effect/sql-d1"
import {
  ExerciseId,
  type Forbidden,
  ROW_KEYS,
  ROW_TABLE,
  type Session,
  SessionId,
  SessionRow,
  Timestamp,
  UserId,
  type WorkoutSet,
  WorkoutSetRow,
} from "@tanren/shared"
import { Context, Effect, Layer, type Option, Schema } from "effect"
import { SqlSchema } from "effect/sql"
import { type PersistenceError, persistenceError } from "../errors"
import { makePut } from "../syncClock"

type Put<A> = (
  userId: UserId,
  rows: ReadonlyArray<A>,
) => Effect.Effect<void, PersistenceError | Forbidden>

export interface SessionRepoShape {
  /** The caller's session, tombstoned or not. */
  readonly getSession: (
    userId: UserId,
    id: SessionId,
  ) => Effect.Effect<Option.Option<Session>, PersistenceError>
  /** Live sessions with `from <= started_at < to`, oldest first by `(started_at, id)`. */
  readonly listSessions: (
    userId: UserId,
    range: { readonly from: Timestamp; readonly to: Timestamp },
  ) => Effect.Effect<ReadonlyArray<Session>, PersistenceError>
  /** Live sets of one session, by `(order, created_at, id)` (DM §11.2). */
  readonly listSets: (
    userId: UserId,
    sessionId: SessionId,
  ) => Effect.Effect<ReadonlyArray<WorkoutSet>, PersistenceError>
  /**
   * Live sets of live sessions with `from <= started_at < to`, in ONE statement, ordered by
   * `(session started_at, session id, order, created_at, id)`: oldest session first.
   */
  readonly listSetsInRange: (
    userId: UserId,
    range: { readonly from: Timestamp; readonly to: Timestamp },
  ) => Effect.Effect<ReadonlyArray<WorkoutSet>, PersistenceError>
  /**
   * Live sets of one exercise from the newest `limit` live sessions that contain a live set of it.
   * Newest session first (`started_at DESC, id DESC`), within a session `(order, created_at, id)`.
   */
  readonly listSetsForExercise: (
    userId: UserId,
    exerciseId: ExerciseId,
    limit: number,
  ) => Effect.Effect<ReadonlyArray<WorkoutSet>, PersistenceError>
  /**
   * The newest `limit` live sessions that contain a live set of one exercise, newest first
   * (`started_at DESC, id DESC`): the sessions `listSetsForExercise` draws from, in one statement.
   */
  readonly listSessionsForExercise: (
    userId: UserId,
    exerciseId: ExerciseId,
    limit: number,
  ) => Effect.Effect<ReadonlyArray<Session>, PersistenceError>
  /** Upserts, each in one batch (db.md §6). Write sessions before their sets: a set of a missing session or exercise (FK) aborts the batch. */
  readonly putSessions: Put<Session>
  readonly putSets: Put<WorkoutSet>
}

export class SessionRepo extends Context.Service<SessionRepo, SessionRepoShape>()(
  "@tanren/SessionRepo",
  {
    make: Effect.gen(function* () {
      const sql = yield* D1Client.D1Client

      const findSession = SqlSchema.findOneOption({
        Request: Schema.Struct({ userId: UserId, id: SessionId }),
        Result: SessionRow,
        execute: ({ userId, id }) =>
          sql`SELECT * FROM workout_session WHERE user_id = ${userId} AND id = ${id}`,
      })
      const findSessions = SqlSchema.findAll({
        Request: Schema.Struct({ userId: UserId, from: Timestamp, to: Timestamp }),
        Result: SessionRow,
        execute: ({ userId, from, to }) =>
          sql`SELECT * FROM workout_session
            WHERE user_id = ${userId} AND deleted_at IS NULL
              AND started_at >= ${from} AND started_at < ${to}
            ORDER BY started_at, id`,
      })
      const findSets = SqlSchema.findAll({
        Request: Schema.Struct({ userId: UserId, sessionId: SessionId }),
        Result: WorkoutSetRow,
        execute: ({ userId, sessionId }) =>
          sql`SELECT * FROM workout_set
            WHERE user_id = ${userId} AND session_id = ${sessionId} AND deleted_at IS NULL
            ORDER BY "order", created_at, id`,
      })
      const findSetsInRange = SqlSchema.findAll({
        Request: Schema.Struct({ userId: UserId, from: Timestamp, to: Timestamp }),
        Result: WorkoutSetRow,
        execute: ({ userId, from, to }) =>
          sql`SELECT s.* FROM workout_set s
            JOIN workout_session w ON s.session_id = w.id
            WHERE s.user_id = ${userId} AND w.user_id = ${userId}
              AND s.deleted_at IS NULL AND w.deleted_at IS NULL
              AND w.started_at >= ${from} AND w.started_at < ${to}
            ORDER BY w.started_at, w.id, s."order", s.created_at, s.id`,
      })
      const findSetsForExercise = SqlSchema.findAll({
        Request: Schema.Struct({ userId: UserId, exerciseId: ExerciseId, limit: Schema.Number }),
        Result: WorkoutSetRow,
        execute: ({ userId, exerciseId, limit }) =>
          sql`SELECT s.* FROM workout_set s
            JOIN workout_session w ON s.session_id = w.id
            WHERE s.user_id = ${userId} AND w.user_id = ${userId}
              AND s.deleted_at IS NULL AND w.deleted_at IS NULL
              AND s.exercise_id = ${exerciseId}
              AND w.id IN (
                SELECT w2.id FROM workout_session w2
                JOIN workout_set s2 ON s2.session_id = w2.id
                WHERE w2.user_id = ${userId} AND s2.user_id = ${userId}
                  AND w2.deleted_at IS NULL AND s2.deleted_at IS NULL
                  AND s2.exercise_id = ${exerciseId}
                GROUP BY w2.id
                ORDER BY w2.started_at DESC, w2.id DESC
                LIMIT ${limit})
            ORDER BY w.started_at DESC, w.id DESC, s."order", s.created_at, s.id`,
      })
      const findSessionsForExercise = SqlSchema.findAll({
        Request: Schema.Struct({ userId: UserId, exerciseId: ExerciseId, limit: Schema.Number }),
        Result: SessionRow,
        execute: ({ userId, exerciseId, limit }) =>
          sql`SELECT * FROM workout_session
            WHERE user_id = ${userId} AND deleted_at IS NULL
              AND id IN (
                SELECT w2.id FROM workout_session w2
                JOIN workout_set s2 ON s2.session_id = w2.id
                WHERE w2.user_id = ${userId} AND s2.user_id = ${userId}
                  AND w2.deleted_at IS NULL AND s2.deleted_at IS NULL
                  AND s2.exercise_id = ${exerciseId}
                GROUP BY w2.id
                ORDER BY w2.started_at DESC, w2.id DESC
                LIMIT ${limit})
            ORDER BY started_at DESC, id DESC`,
      })

      return {
        getSession: (userId, id) =>
          findSession({ userId, id }).pipe(Effect.mapError(persistenceError("session.get"))),
        listSessions: (userId, { from, to }) =>
          findSessions({ userId, from, to }).pipe(
            Effect.mapError(persistenceError("session.list")),
          ),
        listSets: (userId, sessionId) =>
          findSets({ userId, sessionId }).pipe(Effect.mapError(persistenceError("set.list"))),
        listSetsInRange: (userId, { from, to }) =>
          findSetsInRange({ userId, from, to }).pipe(
            Effect.mapError(persistenceError("set.listInRange")),
          ),
        listSetsForExercise: (userId, exerciseId, limit) =>
          findSetsForExercise({ userId, exerciseId, limit }).pipe(
            Effect.mapError(persistenceError("set.listForExercise")),
          ),
        listSessionsForExercise: (userId, exerciseId, limit) =>
          findSessionsForExercise({ userId, exerciseId, limit }).pipe(
            Effect.mapError(persistenceError("session.listForExercise")),
          ),
        putSessions: makePut(sql, "session", SessionRow, {
          table: ROW_TABLE.session,
          keys: ROW_KEYS.session,
          immutable: [],
        }),
        putSets: makePut(sql, "set", WorkoutSetRow, {
          table: ROW_TABLE.set,
          keys: ROW_KEYS.set,
          immutable: ["sessionId"],
        }),
      }
    }),
  },
) {
  /** Needs `D1Client` (`D1Layer(env.DB)`). */
  static readonly layer = Layer.effect(this, this.make)
}
