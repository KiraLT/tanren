import { D1Client } from "@effect/sql-d1"
import {
  ActivityExportId,
  ExportFailureReason,
  ExportStatus,
  Provider,
  SessionId,
  Timestamp,
  UserId,
} from "@tanren/shared"
import { Array as Arr, Context, DateTime, Effect, Layer, Match, Option, Schema } from "effect"
import { SqlSchema } from "effect/sql"
import { type PersistenceError, persistenceError } from "../errors"

const Count = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))

/** One `activity_export` row (db-internal; the wire shape is `ActivityExport`). */
export const ExportRow = Schema.Struct({
  id: ActivityExportId,
  userId: UserId,
  provider: Provider,
  sessionId: SessionId,
  status: ExportStatus,
  attempts: Count,
  nextAttemptAt: Timestamp,
  externalActivityId: Schema.OptionFromNullOr(Schema.String),
  lastError: Schema.OptionFromNullOr(ExportFailureReason),
  createdAt: Timestamp,
  updatedAt: Timestamp,
})
export type ExportRow = typeof ExportRow.Type

/** A fresh `pending` row: `attempts` 0, due at `nextAttemptAt`, `updatedAt` = `createdAt`. */
export const NewExport = Schema.Struct({
  id: ActivityExportId,
  userId: UserId,
  provider: Provider,
  sessionId: SessionId,
  nextAttemptAt: Timestamp,
  createdAt: Timestamp,
})
export type NewExport = typeof NewExport.Type

/** How one attempt ended; `now` becomes `updated_at`. Every outcome counts one attempt. */
export const ExportOutcome = Schema.Union([
  Schema.TaggedStruct("Sent", { externalActivityId: Schema.String, now: Timestamp }),
  Schema.TaggedStruct("Failed", { reason: ExportFailureReason, now: Timestamp }),
  Schema.TaggedStruct("Dead", { reason: ExportFailureReason, now: Timestamp }),
  Schema.TaggedStruct("Pending", {
    reason: ExportFailureReason,
    nextAttemptAt: Timestamp,
    now: Timestamp,
  }),
  /** The provider app is inactive: parked as `blocked`, due again at `nextAttemptAt`. */
  Schema.TaggedStruct("Blocked", {
    reason: ExportFailureReason,
    nextAttemptAt: Timestamp,
    now: Timestamp,
  }),
])
export type ExportOutcome = typeof ExportOutcome.Type

/** `pending` counts pending + running; `failed` counts failed + dead; `blocked` counts blocked. */
export interface ExportCounts {
  readonly pending: number
  readonly failed: number
  readonly blocked: number
  readonly lastSentAt: Option.Option<DateTime.Utc>
}

export interface ActivityExportRepoShape {
  /** `INSERT OR IGNORE` on the unique (user, provider, session) key, one batch; `[]` runs nothing. */
  readonly enqueue: (rows: ReadonlyArray<NewExport>) => Effect.Effect<void, PersistenceError>
  /**
   * Claims up to `max` due rows: `pending` or `blocked` with `next_attempt_at <= now`, or `running` whose
   * `updated_at` is older than 10 minutes (a crashed drain). Each is claimed by a guarded
   * `UPDATE … RETURNING` and kept only when it returns a row, so two callers never share one.
   */
  readonly claimDue: (
    now: DateTime.Utc,
    opts: { readonly userId: Option.Option<UserId>; readonly max: number },
  ) => Effect.Effect<ReadonlyArray<ExportRow>, PersistenceError>
  readonly settle: (
    id: ActivityExportId,
    outcome: ExportOutcome,
  ) => Effect.Effect<void, PersistenceError>
  /** Newest first (`created_at DESC, id DESC`). */
  readonly list: (
    userId: UserId,
    provider: Provider,
    limit: number,
  ) => Effect.Effect<ReadonlyArray<ExportRow>, PersistenceError>
  /** `false` = not found, not the caller's, or not `failed | dead | blocked`. Resets `attempts` to 0. */
  readonly resetToPending: (
    userId: UserId,
    id: ActivityExportId,
    now: DateTime.Utc,
  ) => Effect.Effect<boolean, PersistenceError>
  /** One statement. */
  readonly counts: (
    userId: UserId,
    provider: Provider,
  ) => Effect.Effect<ExportCounts, PersistenceError>
}

const STALE_RUNNING = { minutes: 10 } as const

export class ActivityExportRepo extends Context.Service<
  ActivityExportRepo,
  ActivityExportRepoShape
>()("@tanren/ActivityExportRepo", {
  make: Effect.gen(function* () {
    const sql = yield* D1Client.D1Client

    const insertIgnore = Schema.encodeEffect(Schema.Array(NewExport))

    const findDue = SqlSchema.findAll({
      Request: Schema.Struct({
        now: Timestamp,
        cutoff: Timestamp,
        userId: Schema.OptionFromNullOr(UserId),
        max: Count,
      }),
      Result: ExportRow,
      execute: ({ now, cutoff, userId, max }) =>
        sql`SELECT * FROM activity_export
          WHERE (${userId} IS NULL OR user_id = ${userId})
            AND ((status IN ('pending', 'blocked') AND next_attempt_at <= ${now})
              OR (status = 'running' AND updated_at < ${cutoff}))
          ORDER BY next_attempt_at, id
          LIMIT ${max}`,
    })
    // Guarded on status AND the `updated_at` that was read: a stale `running` row stays `running`
    // when reclaimed, so only the bumped `updated_at` tells the loser of a race it lost.
    const claim = SqlSchema.findOneOption({
      Request: Schema.Struct({
        id: ActivityExportId,
        status: ExportStatus,
        updatedAt: Timestamp,
        now: Timestamp,
      }),
      Result: ExportRow,
      execute: ({ id, status, updatedAt, now }) =>
        sql`UPDATE activity_export SET status = 'running', updated_at = ${now}
          WHERE id = ${id} AND status = ${status} AND updated_at = ${updatedAt}
          RETURNING *`,
    })
    const update = SqlSchema.void({
      Request: Schema.Struct({
        id: ActivityExportId,
        status: ExportStatus,
        externalActivityId: Schema.OptionFromNullOr(Schema.String),
        lastError: Schema.OptionFromNullOr(ExportFailureReason),
        nextAttemptAt: Schema.OptionFromNullOr(Timestamp),
        now: Timestamp,
      }),
      execute: (r) =>
        sql`UPDATE activity_export SET status = ${r.status}, attempts = attempts + 1,
            external_activity_id = COALESCE(${r.externalActivityId}, external_activity_id),
            last_error = ${r.lastError},
            next_attempt_at = COALESCE(${r.nextAttemptAt}, next_attempt_at),
            updated_at = ${r.now}
          WHERE id = ${r.id}`,
    })
    const findRecent = SqlSchema.findAll({
      Request: Schema.Struct({ userId: UserId, provider: Provider, limit: Count }),
      Result: ExportRow,
      execute: ({ userId, provider, limit }) =>
        sql`SELECT * FROM activity_export WHERE user_id = ${userId} AND provider = ${provider}
          ORDER BY created_at DESC, id DESC LIMIT ${limit}`,
    })
    const reset = SqlSchema.findOneOption({
      Request: Schema.Struct({ userId: UserId, id: ActivityExportId, now: Timestamp }),
      Result: Schema.Struct({ id: ActivityExportId }),
      execute: ({ userId, id, now }) =>
        sql`UPDATE activity_export
          SET status = 'pending', attempts = 0, next_attempt_at = ${now}, updated_at = ${now}
          WHERE user_id = ${userId} AND id = ${id} AND status IN ('failed', 'dead', 'blocked')
          RETURNING id`,
    })
    const tally = SqlSchema.findOne({
      Request: Schema.Struct({ userId: UserId, provider: Provider }),
      Result: Schema.Struct({
        pending: Count,
        failed: Count,
        blocked: Count,
        lastSentAt: Schema.OptionFromNullOr(Timestamp),
      }),
      execute: ({ userId, provider }) =>
        sql`SELECT
            COUNT(CASE WHEN status IN ('pending', 'running') THEN 1 END) AS pending,
            COUNT(CASE WHEN status IN ('failed', 'dead') THEN 1 END) AS failed,
            COUNT(CASE WHEN status = 'blocked' THEN 1 END) AS blocked,
            MAX(CASE WHEN status = 'sent' THEN updated_at END) AS last_sent_at
          FROM activity_export WHERE user_id = ${userId} AND provider = ${provider}`,
    })

    const flatten = (outcome: ExportOutcome) =>
      Match.value(outcome).pipe(
        Match.tagsExhaustive({
          Sent: ({ externalActivityId, now }) => ({
            status: "sent" as const,
            externalActivityId: Option.some(externalActivityId),
            lastError: Option.none<ExportFailureReason>(),
            nextAttemptAt: Option.none<Timestamp>(),
            now,
          }),
          Failed: ({ reason, now }) => ({
            status: "failed" as const,
            externalActivityId: Option.none<string>(),
            lastError: Option.some(reason),
            nextAttemptAt: Option.none<Timestamp>(),
            now,
          }),
          Dead: ({ reason, now }) => ({
            status: "dead" as const,
            externalActivityId: Option.none<string>(),
            lastError: Option.some(reason),
            nextAttemptAt: Option.none<Timestamp>(),
            now,
          }),
          Pending: ({ reason, nextAttemptAt, now }) => ({
            status: "pending" as const,
            externalActivityId: Option.none<string>(),
            lastError: Option.some(reason),
            nextAttemptAt: Option.some(nextAttemptAt),
            now,
          }),
          Blocked: ({ reason, nextAttemptAt, now }) => ({
            status: "blocked" as const,
            externalActivityId: Option.none<string>(),
            lastError: Option.some(reason),
            nextAttemptAt: Option.some(nextAttemptAt),
            now,
          }),
        }),
      )

    return {
      enqueue: (rows) =>
        Effect.gen(function* () {
          const records = yield* insertIgnore(rows)
          yield* sql.batch(
            records.map(
              (r) =>
                sql`INSERT OR IGNORE INTO activity_export
                  (id, user_id, provider, session_id, status, attempts, next_attempt_at,
                   created_at, updated_at)
                VALUES (${r.id}, ${r.userId}, ${r.provider}, ${r.sessionId}, 'pending', 0,
                  ${r.nextAttemptAt}, ${r.createdAt}, ${r.createdAt})`,
            ),
          )
        }).pipe(Effect.mapError(persistenceError("activityExport.enqueue"))),
      claimDue: (now, { userId, max }) =>
        Effect.gen(function* () {
          const due = yield* findDue({
            now,
            cutoff: DateTime.subtract(now, STALE_RUNNING),
            userId,
            max,
          })
          const claimed = yield* Effect.forEach(due, (row) =>
            claim({ id: row.id, status: row.status, updatedAt: row.updatedAt, now }),
          )
          return Arr.getSomes(claimed)
        }).pipe(Effect.mapError(persistenceError("activityExport.claimDue"))),
      settle: (id, outcome) =>
        update({ id, ...flatten(outcome) }).pipe(
          Effect.mapError(persistenceError("activityExport.settle")),
        ),
      list: (userId, provider, limit) =>
        findRecent({ userId, provider, limit }).pipe(
          Effect.mapError(persistenceError("activityExport.list")),
        ),
      resetToPending: (userId, id, now) =>
        reset({ userId, id, now }).pipe(
          Effect.map(Option.isSome),
          Effect.mapError(persistenceError("activityExport.resetToPending")),
        ),
      counts: (userId, provider) =>
        tally({ userId, provider }).pipe(
          Effect.mapError(persistenceError("activityExport.counts")),
        ),
    }
  }),
}) {
  /** Needs `D1Client` (`D1Layer(env.DB)`). */
  static readonly layer = Layer.effect(this, this.make)
}
