import { type Cause, Exit } from "effect"

/** What the detail screen does next: open Today, show the no-session notice, or the error copy. */
export type AddOutcome =
  | { readonly _tag: "Added" }
  | { readonly _tag: "NoSession" }
  | { readonly _tag: "Failed"; readonly message: string }

export const NO_SESSION_TITLE = "No session planned today"

/** `addCatalogToToday`'s exit → outcome: true Added, false NoSession, failure Failed + copy. */
export const addOutcome = <E>(
  exit: Exit.Exit<boolean, E>,
  describe: (cause: Cause.Cause<E>) => string,
): AddOutcome =>
  Exit.match(exit, {
    onFailure: (cause): AddOutcome => ({ _tag: "Failed", message: describe(cause) }),
    onSuccess: (added): AddOutcome => (added ? { _tag: "Added" } : { _tag: "NoSession" }),
  })
