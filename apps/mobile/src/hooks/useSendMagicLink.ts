import { Cause, Exit, Option, Predicate } from "effect"
import * as Linking from "expo-linking"
import { useCallback, useState } from "react"
import { magicLinkFailureMessage, sendMagicLink, todayCallbackUrl } from "../services/magicLink"
import { runtime } from "../services/runtime"

export type MagicLinkState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Sending" }
  | { readonly _tag: "Sent" }
  | { readonly _tag: "Failed"; readonly message: string }

const GENERIC_FAILURE = "Something went wrong. Try again."

/** Absolute URL of `/today` in this app: the page origin on web, the Expo deep link on native. */
const callbackUrl = (): string =>
  todayCallbackUrl({
    isWeb: process.env.EXPO_OS === "web",
    origin: process.env.EXPO_OS === "web" ? window.location.origin : "",
    nativeUrl: Linking.createURL("/today"),
  })

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
