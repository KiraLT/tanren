import { Schema } from "effect"

/** Lower-case kebab-case key: `barbell-back-squat`, `core-30`. */
export const Slug = Schema.String.check(
  Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  Schema.isMaxLength(64),
)
export type Slug = typeof Slug.Type

/** A catalog entry's stable key, e.g. `"barbell-back-squat"` (v2-catalog.md §2). */
export const CatalogId = Slug.pipe(Schema.brand("CatalogId"))
export type CatalogId = typeof CatalogId.Type

/** The SVG an entry shows; defaults to its `catalogId`. */
export const IllustrationId = Slug.pipe(Schema.brand("IllustrationId"))
export type IllustrationId = typeof IllustrationId.Type

/** How a movement is measured (ADR-0007 Q4: additive). */
export const ExerciseKind = Schema.Literals(["reps", "timed", "distance"])
export type ExerciseKind = typeof ExerciseKind.Type

/** Implements a catalog entry needs; an empty `equipment` array means bodyweight. */
export const CatalogEquipment = Schema.Literals([
  // Free weights
  "barbell",
  "dumbbell",
  "kettlebell",
  "trapBar",
  "ezBar",
  "plate",
  "landmine",
  "medicineBall",
  // Benches and racks
  "bench",
  "rack",
  "preacherBench",
  "backExtensionBench",
  "gluteHamDeveloper",
  "box",
  // Machines
  "smithMachine",
  "legPress",
  "hackSquat",
  "legExtension",
  "legCurl",
  "chestPressMachine",
  "pecDeck",
  "shoulderPressMachine",
  "hipAbductorMachine",
  "calfRaiseMachine",
  "abCrunchMachine",
  "assistedPullUpMachine",
  // Cables
  "cable",
  "latPulldown",
  "seatedRowMachine",
  // Bodyweight and accessories
  "pullUpBar",
  "dipStation",
  "band",
  "abWheel",
  "foamRoller",
  "suspensionTrainer",
  // Cardio
  "cardioMachine",
])
export type CatalogEquipment = typeof CatalogEquipment.Type

export const MovementPattern = Schema.Literals([
  "squat",
  "hinge",
  "lunge",
  "horizontalPush",
  "verticalPush",
  "horizontalPull",
  "verticalPull",
  "carry",
  "rotation",
  "antiExtension",
  "antiRotation",
  "flexion",
  "isolation",
  "locomotion",
  "mobility",
])
export type MovementPattern = typeof MovementPattern.Type
