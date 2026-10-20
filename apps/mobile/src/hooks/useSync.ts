import { Cause, Effect, Exit, Fiber, Option, Queue } from "effect"
import { useCallback, useEffect, useState } from "react"
import { runtime } from "../services/runtime"
import type { StoreError } from "../services/SqlDriver"
import { SyncEngine, type SyncSummary } from "../services/SyncEngine"
import type { TransportError } from "../services/SyncTransport"

export type SyncStatus = "idle" | "syncing" | "offline" | "error"

export const SYNC_INTERVAL_MS = 60_000

/** Unreachable server → "offline"; anything else (401, bad body, store failure) → "error". */
export const statusOfFailure = (cause: Cause.Cause<TransportError | StoreError>): SyncStatus =>
  Option.match(Cause.findErrorOption(cause), {
    onNone: () => "error",
    onSome: (error) =>
      error._tag === "TransportError" && error.reason === "unreachable" ? "offline" : "error",
  })

/**
 * Background sync: one loop per mount runs a sync, then waits for the interval (~60 s) or a
 * `syncNow()`. Triggers that arrive while a sync runs collapse into one re-run (a sliding queue of
 * one); nothing is interrupted except on unmount. A sync already running elsewhere (another
 * caller of the engine) makes this round a no-op.
 */
export const useSync = (): {
  readonly status: SyncStatus
  readonly lastSyncedAt: Option.Option<string>
  readonly syncNow: () => void
} => {
  const [status, setStatus] = useState<SyncStatus>("idle")
  const [lastSyncedAt, setLastSyncedAt] = useState<Option.Option<string>>(Option.none())
  // Needs no services, so it is created synchronously with the plain Effect runner.
  const [wake] = useState(() => Effect.runSync(Queue.sliding<void>(1)))
  const syncNow = useCallback(() => {
    Queue.offerUnsafe(wake, undefined)
  }, [wake])

  useEffect(() => {
    const report = (exit: Exit.Exit<Option.Option<SyncSummary>, TransportError | StoreError>) =>
      Exit.match(exit, {
        onFailure: (cause) => setStatus(statusOfFailure(cause)),
        onSuccess: (summary) => {
          setLastSyncedAt((previous) =>
            Option.orElse(
              Option.map(summary, ({ serverTime }) => serverTime),
              () => previous,
            ),
          )
          setStatus("idle")
        },
      })
    const round = Effect.sync(() => setStatus("syncing")).pipe(
      Effect.andThen(Effect.exit(SyncEngine.use((engine) => engine.syncOnceExclusive))),
      Effect.flatMap((exit) => Effect.sync(() => report(exit))),
      Effect.andThen(Effect.race(Queue.take(wake), Effect.sleep(SYNC_INTERVAL_MS))),
    )
    const fiber = runtime.runFork(Effect.forever(round))
    return () => {
      runtime.runFork(Fiber.interrupt(fiber))
    }
  }, [wake])

  return { status, lastSyncedAt, syncNow }
}
