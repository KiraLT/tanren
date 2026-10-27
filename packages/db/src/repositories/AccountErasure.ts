import { D1Client } from "@effect/sql-d1"
import type { UserId } from "@tanren/shared"
import { Context, Effect, Layer } from "effect"
import { type PersistenceError, persistenceError } from "../errors"

/**
 * Every table holding rows of one user, in delete order (children before the parents their foreign
 * keys point at). Domain tables key on `user_id`; Better Auth's `session` / `account` on `userId`;
 * `verification` has no user column and is matched through the user's email and session tokens;
 * `user` (incl. the ADR-0022 token generations) goes last. `oauth_code_use` holds no user data
 * (a `jti` + expiry) and is not listed. `AccountErasure.test.ts` checks this list against the
 * migrated schema, so a new table with a user column fails the test until it is added here.
 */
export const ERASED_TABLES = [
  "workout_set",
  "planned_set",
  "planned_session",
  "plan_week",
  "plan",
  "workout_session",
  "exercise",
  "program_day_completion",
  "program_enrollment",
  "program",
  "activity_export",
  "integration",
  "imported_activity",
  "daily_health",
  "food_entry",
  "profile",
  "sync_clock",
  "verification",
  "session",
  "account",
  "refresh_token_burn",
  "user",
] as const
export type ErasedTable = (typeof ERASED_TABLES)[number]

export interface AccountErasureShape {
  /**
   * Physically deletes every row of `userId` (ADR-0024, legal.md §1.7) in ONE D1 batch, so a
   * failure leaves the account whole. Erasing an unknown user is a no-op.
   */
  readonly deleteUser: (userId: UserId) => Effect.Effect<void, PersistenceError>
}

export class AccountErasure extends Context.Service<AccountErasure, AccountErasureShape>()(
  "@tanren/AccountErasure",
  {
    make: Effect.gen(function* () {
      const sql = yield* D1Client.D1Client
      return {
        deleteUser: (userId) =>
          sql
            .batch([
              sql`DELETE FROM workout_set WHERE user_id = ${userId}`,
              sql`DELETE FROM planned_set WHERE user_id = ${userId}`,
              sql`DELETE FROM planned_session WHERE user_id = ${userId}`,
              sql`DELETE FROM plan_week WHERE user_id = ${userId}`,
              sql`DELETE FROM plan WHERE user_id = ${userId}`,
              sql`DELETE FROM workout_session WHERE user_id = ${userId}`,
              sql`DELETE FROM exercise WHERE user_id = ${userId}`,
              sql`DELETE FROM program_day_completion WHERE user_id = ${userId}`,
              sql`DELETE FROM program_enrollment WHERE user_id = ${userId}`,
              // User programs (ADR-0026, migration 0009).
              sql`DELETE FROM program WHERE user_id = ${userId}`,
              sql`DELETE FROM activity_export WHERE user_id = ${userId}`,
              sql`DELETE FROM integration WHERE user_id = ${userId}`,
              // Garmin import (ADR-0023, migration 0007).
              sql`DELETE FROM imported_activity WHERE user_id = ${userId}`,
              sql`DELETE FROM daily_health WHERE user_id = ${userId}`,
              sql`DELETE FROM food_entry WHERE user_id = ${userId}`,
              sql`DELETE FROM profile WHERE user_id = ${userId}`,
              sql`DELETE FROM sync_clock WHERE user_id = ${userId}`,
              // Magic links store `{"type":"magic-link","email",…}`; one-time tokens store the
              // session token. Both need `user` and `session`, so they go before those rows. CASE
              // keeps json_extract off non-JSON values (SQLite does not short-circuit AND).
              sql`DELETE FROM verification WHERE lower(CASE WHEN json_valid(value) THEN json_extract(value, '$.email') END) = (SELECT lower(email) FROM "user" WHERE id = ${userId}) OR value IN (SELECT token FROM "session" WHERE "userId" = ${userId})`,
              sql`DELETE FROM "session" WHERE "userId" = ${userId}`,
              sql`DELETE FROM account WHERE "userId" = ${userId}`,
              // Refresh-token rotation ledger (STLS-F5, migration 0010).
              sql`DELETE FROM refresh_token_burn WHERE "userId" = ${userId}`,
              sql`DELETE FROM "user" WHERE id = ${userId}`,
            ])
            .pipe(Effect.asVoid, Effect.mapError(persistenceError("account.deleteUser"))),
      }
    }),
  },
) {
  /** Needs `D1Client` (`D1Layer(env.DB)`). */
  static readonly layer = Layer.effect(this, this.make)
}
