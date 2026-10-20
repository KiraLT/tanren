import { D1Client } from "@effect/sql-d1"
import {
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

      return {
        getSession: (userId, id) =>
          findSession({ userId, id }).pipe(Effect.mapError(persistenceError("session.get"))),
        listSessions: (userId, { from, to }) =>
          findSessions({ userId, from, to }).pipe(
            Effect.mapError(persistenceError("session.list")),
          ),
        listSets: (userId, sessionId) =>
          findSets({ userId, sessionId }).pipe(Effect.mapError(persistenceError("set.list"))),
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
