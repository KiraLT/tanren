import type { CatalogExerciseSpec } from "../CatalogExercise"

/**
 * Scope: stretches, mobility drills, warm-ups, kind "timed" (about 18)
 * Id rule: kebab-case canonical name; prefix the implement when a movement exists with several
 * (`barbell-`, `dumbbell-`, `cable-`, `machine-`, `smith-`); bodyweight unprefixed.
 */
export const mobility: ReadonlyArray<CatalogExerciseSpec> = []
