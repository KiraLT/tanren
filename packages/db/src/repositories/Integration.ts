import { D1Client } from "@effect/sql-d1"
import { Provider, Timestamp, UserId, Uuid } from "@tanren/shared"
import { Context, Effect, Layer, type Option, Schema } from "effect"
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
  /** Both rotated tokens and the expiry in ONE update (the old refresh token dies at once). */
  readonly setTokens: (id: Uuid, tokens: IntegrationTokens) => Effect.Effect<void, PersistenceError>
  readonly markRevoked: (id: Uuid, updatedAt: Timestamp) => Effect.Effect<void, PersistenceError>
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
              expires_at = ${r.expiresAt}, updated_at = ${r.updatedAt}
            WHERE id = ${r.id}`,
      })
      const revoke = SqlSchema.void({
        Request: Schema.Struct({ id: Uuid, updatedAt: Timestamp }),
        execute: ({ id, updatedAt }) =>
          sql`UPDATE integration SET status = 'revoked', updated_at = ${updatedAt} WHERE id = ${id}`,
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
        markRevoked: (id, updatedAt) =>
          revoke({ id, updatedAt }).pipe(
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
