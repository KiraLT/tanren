import type { Email } from "@tanren/shared"
import { Cause, Effect, Exit, Option, Predicate } from "effect"
import { useCallback, useEffect, useRef, useState } from "react"
import { Account } from "../services/Account"
import { CurrentUser } from "../services/CurrentUser"
import { runtime } from "../services/runtime"

export type AccountState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "SignedOut" }
  | { readonly _tag: "SignedIn"; readonly email: Email }
  /** The worker cannot be asked, but the store says someone is signed in. */
  | { readonly _tag: "SignedInOffline" }

export type SignOutState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "SigningOut" }
  | { readonly _tag: "Failed"; readonly reason: "offline" | "server" }
  /** Native only: the session is gone, the runtime still holds the old owner until a relaunch. */
  | { readonly _tag: "Done" }

const IS_WEB = process.env.EXPO_OS === "web"

/** The worker's answer, else (offline) what the local store knows: signed in or not. */
const loadAccount = Account.use((account) => account.session).pipe(
  Effect.map(
    Option.match({
      onNone: (): AccountState => ({ _tag: "SignedOut" }),
      onSome: ({ email }): AccountState => ({ _tag: "SignedIn", email }),
    }),
  ),
  Effect.catch(() =>
    CurrentUser.use((user) => user.signedIn).pipe(
      Effect.map(
        (signedIn): AccountState =>
          Option.isSome(signedIn) ? { _tag: "SignedInOffline" } : { _tag: "SignedOut" },
      ),
    ),
  ),
)

/**
 * Settings > Account: who is signed in (asked once on mount) and `signOut`. Web ends with a full
 * reload on Today (the runtime and `CurrentUser` rebuild); native ends in `Done` because the
 * runtime cannot be rebuilt in place. A failed sign-out changes nothing local.
 */
export const useAccount = (): {
  readonly account: AccountState
  readonly signOut: SignOutState
  readonly requestSignOut: () => void
} => {
  const [account, setAccount] = useState<AccountState>({ _tag: "Loading" })
  const [signOut, setSignOut] = useState<SignOutState>({ _tag: "Idle" })

  useEffect(() => {
    const controller = new AbortController()
    runtime.runPromiseExit(loadAccount, { signal: controller.signal }).then((exit) => {
      if (!controller.signal.aborted) {
        setAccount(Exit.isSuccess(exit) ? exit.value : { _tag: "SignedOut" })
      }
    })
    return () => controller.abort()
  }, [])

  // The sign-out request is not interrupted on unmount (it must finish or fail cleanly); only the
  // state updates after it are skipped once the screen is gone.
  const mounted = useRef(false)
  useEffect(() => {
    // biome-ignore lint/plugin/noMutation: React ref flag, not shared state
    mounted.current = true
    return () => {
      // biome-ignore lint/plugin/noMutation: React ref flag, not shared state
      mounted.current = false
    }
  }, [])

  const requestSignOut = useCallback(() => {
    setSignOut({ _tag: "SigningOut" })
    runtime.runPromiseExit(Account.use((current) => current.signOut)).then((exit) => {
      if (Exit.isSuccess(exit) && IS_WEB) {
        // The session is gone: reload even if the screen was left meanwhile.
        window.location.assign("/today")
        return
      }
      if (!mounted.current) {
        return
      }
      if (Exit.isSuccess(exit)) {
        setAccount({ _tag: "SignedOut" })
        setSignOut({ _tag: "Done" })
        return
      }
      const error = Cause.findErrorOption(exit.cause)
      setSignOut({
        _tag: "Failed",
        reason: Option.match(error, {
          onNone: () => "server",
          onSome: (failure) =>
            Predicate.isTagged(failure, "SignOutFailed") ? failure.reason : "server",
        }),
      })
    })
  }, [])

  return { account, signOut, requestSignOut }
}
