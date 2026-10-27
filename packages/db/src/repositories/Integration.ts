import { D1Client } from "@effect/sql-d1"
import { Provider, Timestamp, UserId, Uuid } from "@tanren/shared"
import { Context, DateTime, Effect, Layer, type Option, Schema } from "effect"
import { SqlSchema } from "effect/sql"
import { type PersistenceError, persistenceError } from "../errors"

/** A token sealed by the worker's `TokenSeal` (`v1.<iv>.<ciphertext>`); never plaintext. */
export const SealedToken = Schema.String.pipe(Schema.brand("SealedToken"))
export type SealedToken = typeof SealedToken.Type

/** `revoked` = the provider rejected the tokens; an upsert (reconnect) sets it back to `active`. */
export const IntegrationRowStatus = Schema.Literals(["active", "revoked"])
export type IntegrationRowStatus = typeof IntegrationRowStatus.Type

/** One `integration` row (db-internal; the wire shape is `ProviderStatus`). */
export const IntegrationRow = Schema.Struct({
  id: Uuid,
  userId: UserId,
  provider: Provider,
  status: IntegrationRowStatus,
  externalId: Schema.String,
  displayName: Schema.String,
  accessToken: SealedToken,
  refreshToken: SealedToken,
  expiresAt: Timestamp,
  scope: Schema.String,
  createdAt: Timestamp,
  updatedAt: Timestamp,
})
export type IntegrationRow = typeof IntegrationRow.Type

export interface IntegrationTokens {
  readonly access: SealedToken
  readonly refresh: SealedToken
  readonly expiresAt: Timestamp
  readonly updatedAt: Timestamp
}

export interface IntegrationRepoShape {
  readonly get: (
    userId: UserId,
    provider: Provider,
  ) => Effect.Effect<Option.Option<IntegrationRow>, PersistenceError>
  /** Insert, or on `(user_id, provider)` replace everything but `id` and `created_at`. */
  readonly upsert: (row: IntegrationRow) => Effect.Effect<void, PersistenceError>
  /**
   * Both rotated tokens and the expiry in ONE update (the old refresh token dies at once); it also
   * releases the refresh lease (`refreshing_until = NULL`).
   */
  readonly setTokens: (id: Uuid, tokens: IntegrationTokens) => Effect.Effect<void, PersistenceError>
  /**
   * Claims the token-refresh lease until `until` with one guarded `UPDATE … RETURNING`: it succeeds
   * (`true`) only when the lease is free or expired (`refreshing_until IS NULL OR < now`) AND the row
   * is still the version the caller read (`updated_at = seenUpdatedAt`, so a drain holding tokens
   * another drain already rotated never refreshes them again). Two callers never both get `true`.
   */
  readonly claimRefresh: (
    id: Uuid,
    seenUpdatedAt: Timestamp,
    now: Timestamp,
    until: Timestamp,
  ) => Effect.Effect<boolean, PersistenceError>
  /** Frees the refresh lease after a refresh that stored nothing (refused or failed). */
  readonly releaseRefresh: (id: Uuid) => Effect.Effect<void, PersistenceError>
  /**
   * Revokes only the row version the caller saw (`updated_at = seenUpdatedAt`): a row whose tokens
   * another drain rotated meanwhile is left alone (no-op).
   */
  readonly markRevoked: (
    id: Uuid,
    seenUpdatedAt: Timestamp,
    updatedAt: Timestamp,
  ) => Effect.Effect<void, PersistenceError>
  /** Deletes the integration and that user's exports of the provider in one batch. */
  readonly remove: (userId: UserId, provider: Provider) => Effect.Effect<void, PersistenceError>
}

export class IntegrationRepo extends Context.Service<IntegrationRepo, IntegrationRepoShape>()(
  "@tanren/IntegrationRepo",
  {
    make: Effect.gen(function* () {
      const sql = yield* D1Client.D1Client

      const find = SqlSchema.findOneOption({
        Request: Schema.Struct({ userId: UserId, provider: Provider }),
        Result: IntegrationRow,
        execute: ({ userId, provider }) =>
          sql`SELECT * FROM integration WHERE user_id = ${userId} AND provider = ${provider}`,
      })
      const upsertRow = SqlSchema.void({
        Request: IntegrationRow,
        execute: (r) =>
          sql`INSERT INTO integration
              (id, user_id, provider, status, external_id, display_name, access_token,
               refresh_token, expires_at, scope, created_at, updated_at)
            VALUES (${r.id}, ${r.userId}, ${r.provider}, ${r.status}, ${r.externalId},
              ${r.displayName}, ${r.accessToken}, ${r.refreshToken}, ${r.expiresAt}, ${r.scope},
              ${r.createdAt}, ${r.updatedAt})
            ON CONFLICT (user_id, provider) DO UPDATE SET
              status = excluded.status, external_id = excluded.external_id,
              display_name = excluded.display_name, access_token = excluded.access_token,
              refresh_token = excluded.refresh_token, expires_at = excluded.expires_at,
              scope = excluded.scope, updated_at = excluded.updated_at`,
      })
      const updateTokens = SqlSchema.void({
        Request: Schema.Struct({
          id: Uuid,
          access: SealedToken,
          refresh: SealedToken,
          expiresAt: Timestamp,
          updatedAt: Timestamp,
        }),
        execute: (r) =>
          sql`UPDATE integration SET access_token = ${r.access}, refresh_token = ${r.refresh},
              expires_at = ${r.expiresAt}, updated_at = ${r.updatedAt}, refreshing_until = NULL
            WHERE id = ${r.id}`,
      })
      const claim = SqlSchema.findAll({
        Request: Schema.Struct({
          id: Uuid,
          seenUpdatedAt: Timestamp,
          nowMs: Schema.Number,
          untilMs: Schema.Number,
        }),
        Result: Schema.Struct({ id: Uuid }),
        execute: ({ id, seenUpdatedAt, nowMs, untilMs }) =>
          sql`UPDATE integration SET refreshing_until = ${untilMs}
            WHERE id = ${id} AND updated_at = ${seenUpdatedAt}
              AND (refreshing_until IS NULL OR refreshing_until < ${nowMs})
            RETURNING id`,
      })
      const release = SqlSchema.void({
        Request: Schema.Struct({ id: Uuid }),
        execute: ({ id }) => sql`UPDATE integration SET refreshing_until = NULL WHERE id = ${id}`,
      })
      const revoke = SqlSchema.void({
        Request: Schema.Struct({ id: Uuid, seenUpdatedAt: Timestamp, updatedAt: Timestamp }),
        execute: ({ id, seenUpdatedAt, updatedAt }) =>
          sql`UPDATE integration SET status = 'revoked', updated_at = ${updatedAt}
            WHERE id = ${id} AND updated_at = ${seenUpdatedAt}`,
      })

      return {
        get: (userId, provider) =>
          find({ userId, provider }).pipe(Effect.mapError(persistenceError("integration.get"))),
        upsert: (row) =>
          upsertRow(row).pipe(Effect.mapError(persistenceError("integration.upsert"))),
        setTokens: (id, tokens) =>
          updateTokens({ id, ...tokens }).pipe(
            Effect.mapError(persistenceError("integration.setTokens")),
          ),
        claimRefresh: (id, seenUpdatedAt, now, until) =>
          claim({
            id,
            seenUpdatedAt,
            nowMs: DateTime.toEpochMillis(now),
            untilMs: DateTime.toEpochMillis(until),
          }).pipe(
            Effect.map((rows) => rows.length > 0),
            Effect.mapError(persistenceError("integration.claimRefresh")),
          ),
        releaseRefresh: (id) =>
          release({ id }).pipe(Effect.mapError(persistenceError("integration.releaseRefresh"))),
        markRevoked: (id, seenUpdatedAt, updatedAt) =>
          revoke({ id, seenUpdatedAt, updatedAt }).pipe(
            Effect.mapError(persistenceError("integration.markRevoked")),
          ),
        remove: (userId, provider) =>
          sql
            .batch([
              sql`DELETE FROM activity_export WHERE user_id = ${userId} AND provider = ${provider}`,
              sql`DELETE FROM integration WHERE user_id = ${userId} AND provider = ${provider}`,
            ])
            .pipe(Effect.asVoid, Effect.mapError(persistenceError("integration.remove"))),
      }
    }),
  },
) {
  /** Needs `D1Client` (`D1Layer(env.DB)`). */
  static readonly layer = Layer.effect(this, this.make)
}
