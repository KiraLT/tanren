import type { UserId } from "@tanren/shared"
import { Effect, Fiber, Option, Stream } from "effect"
import { useEffect, useState } from "react"
import { type GateDecision, gateFor } from "../services/authGate"
import { CurrentUser, gateAccount, localSetCount } from "../services/CurrentUser"
import { runtime } from "../services/runtime"

type GateState =
  | { readonly _tag: "Loading" }
  /** The runtime could not be built (store error, second tab): the screens show their own errors. */
  | { readonly _tag: "Failed" }
  | {
      readonly _tag: "Ready"
      readonly account: Option.Option<UserId>
      readonly localSets: number
    }

/**
 * The sign-in gate (ADR-0019) for `route`: `"loading"` until `CurrentUser` and the local store
 * answered (the layout renders no screen meanwhile), then `gateFor`. Follows `CurrentUser.changes`,
 * so the native sign-in exchange lifts the gate without a reload. A failed runtime allows: the
 * gate is about an absent account, not about a broken store.
 */
export const useAuthGate = (route: string): GateDecision | "loading" => {
  const [state, setState] = useState<GateState>({ _tag: "Loading" })
  useEffect(() => {
    const fiber = runtime.runFork(
      CurrentUser.use((user) =>
        Stream.runForEach(user.changes, (signedIn) =>
          Effect.gen(function* () {
            const account = yield* gateAccount(signedIn)
            // Sets only matter without an account: skip the read otherwise.
            const localSets = Option.isSome(account) ? 0 : yield* localSetCount
            yield* Effect.sync(() => setState({ _tag: "Ready", account, localSets }))
          }),
        ),
      ).pipe(Effect.catchCause(() => Effect.sync(() => setState({ _tag: "Failed" })))),
    )
    return () => {
      runtime.runFork(Fiber.interrupt(fiber))
    }
  }, [])
  if (state._tag === "Loading") {
    return "loading"
  }
  if (state._tag === "Failed") {
    return "allow"
  }
  return gateFor({ account: state.account, localSets: state.localSets, route })
}
