import { Schema } from "effect"
import { Timestamp } from "./common"

/**
 * The stateless app login pair (ADR-0022): a 15-minute access JWT and a 30-day refresh JWT, both
 * HS256 and bound to `user.appTokenGen`. `expiresAt` is the access token's expiry. The shape is
 * pure: signing and verifying live in `apps/worker/src/auth/Tokens.ts`.
 */
export const AppTokenPair = Schema.Struct({
  accessToken: Schema.NonEmptyString,
  refreshToken: Schema.NonEmptyString,
  expiresAt: Timestamp,
})
export type AppTokenPair = typeof AppTokenPair.Type

/** Body of the app refresh endpoint: trade a refresh token for a fresh pair. */
export const RefreshRequest = Schema.Struct({ refreshToken: Schema.NonEmptyString })
export type RefreshRequest = typeof RefreshRequest.Type

/**
 * 401 from token verification or refresh. `expired` = past `exp` (refresh and retry), `revoked` =
 * the token's generation is stale (sign in again), `invalid` = bad signature, audience, issuer or
 * claims.
 */
export class TokenRejected extends Schema.TaggedError<TokenRejected>()(
  "TokenRejected",
  { reason: Schema.Literals(["expired", "revoked", "invalid"]) },
  { httpApiStatus: 401 },
) {}
