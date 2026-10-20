import { Effect, Fiber, Option, Stream } from "effect"
import { useEffect, useState } from "react"
import { CurrentUser } from "../services/CurrentUser"
import { runtime } from "../services/runtime"

export type SignedInState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "SignedOut" }
  | { readonly _tag: "SignedIn" }

/**
 * Whether a user is signed in. Follows `CurrentUser.changes`: the value resolved when the runtime
 * was built, then every `refresh` (the native sign-in exchange, sign-out). On web the magic link's
 * redirect is a full page load, so the first value is already the new session. A failed run counts
 * as signed out (the sign-in entry stays reachable).
 */
export const useSignedIn = (): SignedInState => {
  const [state, setState] = useState<SignedInState>({ _tag: "Loading" })
  useEffect(() => {
    const fiber = runtime.runFork(
      CurrentUser.use((user) =>
        Stream.runForEach(user.changes, (userId) =>
          Effect.sync(() =>
            setState(Option.isSome(userId) ? { _tag: "SignedIn" } : { _tag: "SignedOut" }),
          ),
        ),
      ).pipe(Effect.catchCause(() => Effect.sync(() => setState({ _tag: "SignedOut" })))),
    )
    return () => {
      runtime.runFork(Fiber.interrupt(fiber))
    }
  }, [])
  return state
}
