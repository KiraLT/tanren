import type { CatalogId } from "@tanren/shared"
import { type Cause, Effect, Exit } from "effect"
import { ExerciseLink } from "../services/ExerciseLink"
import type { StoreError } from "../services/SqlDriver"
import { TodayRepo } from "../services/TodayRepo"

/**
 * Links the catalog entry to a user exercise (reusing or creating it), then appends it to today's
 * planned session. Succeeds with `TodayRepo.addExercise`'s answer: `false` = no session planned.
 */
export const addCatalogToToday = (
  catalogId: CatalogId,
): Effect.Effect<boolean, StoreError, ExerciseLink | TodayRepo> =>
  ExerciseLink.use((link) => link.ensure(catalogId)).pipe(
    Effect.flatMap((exerciseId) => TodayRepo.use((repo) => repo.addExercise(exerciseId))),
  )

/** What the detail screen does next: open Today, show the no-session notice, or the error copy. */
export type AddOutcome =
  | { readonly _tag: "Added" }
  | { readonly _tag: "NoSession" }
  | { readonly _tag: "Failed"; readonly message: string }

export const NO_SESSION_TITLE = "No session planned today"

export const addOutcome = <E>(
  exit: Exit.Exit<boolean, E>,
  describe: (cause: Cause.Cause<E>) => string,
): AddOutcome =>
  Exit.match(exit, {
    onFailure: (cause): AddOutcome => ({ _tag: "Failed", message: describe(cause) }),
    onSuccess: (added): AddOutcome => (added ? { _tag: "Added" } : { _tag: "NoSession" }),
  })
