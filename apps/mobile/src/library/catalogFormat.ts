import {
  type CatalogEquipment,
  CatalogEquipment as CatalogEquipmentSchema,
  type CatalogExercise,
  ExerciseKind,
  type Location,
  MuscleGroup,
  missingEquipment,
} from "@tanren/shared"
import { Array as Arr, Option, Schema } from "effect"

/** `"upperBack"` → `"Upper back"`, `"smithMachine"` → `"Smith machine"`. */
export const humanize = (key: string): string => {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Value of the "All" segment; never a facet value (all facet values are non-empty). */
export const ALL = ""

export interface FacetOption {
  readonly value: string
  readonly label: string
}

/** Keys whose gym spelling `humanize` cannot derive. */
const SPELLED: Readonly<Record<string, string>> = {
  ezBar: "EZ bar",
  pullUpBar: "Pull-up bar",
  assistedPullUpMachine: "Assisted pull-up machine",
  gluteHamDeveloper: "Glute-ham developer",
}

/** The chip / detail label of a taxonomy key. */
export const facetLabel = (key: string): string => SPELLED[key] ?? humanize(key)

/** The Library's leading location chip, e.g. "At Home". */
export const atLocationLabel = (location: Pick<Location, "name">): string => `At ${location.name}`

/**
 * Detail line for an entry the active location cannot do, e.g. "Needs: Leg press"; `None` when no
 * location is active or nothing is missing (bodyweight never is).
 */
export const needsLine = (
  entry: Pick<CatalogExercise, "equipment">,
  active: Option.Option<Location>,
): Option.Option<string> =>
  Option.flatMap(active, (location) => {
    const missing = missingEquipment(entry, location)
    return Arr.isReadonlyArrayNonEmpty(missing)
      ? Option.some(`Needs: ${missing.map(facetLabel).join(", ")}`)
      : Option.none()
  })

const facetOptions = (values: ReadonlyArray<string>): ReadonlyArray<FacetOption> => [
  { value: ALL, label: "All" },
  ...values.map((value) => ({ value, label: facetLabel(value) })),
]

export const MUSCLE_OPTIONS = facetOptions(MuscleGroup.literals)
export const EQUIPMENT_OPTIONS = facetOptions(CatalogEquipmentSchema.literals)
export const KIND_OPTIONS = facetOptions(ExerciseKind.literals)

/**
 * A segment value back to a facet: "All" (or anything not in the schema) → none. Decoding keeps
 * the chip code free of casts.
 */
const facetFromValue =
  <A>(decode: (input: unknown) => Option.Option<A>) =>
  (value: string): Option.Option<A> =>
    value === ALL ? Option.none() : decode(value)

export const muscleFromValue = facetFromValue(Schema.decodeUnknownOption(MuscleGroup))
export const equipmentFromValue = facetFromValue(Schema.decodeUnknownOption(CatalogEquipmentSchema))
export const kindFromValue = facetFromValue(Schema.decodeUnknownOption(ExerciseKind))

/** The segment value of a facet. */
export const segmentValue = (facet: Option.Option<string>): string =>
  Option.getOrElse(facet, () => ALL)

/** Empty equipment means bodyweight (v2-catalog.md §2). */
export const equipmentLabel = (equipment: ReadonlyArray<CatalogEquipment>): string =>
  Arr.isReadonlyArrayNonEmpty(equipment) ? equipment.map(facetLabel).join(", ") : "Bodyweight"

/** List row subtitle: primary muscles · equipment, e.g. "Quads, Glutes · Barbell". */
export const entrySubtitle = (entry: CatalogExercise): string =>
  `${entry.primaryMuscles.map(humanize).join(", ")} · ${equipmentLabel(entry.equipment)}`

/** Detail muscle line: primary, then secondary in brackets when there are any. */
export const musclesLine = (entry: CatalogExercise): string => {
  const primary = entry.primaryMuscles.map(humanize).join(", ")
  return Arr.isReadonlyArrayNonEmpty(entry.secondaryMuscles)
    ? `${primary} (also ${entry.secondaryMuscles.map(humanize).join(", ")})`
    : primary
}

/** Result count copy under the filter bar. */
export const resultCount = (count: number): string =>
  count === 1 ? "1 exercise" : `${count} exercises`
