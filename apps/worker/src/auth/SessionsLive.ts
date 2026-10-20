import { UserId } from "@tanren/shared"
import { Effect, Layer, Option, Schema } from "effect"
import { BetterAuth } from "./BetterAuth"
import { SessionStoreUnavailable, Sessions } from "./Sessions"

/**
 * Better Auth: the session cookie (or bearer) in `headers` → its user's id. Kept out of the
 * `Sessions` port module so `Sessions.layerFixed` consumers never load better-auth.
 * A missing or forged cookie resolves to none (Better Auth answers null); a rejected lookup is a
 * store outage and fails with `SessionStoreUnavailable` (503).
 */
export const SessionsLive: Layer.Layer<Sessions, never, BetterAuth> = Layer.effect(
  Sessions,
  Effect.gen(function* () {
    const betterAuth = yield* BetterAuth
    return Sessions.of({
      current: (headers) =>
        Effect.gen(function* () {
          const auth = yield* betterAuth.auth
          const session = yield* Effect.tryPromise(() => auth.api.getSession({ headers })).pipe(
            Effect.tapError((error) => Effect.logError("session lookup failed", error.cause)),
            Effect.mapError(
              () => new SessionStoreUnavailable({ message: "session store unavailable" }),
            ),
          )
          return yield* Option.match(Option.fromNullishOr(session), {
            onNone: () => Effect.succeed(Option.none<UserId>()),
            onSome: ({ user }) =>
              Schema.decodeUnknownEffect(UserId)(user.id).pipe(
                Effect.map(Option.some),
                // A non-UUID user id is not a user this API serves: signed out, but logged.
                Effect.catch((error) =>
                  Effect.logWarning("session user id is not a UserId", error).pipe(
                    Effect.as(Option.none<UserId>()),
                  ),
                ),
              ),
          })
        }),
    })
  }),
)
