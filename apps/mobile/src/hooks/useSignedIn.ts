import { Effect, Option, Stream } from "effect"
import { useEffect, useState } from "react"
import { CurrentUser } from "../services/CurrentUser"
import { runtime } from "../services/runtime"
import { runFailed } from "./runExit"

export type SignedInState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "SignedOut" }
  | { readonly _tag: "SignedIn" }

/**
 * Whether a user is signed in. Follows `CurrentUser.changes`: the value resolved when the runtime
 * was built, then every `refresh` (the native sign-in exchange, sign-out). On web the magic link's
 * redirect is a full page load, so the first value is already the new session. A failed run (the
 * program or the runtime build, seen in the exit) counts as signed out (the sign-in entry stays
 * reachable).
 */
export const useSignedIn = (): SignedInState => {
  const [state, setState] = useState<SignedInState>({ _tag: "Loading" })
  useEffect(() => {
    // `runCallback`, not `runFork`: a runtime BUILD failure (`DatabaseInUse` from a second tab,
    // `StoreError`) never reaches the program's `catchCause`; only the exit shows it (HOTFIX-2).
    const cancel = runtime.runCallback(
      CurrentUser.use((user) =>
        Stream.runForEach(user.changes, (userId) =>
          Effect.sync(() =>
            setState(Option.isSome(userId) ? { _tag: "SignedIn" } : { _tag: "SignedOut" }),
          ),
        ),
      ).pipe(Effect.catchCause(() => Effect.sync(() => setState({ _tag: "SignedOut" })))),
      {
        onExit: (exit) => {
          if (runFailed(exit)) {
            setState({ _tag: "SignedOut" })
          }
        },
      },
    )
    return () => {
      cancel()
    }
  }, [])
  return state
}
