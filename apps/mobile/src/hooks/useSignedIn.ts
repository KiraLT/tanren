import { Effect, Exit, Option } from "effect"
import { useEffect, useState } from "react"
import { CurrentUser } from "../services/CurrentUser"
import { runtime } from "../services/runtime"

export type SignedInState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "SignedOut" }
  | { readonly _tag: "SignedIn" }

/**
 * Whether a user is signed in. `CurrentUser.signedIn` is resolved once when the runtime is built,
 * so after a magic link redirects to `/today` the full page load picks the new session up. A
 * failed run counts as signed out (the sign-in entry stays reachable).
 */
export const useSignedIn = (): SignedInState => {
  const [state, setState] = useState<SignedInState>({ _tag: "Loading" })
  useEffect(() => {
    const controller = new AbortController()
    runtime
      .runPromiseExit(CurrentUser.use((user) => user.signedIn).pipe(Effect.map(Option.isSome)), {
        signal: controller.signal,
      })
      .then((exit) => {
        if (controller.signal.aborted) {
          return
        }
        setState(Exit.isSuccess(exit) && exit.value ? { _tag: "SignedIn" } : { _tag: "SignedOut" })
      })
    return () => controller.abort()
  }, [])
  return state
}
