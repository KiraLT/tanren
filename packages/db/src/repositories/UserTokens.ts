import { D1Client } from "@effect/sql-d1"
import { UserId } from "@tanren/shared"
import { Context, Data, DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlSchema } from "effect/sql"
import { type PersistenceError, persistenceError } from "../errors"

/** Internal: no `user` row for the id (a token for a deleted user). The worker maps it to `TokenRejected`. */
export class UserNotFound extends Data.TaggedError("UserNotFound")<{
  readonly userId: UserId
}> {}

/** `user.appTokenGen` / `user.mcpTokenGen` (migration 0006): the generation live tokens must carry. */
export interface TokenGens {
  readonly app: number
  readonly mcp: number
}

export interface UserTokensShape {
  readonly tokenGens: (userId: UserId) => Effect.Effect<TokenGens, UserNotFound | PersistenceError>
  /** `user.email`: shown on the native Strava connect interstitial (SEC-1c). Never log it. */
  readonly email: (userId: UserId) => Effect.Effect<string, UserNotFound | PersistenceError>
  /** `appTokenGen = appTokenGen + 1`: revokes every app access and refresh token of the user. */
  readonly bumpAppTokenGen: (userId: UserId) => Effect.Effect<void, UserNotFound | PersistenceError>
  /** `mcpTokenGen = mcpTokenGen + 1`: revokes every MCP access, refresh token and auth code. */
  readonly bumpMcpTokenGen: (userId: UserId) => Effect.Effect<void, UserNotFound | PersistenceError>
  /**
   * Burns a refresh token's `jti` in `refresh_token_burn` (migration 0010): `Burned` the first time,
   * `AlreadyBurned` with the first burn's `burnedAt` when the `jti` is in the ledger (a re-send).
   * One `INSERT … ON CONFLICT DO NOTHING RETURNING`, so two concurrent refreshes with one token never
   * both get `Burned`; only a conflict pays a second statement (the `burnedAt` read). `expiresAt` is
   * the row's retention: the caller passes the last instant the token can still verify.
   */
  readonly burnRefresh: (burn: RefreshBurn) => Effect.Effect<RefreshBurnOutcome, PersistenceError>
  /** Deletes every burned `jti` whose `expiresAt` is strictly before `now` (indexed). */
  readonly purgeBurnedRefresh: (now: DateTime.Utc) => Effect.Effect<void, PersistenceError>
}

export interface RefreshBurn {
  readonly userId: UserId
  readonly jti: string
  readonly expiresAt: DateTime.Utc
  readonly burnedAt: DateTime.Utc
}

/** `burnedAt` is None only when the row was purged between the insert and the read. */
export type RefreshBurnOutcome =
  | { readonly _tag: "Burned" }
  | { readonly _tag: "AlreadyBurned"; readonly burnedAt: Option.Option<DateTime.Utc> }

/** Outcome constructors, shared with the in-memory fakes of `burnRefresh`. */
export const BURNED: RefreshBurnOutcome = { _tag: "Burned" }
export const alreadyBurned = (burnedAt: Option.Option<DateTime.Utc>): RefreshBurnOutcome => ({
  _tag: "AlreadyBurned",
  burnedAt,
})

const Generations = Schema.Struct({ app: Schema.Number, mcp: Schema.Number })
const Updated = Schema.Struct({ id: UserId })

export class UserTokens extends Context.Service<UserTokens, UserTokensShape>()(
  "@tanren/UserTokens",
  {
    make: Effect.gen(function* () {
      const sql = yield* D1Client.D1Client

      const find = SqlSchema.findOneOption({
        Request: Schema.Struct({ userId: UserId }),
        Result: Generations,
        execute: ({ userId }) =>
          sql`SELECT "appTokenGen" AS app, "mcpTokenGen" AS mcp FROM "user" WHERE id = ${userId}`,
      })
      const findEmail = SqlSchema.findOneOption({
        Request: Schema.Struct({ userId: UserId }),
        Result: Schema.Struct({ email: Schema.String }),
        execute: ({ userId }) => sql`SELECT email FROM "user" WHERE id = ${userId}`,
      })
      const bumpApp = SqlSchema.findAll({
        Request: Schema.Struct({ userId: UserId }),
        Result: Updated,
        execute: ({ userId }) =>
          sql`UPDATE "user" SET "appTokenGen" = "appTokenGen" + 1 WHERE id = ${userId} RETURNING id`,
      })
      const bumpMcp = SqlSchema.findAll({
        Request: Schema.Struct({ userId: UserId }),
        Result: Updated,
        execute: ({ userId }) =>
          sql`UPDATE "user" SET "mcpTokenGen" = "mcpTokenGen" + 1 WHERE id = ${userId} RETURNING id`,
      })

      const insertBurn = SqlSchema.findAll({
        Request: Schema.Struct({
          jti: Schema.String,
          userId: UserId,
          expiresAtMs: Schema.Number,
          burnedAtMs: Schema.Number,
        }),
        Result: Schema.Struct({ jti: Schema.String }),
        execute: ({ jti, userId, expiresAtMs, burnedAtMs }) =>
          sql`INSERT INTO refresh_token_burn ("jti", "userId", "expiresAt", "burnedAt")
            VALUES (${jti}, ${userId}, ${expiresAtMs}, ${burnedAtMs})
            ON CONFLICT ("jti") DO NOTHING RETURNING "jti"`,
      })
      const findBurn = SqlSchema.findOneOption({
        Request: Schema.Struct({ jti: Schema.String }),
        Result: Schema.Struct({ burnedAt: Schema.Number }),
        execute: ({ jti }) => sql`SELECT "burnedAt" FROM refresh_token_burn WHERE "jti" = ${jti}`,
      })
      const deleteExpiredBurns = SqlSchema.void({
        Request: Schema.Struct({ nowMs: Schema.Number }),
        execute: ({ nowMs }) => sql`DELETE FROM refresh_token_burn WHERE "expiresAt" < ${nowMs}`,
      })

      const requireRow = (userId: UserId, rows: ReadonlyArray<unknown>) =>
        rows.length > 0 ? Effect.void : Effect.fail(new UserNotFound({ userId }))

      return {
        tokenGens: (userId) =>
          find({ userId }).pipe(
            Effect.mapError(persistenceError("userTokens.tokenGens")),
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.fail(new UserNotFound({ userId })),
                onSome: Effect.succeed,
              }),
            ),
          ),
        email: (userId) =>
          findEmail({ userId }).pipe(
            Effect.mapError(persistenceError("userTokens.email")),
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.fail(new UserNotFound({ userId })),
                onSome: (row) => Effect.succeed(row.email),
              }),
            ),
          ),
        bumpAppTokenGen: (userId) =>
          bumpApp({ userId }).pipe(
            Effect.mapError(persistenceError("userTokens.bumpAppTokenGen")),
            Effect.flatMap((rows) => requireRow(userId, rows)),
          ),
        bumpMcpTokenGen: (userId) =>
          bumpMcp({ userId }).pipe(
            Effect.mapError(persistenceError("userTokens.bumpMcpTokenGen")),
            Effect.flatMap((rows) => requireRow(userId, rows)),
          ),
        burnRefresh: ({ userId, jti, expiresAt, burnedAt }) =>
          insertBurn({
            jti,
            userId,
            expiresAtMs: DateTime.toEpochMillis(expiresAt),
            burnedAtMs: DateTime.toEpochMillis(burnedAt),
          }).pipe(
            Effect.flatMap((rows) =>
              rows.length > 0
                ? Effect.succeed(BURNED)
                : findBurn({ jti }).pipe(
                    Effect.map((row) =>
                      alreadyBurned(
                        Option.flatMap(row, ({ burnedAt }) =>
                          Option.map(DateTime.make(burnedAt), DateTime.toUtc),
                        ),
                      ),
                    ),
                  ),
            ),
            Effect.mapError(persistenceError("userTokens.burnRefresh")),
          ),
        purgeBurnedRefresh: (now) =>
          deleteExpiredBurns({ nowMs: DateTime.toEpochMillis(now) }).pipe(
            Effect.mapError(persistenceError("userTokens.purgeBurnedRefresh")),
          ),
      }
    }),
  },
) {
  /** Needs `D1Client` (`D1Layer(env.DB)`). */
  static readonly layer = Layer.effect(this, this.make)
}
