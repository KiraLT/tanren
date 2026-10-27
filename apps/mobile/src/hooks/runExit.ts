import { Cause, Exit } from "effect"

/**
 * Whether a hook's `runtime.runCallback` run failed: a runtime BUILD failure (`DatabaseInUse` from a
 * second tab, `StoreError`) never reaches the program's `catchCause` and shows only here. An
 * interrupt-only exit is the hook's own cleanup (`cancel()` on unmount), not a failure.
 */
export const runFailed = <A, E>(exit: Exit.Exit<A, E>): boolean =>
  Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)
