import { type Cause, Exit, Match, Option } from "effect"
import type { AddExerciseResult } from "../services/TodayRepo"

/** What the detail screen shows next: a short muted notice, or the error. */
export type AddOutcome =
  | { readonly _tag: "Added" }
  | { readonly _tag: "AlreadyPlanned" }
  | { readonly _tag: "Failed"; readonly message: string }

export const ADD_LABEL = "Add to today's workout"
/** The Library's role (free-workout.md §7): the desktop aside's body before an exercise is picked. */
export const LIBRARY_ROLE =
  "The Library is the exercise catalog: browse every exercise by muscle group and equipment, see which ones your active location allows, read the illustration and instructions, and add an exercise to today's workout. Start a workout from Today, or add from here and Today picks it up."
export const ADDED_COPY = "Added"
export const ALREADY_PLANNED_COPY = "Already in today's workout"
/** How long a muted notice (`noticeCopy`) stays on screen. */
export const NOTICE_MS = 3000

/** `TodayRepo.addExercise`'s answer → outcome. */
const fromResult = (result: AddExerciseResult): AddOutcome =>
  Match.value(result).pipe(
    Match.when("added", (): AddOutcome => ({ _tag: "Added" })),
    Match.when("alreadyPlanned", (): AddOutcome => ({ _tag: "AlreadyPlanned" })),
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

/** The muted, self-dismissing line for an outcome; `None` for a failure (shown as a banner). */
export const noticeCopy = (outcome: AddOutcome): Option.Option<string> =>
  Match.valueTags(outcome, {
    Added: () => Option.some(ADDED_COPY),
    AlreadyPlanned: () => Option.some(ALREADY_PLANNED_COPY),
    Failed: () => Option.none(),
  })
