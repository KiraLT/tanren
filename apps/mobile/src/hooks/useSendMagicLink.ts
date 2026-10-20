import { Cause, Effect, Exit, Option, Predicate } from "effect"
import { useCallback, useState } from "react"
import {
  magicLinkFailureMessage,
  SIGN_IN_WEB_ONLY_NOTICE,
  sendMagicLink,
  signInSupported,
  todayCallbackUrl,
} from "../services/magicLink"
import { NativeSession, nativeSignInFailureMessage } from "../services/NativeSession"
import { runtime } from "../services/runtime"

/** True on web (cookie) and on iOS / Android (one-time code deep link, see `NativeSession`). */
export const SIGN_IN_SUPPORTED = signInSupported(process.env.EXPO_OS ?? "")

export { SIGN_IN_WEB_ONLY_NOTICE }

const IS_WEB = process.env.EXPO_OS === "web"

export type MagicLinkState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Sending" }
  | { readonly _tag: "Sent"; readonly hint: string }
  | { readonly _tag: "Failed"; readonly message: string }

const GENERIC_FAILURE = "Something went wrong. Try again."

/** Shown after the link was requested: where to open it. */
const SENT_HINT = IS_WEB ? "Open the link on this device." : "Open the link on this iPhone."

/**
 * Web: the callbackURL is `<origin>/today`. Native: `NativeSession.begin` stores a fresh PKCE
 * verifier and returns the worker's `/auth/native/complete?challenge=…&returnTo=…` callbackURL.
 */
const requestLink = (email: string) =>
  IS_WEB
    ? sendMagicLink(email, todayCallbackUrl(window.location.origin))
    : NativeSession.use((session) => session.begin).pipe(
        Effect.flatMap((callbackURL) => sendMagicLink(email, callbackURL)),
        Effect.provide(NativeSession.layer),
      )

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
    runtime.runPromiseExit(requestLink(email)).then((exit) => {
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
                  : Predicate.isTagged(error, "NativeSignInFailed")
                    ? nativeSignInFailureMessage(error.reason)
                    : GENERIC_FAILURE,
            }),
          }),
          onSuccess: () => ({ _tag: "Sent", hint: SENT_HINT }),
        }),
      )
    })
  }, [])
  return { state, send }
}
