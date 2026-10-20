import type {
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  UserId,
  ValidationError,
} from "@tanren/shared"
import { Context, DateTime, Effect, Layer } from "effect"
import type { PersistenceError } from "../repos"
import { SyncStore } from "./SyncStore"

// The DM §10.2 push rules (LWW, clamp, per-change rejection) live in `@tanren/db`'s SyncStore.

export interface SyncShape {
  /** The store's `PushResponse`, unchanged. */
  readonly push: (
    userId: UserId,
    request: PushRequest,
  ) => Effect.Effect<PushResponse, PersistenceError>
  /** One page after `request.since`, stamped with the server time. */
  readonly pull: (
    userId: UserId,
    request: PullRequest,
  ) => Effect.Effect<PullResponse, PersistenceError | ValidationError>
}

export class Sync extends Context.Service<Sync, SyncShape>()("@tanren/worker/Sync", {
  make: Effect.gen(function* () {
    const store = yield* SyncStore
    const push = (userId: UserId, request: PushRequest) => store.apply(userId, request.changes)
    const pull = Effect.fn("Sync.pull")(function* (userId: UserId, request: PullRequest) {
      const now = yield* DateTime.now
      const page = yield* store.pull(userId, request.since, request.limit)
      return { ...page, serverTime: now }
    })
    return { push, pull }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
