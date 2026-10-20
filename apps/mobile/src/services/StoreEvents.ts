import { Context, Effect, Layer, type Stream, SubscriptionRef } from "effect"

export interface StoreEventsShape {
  /** Bumped after every committed local-store write (local edits and sync applies). */
  readonly version: Effect.Effect<number>
  /** The current version, then every bump. */
  readonly changes: Stream.Stream<number>
  readonly bump: Effect.Effect<void>
}

/** Change notifier for the local store, so readers (hooks) refresh after any write. */
export class StoreEvents extends Context.Service<StoreEvents, StoreEventsShape>()(
  "@tanren/StoreEvents",
) {
  static readonly layer = Layer.effect(
    this,
    SubscriptionRef.make(0).pipe(
      Effect.map((ref) =>
        StoreEvents.of({
          version: SubscriptionRef.get(ref),
          changes: SubscriptionRef.changes(ref),
          bump: SubscriptionRef.update(ref, (n) => n + 1),
        }),
      ),
    ),
  )
}
