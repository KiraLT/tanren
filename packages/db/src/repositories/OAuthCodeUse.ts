import { D1Client } from "@effect/sql-d1"
import { Context, DateTime, Effect, Layer, Schema } from "effect"
import { SqlSchema } from "effect/sql"
import { type PersistenceError, persistenceError } from "../errors"

export interface OAuthCodeUseRepoShape {
  /**
   * Records that the authorization code `jti` was redeemed: `true` for the first call, `false` when
   * the `jti` is already in the ledger (replay). One `INSERT … ON CONFLICT DO NOTHING RETURNING`, so
   * two concurrent redemptions never both get `true`. `expiresAt` is the code's own expiry, after
   * which `purge` may drop the row.
   */
  readonly burn: (jti: string, expiresAt: DateTime.Utc) => Effect.Effect<boolean, PersistenceError>
  /** Deletes every row whose `expiresAt` is strictly before `now`. */
  readonly purge: (now: DateTime.Utc) => Effect.Effect<void, PersistenceError>
}

export class OAuthCodeUseRepo extends Context.Service<OAuthCodeUseRepo, OAuthCodeUseRepoShape>()(
  "@tanren/OAuthCodeUseRepo",
  {
    make: Effect.gen(function* () {
      const sql = yield* D1Client.D1Client

      const insert = SqlSchema.findAll({
        Request: Schema.Struct({ jti: Schema.String, expiresAtMs: Schema.Number }),
        Result: Schema.Struct({ jti: Schema.String }),
        execute: ({ jti, expiresAtMs }) =>
          sql`INSERT INTO oauth_code_use ("jti", "expiresAt") VALUES (${jti}, ${expiresAtMs})
            ON CONFLICT ("jti") DO NOTHING RETURNING "jti"`,
      })
      const deleteExpired = SqlSchema.void({
        Request: Schema.Struct({ nowMs: Schema.Number }),
        execute: ({ nowMs }) => sql`DELETE FROM oauth_code_use WHERE "expiresAt" < ${nowMs}`,
      })

      return {
        burn: (jti, expiresAt) =>
          insert({ jti, expiresAtMs: DateTime.toEpochMillis(expiresAt) }).pipe(
            Effect.map((rows) => rows.length > 0),
            Effect.mapError(persistenceError("oauthCodeUse.burn")),
          ),
        purge: (now) =>
          deleteExpired({ nowMs: DateTime.toEpochMillis(now) }).pipe(
            Effect.mapError(persistenceError("oauthCodeUse.purge")),
          ),
      }
    }),
  },
) {
  /** Needs `D1Client` (`D1Layer(env.DB)`). */
  static readonly layer = Layer.effect(this, this.make)
}
