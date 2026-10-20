import { UserId } from "@tanren/shared"
import { Data, Effect, Layer, Option, Schema } from "effect"
import { BetterAuth } from "./BetterAuth"
import { Sessions } from "./Sessions"

/** Better Auth's `getSession` rejected. Internal: logged, then treated as signed out. */
class SessionLookupFailed extends Data.TaggedError("SessionLookupFailed")<{
  readonly cause: unknown
}> {}

/**
 * Better Auth: the session cookie (or bearer) in `headers` → its user's id. Kept out of the
 * `Sessions` port module so `Sessions.layerFixed` consumers never load better-auth.
 */
export const SessionsLive: Layer.Layer<Sessions, never, BetterAuth> = Layer.effect(
  Sessions,
  Effect.gen(function* () {
    const { auth } = yield* BetterAuth
    return Sessions.of({
      current: (headers) =>
        Effect.tryPromise({
          try: () => auth.api.getSession({ headers }),
          catch: (cause) => new SessionLookupFailed({ cause }),
        }).pipe(
          Effect.map(Option.fromNullishOr),
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.succeed(Option.none<UserId>()),
              onSome: ({ user }) =>
                Schema.decodeUnknownEffect(UserId)(user.id).pipe(Effect.map(Option.some)),
            }),
          ),
          Effect.catch((error) =>
            Effect.logWarning("session lookup failed; treating request as signed out", error).pipe(
              Effect.as(Option.none<UserId>()),
            ),
          ),
        ),
    })
  }),
)
