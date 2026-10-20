import type { UserId } from "@tanren/shared"
import { Context, Effect, Layer, type Option, Schema } from "effect"

/**
 * The session store could not be asked (D1 down, Better Auth rejected). Any route behind
 * `Authentication` can answer it, so it is part of the API contract: 503, not 500 and not 401
 * (a signed-in client must not drop its session over an outage).
 * INTEGRATION: move to @tanren/shared
 */
export class SessionStoreUnavailable extends Schema.TaggedError<SessionStoreUnavailable>()(
  "SessionStoreUnavailable",
  { message: Schema.String },
  { httpApiStatus: 503 },
) {}

export interface SessionsShape {
  /** The signed-in user for these request headers, or none; fails only when the store is down. */
  readonly current: (
    headers: globalThis.Headers,
  ) => Effect.Effect<Option.Option<UserId>, SessionStoreUnavailable>
}

export class Sessions extends Context.Service<Sessions, SessionsShape>()(
  "@tanren/worker/Sessions",
) {
  /** Tests and local dev: every request resolves to the same user (or nobody). */
  static readonly layerFixed = (userId: Option.Option<UserId>): Layer.Layer<Sessions> =>
    Layer.succeed(Sessions, Sessions.of({ current: () => Effect.succeed(userId) }))
}
