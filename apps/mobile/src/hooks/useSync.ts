import { Cause, Effect, Exit, Fiber, Option } from "effect"
import { useCallback, useEffect, useState } from "react"
import { runtime } from "../services/runtime"
import type { StoreError } from "../services/SqlDriver"
import { SyncEngine, type SyncSummary } from "../services/SyncEngine"
import type { TransportError } from "../services/SyncTransport"

export type SyncStatus = "idle" | "syncing" | "offline" | "error"

/** Unreachable server → "offline"; anything else (401, bad body, store failure) → "error". */
export const statusOfFailure = (cause: Cause.Cause<TransportError | StoreError>): SyncStatus =>
  Option.match(Cause.findErrorOption(cause), {
    onNone: () => "error",
    onSome: (error) =>
      error._tag === "TransportError" && error.reason === "unreachable" ? "offline" : "error",
  })

/**
 * Background sync: runs `SyncEngine.background` for the life of the mount (a sync now, then every
 * `SYNC_INTERVAL` or `PUSH_DEBOUNCE` after a `requestSync`, which `useLogSet` sends after every
 * logged set). `syncNow()` is the same request. A sync already running elsewhere (another caller
 * of the engine) makes a round a no-op; only unmount interrupts.
 */
export const useSync = (): {
  readonly status: SyncStatus
  readonly lastSyncedAt: Option.Option<string>
  readonly syncNow: () => void
} => {
  const [status, setStatus] = useState<SyncStatus>("idle")
  const [lastSyncedAt, setLastSyncedAt] = useState<Option.Option<string>>(Option.none())
  const syncNow = useCallback(() => {
    runtime.runFork(SyncEngine.use((engine) => engine.requestSync))
  }, [])

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
    const fiber = runtime.runFork(
      SyncEngine.use((engine) =>
        engine.background({
          started: Effect.sync(() => setStatus("syncing")),
          finished: (exit) => Effect.sync(() => report(exit)),
        }),
      ),
    )
    return () => {
      runtime.runFork(Fiber.interrupt(fiber))
    }
  }, [])

  return { status, lastSyncedAt, syncNow }
}
