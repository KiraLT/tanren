import { D1Client } from "@effect/sql-d1"
import { UserId } from "@tanren/shared"
import { Context, Data, Effect, Layer, Option, Schema } from "effect"
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
  /** `appTokenGen = appTokenGen + 1`: revokes every app access and refresh token of the user. */
  readonly bumpAppTokenGen: (userId: UserId) => Effect.Effect<void, UserNotFound | PersistenceError>
  /** `mcpTokenGen = mcpTokenGen + 1`: revokes every MCP access, refresh token and auth code. */
  readonly bumpMcpTokenGen: (userId: UserId) => Effect.Effect<void, UserNotFound | PersistenceError>
}

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
      }
    }),
  },
) {
  /** Needs `D1Client` (`D1Layer(env.DB)`). */
  static readonly layer = Layer.effect(this, this.make)
}
