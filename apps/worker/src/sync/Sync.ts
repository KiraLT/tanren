import type {
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  RejectedChange,
  SyncChange,
  SyncTable,
  UserId,
  ValidationError,
} from "@tanren/shared"
import { Array as Arr, Context, DateTime, Effect, Layer, Option, Result } from "effect"
import { completedSessionIds, ExportQueue } from "../integrations/ExportQueue"
import type { PersistenceError } from "../repos"
import { SyncStore } from "./SyncStore"

/** The most a push waits to queue its completed sessions; a cut-off enqueue is logged. */
export const ENQUEUE_BUDGET = "2 seconds"
/**
 * The push's drain budget (design §6): 5 s, plus at most the one attempt already in flight, which
 * runs uninterruptibly to its end (each Strava call, request and body, ≤ `STRAVA_REQUEST_TIMEOUT`
 * = 10 s). Worst case about 2 + 5 + 40 s (the 401 path makes up to 4 Strava calls). The cron drain
 * picks up whatever is left.
 */
export const EXPORT_BUDGET = "5 seconds"

// The DM §10.2 push rules (LWW, clamp, per-change rejection) live in `@tanren/db`'s SyncStore.

/**
 * Tables only the Worker writes (garmin.md §2, ADR-0023): a client change on them is rejected
 * `forbidden` here, before `SyncStore.apply`, so the Worker's own writes through the store pass.
 */
const PULL_ONLY: ReadonlySet<SyncTable> = new Set<SyncTable>(["importedActivity", "dailyHealth"])

const forbidden = (change: SyncChange): RejectedChange => ({
  table: change.table,
  id: change.row.id,
  reason: "forbidden",
  message: `${change.table} is imported by the server and cannot be pushed`,
})

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
    const exports = yield* ExportQueue
    /**
     * Design §6: a session this push completed is exported within the push. The export never fails
     * the push; it waits at most `ENQUEUE_BUDGET` + `EXPORT_BUDGET` (+ an in-flight attempt); the
     * response is the store's, unchanged.
     */
    const push = Effect.fn("Sync.push")(function* (userId: UserId, request: PushRequest) {
      const [changes, pullOnly] = Arr.partition(request.changes, (change) =>
        PULL_ONLY.has(change.table) ? Result.fail(change) : Result.succeed(change),
      )
      const applied = yield* store.apply(userId, changes)
      const result: PushResponse = {
        ...applied,
        rejected: [...applied.rejected, ...Arr.map(pullOnly, forbidden)],
      }
      if (completedSessionIds(changes, result.accepted).length > 0) {
        yield* exports.enqueueCompleted(userId, changes, result.accepted).pipe(
          Effect.timeout(ENQUEUE_BUDGET),
          Effect.catchCause((cause) =>
            Effect.logWarning("[export] enqueue cut off: session not queued", cause),
          ),
        )
        yield* exports.drain({ userId: Option.some(userId), max: 1 }).pipe(
          Effect.timeout(EXPORT_BUDGET),
          Effect.catchCause((cause) =>
            Effect.logWarning("[export] push drain cut off: cron retries", cause),
          ),
        )
      }
      return result
    })
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
