import type { CatalogId } from "@tanren/shared"
import { Effect } from "effect"
import { ExerciseLink } from "./ExerciseLink"
import type { StoreError } from "./SqlDriver"
import { type AddExerciseResult, TodayRepo } from "./TodayRepo"

/**
 * Links the catalog entry to a user exercise (reusing or creating it), then appends it to today's
 * planned session. Succeeds with `TodayRepo.addExercise`'s answer (added / alreadyPlanned /
 * noSession).
 */
export const addCatalogToToday = (
  catalogId: CatalogId,
): Effect.Effect<AddExerciseResult, StoreError, ExerciseLink | TodayRepo> =>
  ExerciseLink.use((link) => link.ensure(catalogId)).pipe(
    Effect.flatMap((exerciseId) => TodayRepo.use((repo) => repo.addExercise(exerciseId))),
  )
