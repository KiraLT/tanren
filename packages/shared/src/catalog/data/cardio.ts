import type { CatalogExerciseSpec } from "../CatalogExercise"

/**
 * Scope: machines + locomotion, kind "distance" or "timed" (about 14)
 * Id rule: kebab-case canonical name; prefix the implement when a movement exists with several
 * (`barbell-`, `dumbbell-`, `cable-`, `machine-`, `smith-`); bodyweight unprefixed.
 */
export const cardio: ReadonlyArray<CatalogExerciseSpec> = []
