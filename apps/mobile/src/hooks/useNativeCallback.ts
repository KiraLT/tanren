import { Cause, Effect, Exit, Option, Predicate } from "effect"
import { useEffect, useRef, useState } from "react"
import { CurrentUser } from "../services/CurrentUser"
import {
  callbackFailure,
  NativeSession,
  nativeSignInFailureMessage,
} from "../services/NativeSession"
import { runtime } from "../services/runtime"
import { SyncEngine } from "../services/SyncEngine"

export type NativeCallbackState =
  | { readonly _tag: "Exchanging" }
  | { readonly _tag: "Done" }
  | { readonly _tag: "Failed"; readonly message: string }

export interface NativeCallbackParams {
  readonly code?: string | undefined
  readonly error?: string | undefined
}

const GENERIC_FAILURE = "Something went wrong. Request a new link."

/**
 * Exchange the code, publish the new user to `CurrentUser.changes`, move the local demo rows to
 * that user (the runtime's startup re-key already ran signed out), then ask for a sync.
 */
const finishSignIn = (code: string) =>
  NativeSession.use((session) => session.complete(code)).pipe(
    Effect.andThen(CurrentUser.use((user) => user.refresh)),
    Effect.tap(
      Option.match({
        onNone: () => Effect.void,
        onSome: (userId) => SyncEngine.use((engine) => engine.rekeyLocalUser(userId)),
      }),
    ),
    Effect.andThen(SyncEngine.use((engine) => engine.requestSync)),
    Effect.provide(NativeSession.layer),
  )

/**
 * Handles `/auth/callback?code=…` (or `?error=…`): `Exchanging`, then `Done` or `Failed`. The
 * exchange runs once per mount, even when React Strict Mode runs the effect twice (a second
 * exchange would find the code already used). `?error=link_invalid` never hits the network.
 */
export const useNativeCallback = (params: NativeCallbackParams): NativeCallbackState => {
  const [state, setState] = useState<NativeCallbackState>({ _tag: "Exchanging" })
  const started = useRef(false)
  const { code, error } = params
  useEffect(() => {
    if (started.current) {
      return
    }
    // biome-ignore lint/plugin/noMutation: React ref guard, not a data structure
    started.current = true
    const early = callbackFailure({ code, error })
    if (Option.isSome(early)) {
      setState({ _tag: "Failed", message: nativeSignInFailureMessage(early.value) })
      return
    }
    runtime.runPromiseExit(finishSignIn(code ?? "")).then((exit) => {
      setState(
        Exit.match(exit, {
          onFailure: (cause) => ({
            _tag: "Failed",
            message: Option.match(Cause.findErrorOption(cause), {
              onNone: () => GENERIC_FAILURE,
              onSome: (failure) =>
                Predicate.isTagged(failure, "NativeSignInFailed")
                  ? nativeSignInFailureMessage(failure.reason)
                  : GENERIC_FAILURE,
            }),
          }),
          onSuccess: () => ({ _tag: "Done" }),
        }),
      )
    })
  }, [code, error])
  return state
}
