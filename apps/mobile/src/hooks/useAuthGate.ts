import type { UserId } from "@tanren/shared"
import { Effect, Option, Stream } from "effect"
import { useEffect, useState } from "react"
import { type GateDecision, gateFor } from "../services/authGate"
import { CurrentUser, gateAccount, localSetCount } from "../services/CurrentUser"
import { onDatabaseWait, runtime } from "../services/runtime"
import { runFailed } from "./runExit"

type GateState =
  | { readonly _tag: "Loading" }
  /** Web: another tab holds the database lock; the runtime build waits up to `LOCK_TIMEOUT`. */
  | { readonly _tag: "Waiting" }
  /** Runtime build or gate program failed (store error, second tab): screens show their own errors. */
  | { readonly _tag: "Failed" }
  | {
      readonly _tag: "Ready"
      readonly account: Option.Option<UserId>
      readonly localSets: number
    }

/**
 * The sign-in gate (ADR-0019) for `route`: `"loading"` until `CurrentUser` and the local store
 * answered (the layout renders no screen meanwhile), then `gateFor`. Follows `CurrentUser.changes`,
 * so the native sign-in exchange lifts the gate without a reload. A build failure shows only in the
 * exit, a program failure in `catchCause`; both → `Failed` → allow: the gate is about an absent
 * account, not about a broken store, and the screens show their own store error.
 * `"waiting"` (web): another tab holds the database lock, the layout shows the "open in another
 * tab" notice; the other tab closing lets the build finish (→ Ready), the timeout fails it (→ Failed).
 */
export const useAuthGate = (route: string): GateDecision | "loading" | "waiting" => {
  const [state, setState] = useState<GateState>({ _tag: "Loading" })
  useEffect(
    () =>
      onDatabaseWait(() =>
        setState((current) => (current._tag === "Loading" ? { _tag: "Waiting" } : current)),
      ),
    [],
  )
  useEffect(() => {
    // `runCallback`, not `runFork`: a runtime BUILD failure (`DatabaseInUse` from a second tab,
    // `StoreError`) never reaches the program's `catchCause`; it only shows in the exit, and
    // without this the gate stayed "loading" and the layout rendered nothing (HOTFIX-1).
    const cancel = runtime.runCallback(
      CurrentUser.use((user) =>
        Stream.runForEach(user.changes, (signedIn) =>
          Effect.gen(function* () {
            const account = yield* gateAccount(signedIn)
            // Sets only matter without an account: skip the read otherwise.
            const localSets = Option.isSome(account) ? 0 : yield* localSetCount
            yield* Effect.sync(() => setState({ _tag: "Ready", account, localSets }))
          }),
        ),
      ).pipe(Effect.catchCause(() => Effect.sync(() => setState({ _tag: "Failed" })))),
      {
        onExit: (exit) => {
          if (runFailed(exit)) {
            setState({ _tag: "Failed" })
          }
        },
      },
    )
    return () => {
      cancel()
    }
  }, [])
  if (state._tag === "Loading") {
    return "loading"
  }
  if (state._tag === "Waiting") {
    return "waiting"
  }
  if (state._tag === "Failed") {
    return "allow"
  }
  return gateFor({ account: state.account, localSets: state.localSets, route })
}
