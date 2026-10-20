import type { SessionStoreUnavailable, UserId } from "@tanren/shared"
import { Context, Effect, Layer, type Option } from "effect"

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
