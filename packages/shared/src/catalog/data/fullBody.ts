import type { CatalogExerciseSpec } from "../CatalogExercise"

/**
 * Scope: kettlebell, olympic derivatives, carries, landmine, sled (about 22)
 * Id rule: kebab-case canonical name; prefix the implement when a movement exists with several
 * (`barbell-`, `dumbbell-`, `cable-`, `machine-`, `smith-`); bodyweight unprefixed.
 */
export const fullBody: ReadonlyArray<CatalogExerciseSpec> = []
