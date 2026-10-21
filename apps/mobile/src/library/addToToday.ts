import { type Cause, Exit, Match, Option } from "effect"
import type { AddExerciseResult } from "../services/TodayRepo"

/** What the detail screen shows next: a short muted notice, the no-session banner, or the error. */
export type AddOutcome =
  | { readonly _tag: "Added" }
  | { readonly _tag: "AlreadyPlanned" }
  | { readonly _tag: "NoSession" }
  | { readonly _tag: "Failed"; readonly message: string }

export const NO_SESSION_TITLE = "No session planned today"
export const ADDED_COPY = "Added"
export const ALREADY_PLANNED_COPY = "Already in today's session"
/** How long a muted notice (`noticeCopy`) stays on screen. */
export const NOTICE_MS = 3000

/** `TodayRepo.addExercise`'s answer → outcome. */
const fromResult = (result: AddExerciseResult): AddOutcome =>
  Match.value(result).pipe(
    Match.when("added", (): AddOutcome => ({ _tag: "Added" })),
    Match.when("alreadyPlanned", (): AddOutcome => ({ _tag: "AlreadyPlanned" })),
    Match.when("noSession", (): AddOutcome => ({ _tag: "NoSession" })),
    Match.exhaustive,
  )

/** `addCatalogToToday`'s exit → outcome; a failure or defect carries the described copy. */
export const addOutcome = <E>(
  exit: Exit.Exit<AddExerciseResult, E>,
  describe: (cause: Cause.Cause<E>) => string,
): AddOutcome =>
  Exit.match(exit, {
    onFailure: (cause): AddOutcome => ({ _tag: "Failed", message: describe(cause) }),
    onSuccess: fromResult,
  })

/** The muted, self-dismissing line for an outcome; `None` for the ones shown as a banner. */
export const noticeCopy = (outcome: AddOutcome): Option.Option<string> =>
  Match.valueTags(outcome, {
    Added: () => Option.some(ADDED_COPY),
    AlreadyPlanned: () => Option.some(ALREADY_PLANNED_COPY),
    NoSession: () => Option.none(),
    Failed: () => Option.none(),
  })
