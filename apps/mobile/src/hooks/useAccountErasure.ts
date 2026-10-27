import { Cause, Effect, Exit, Option, Predicate } from "effect"
import { useCallback, useState } from "react"
import { AccountErasure } from "../services/AccountErasure"
import { runtime } from "../services/runtime"

export type EraseState =
  | { readonly _tag: "Idle" }
  /** The inline confirm is open. */
  | { readonly _tag: "Confirming" }
  | { readonly _tag: "Working" }
  | { readonly _tag: "Failed"; readonly reason: "offline" | "server" | "local" }

/**
 * Settings → Data → Delete account. `confirm` runs the erasure (server, then the local wipe and
 * the native tokens); on success `onErased` runs (the screen navigates to sign-in).
 */
export const useAccountErasure = (
  onErased: () => void,
): {
  readonly state: EraseState
  readonly open: () => void
  readonly cancel: () => void
  readonly confirm: () => void
} => {
  const [state, setState] = useState<EraseState>({ _tag: "Idle" })
  const open = useCallback(() => setState({ _tag: "Confirming" }), [])
  const cancel = useCallback(() => setState({ _tag: "Idle" }), [])
  const confirm = useCallback(() => {
    setState({ _tag: "Working" })
    runtime
      .runPromiseExit(
        AccountErasure.use((service) => service.erase).pipe(Effect.provide(AccountErasure.layer)),
      )
      .then((exit) => {
        if (Exit.isSuccess(exit)) {
          onErased()
          return
        }
        setState({
          _tag: "Failed",
          reason: Option.match(Cause.findErrorOption(exit.cause), {
            onNone: () => "server",
            onSome: (failure) =>
              Predicate.isTagged(failure, "AccountEraseFailed") ? failure.reason : "server",
          }),
        })
      })
  }, [onErased])
  return { state, open, cancel, confirm }
}
