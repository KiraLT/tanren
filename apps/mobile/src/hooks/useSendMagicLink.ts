import { Cause, Exit, Option, Predicate } from "effect"
import { useCallback, useState } from "react"
import {
  magicLinkFailureMessage,
  SIGN_IN_WEB_ONLY_NOTICE,
  sendMagicLink,
  signInSupported,
  todayCallbackUrl,
} from "../services/magicLink"
import { runtime } from "../services/runtime"

/** False on native: sign-in is web-only in v1 (see `signInSupported`). */
export const SIGN_IN_SUPPORTED = signInSupported(process.env.EXPO_OS ?? "")

export { SIGN_IN_WEB_ONLY_NOTICE }

export type MagicLinkState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Sending" }
  | { readonly _tag: "Sent" }
  | { readonly _tag: "Failed"; readonly message: string }

const GENERIC_FAILURE = "Something went wrong. Try again."

/** Absolute URL of `/today` on the web page origin (only called where sign-in is supported). */
const callbackUrl = (): string => todayCallbackUrl(window.location.origin)

/**
 * Requests a magic link for an email. The promise-free `send` moves the state Idle, Sending, then
 * Sent or Failed; the link itself arrives by email (locally it is printed in the wrangler log).
 */
export const useSendMagicLink = (): {
  readonly state: MagicLinkState
  readonly send: (email: string) => void
} => {
  const [state, setState] = useState<MagicLinkState>({ _tag: "Idle" })
  const send = useCallback((email: string) => {
    if (!SIGN_IN_SUPPORTED) {
      setState({ _tag: "Failed", message: SIGN_IN_WEB_ONLY_NOTICE })
      return
    }
    setState({ _tag: "Sending" })
    runtime.runPromiseExit(sendMagicLink(email, callbackUrl())).then((exit) => {
      setState(
        Exit.match(exit, {
          // The cause also carries runtime-build failures (store errors): only ours is explained.
          onFailure: (cause) => ({
            _tag: "Failed",
            message: Option.match(Cause.findErrorOption(cause), {
              onNone: () => GENERIC_FAILURE,
              onSome: (error) =>
                Predicate.isTagged(error, "MagicLinkFailed")
                  ? magicLinkFailureMessage(error)
                  : GENERIC_FAILURE,
            }),
          }),
          onSuccess: () => ({ _tag: "Sent" }),
        }),
      )
    })
  }, [])
  return { state, send }
}
