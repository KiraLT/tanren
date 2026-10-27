import { Cause, Effect, Exit, Option, Predicate } from "effect"
import { useCallback, useState } from "react"
import { DELETE_ACCOUNT_REQUEST } from "../components/settings/settingsCopy"
import { AccountErasure } from "../services/AccountErasure"
import { runtime } from "../services/runtime"
import { useConfirm } from "../ui"

export type EraseState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Working" }
  | { readonly _tag: "Failed"; readonly reason: "offline" | "server" | "local" }

/**
 * Settings → Data → Delete account. `request` asks through the confirm dialog, then runs the
 * erasure (server, then the local wipe and the native tokens); on success `onErased` runs (the
 * screen navigates to sign-in).
 */
export const useAccountErasure = (
  onErased: () => void,
): {
  readonly state: EraseState
  readonly request: () => void
} => {
  const [state, setState] = useState<EraseState>({ _tag: "Idle" })
  const confirm = useConfirm()
  const erase = useCallback(() => {
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
  const request = useCallback(() => {
    confirm(DELETE_ACCOUNT_REQUEST).then((ok) => ok && erase())
  }, [confirm, erase])
  return { state, request }
}
