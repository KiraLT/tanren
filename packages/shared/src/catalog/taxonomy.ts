import { Schema } from "effect"
import type { EquipmentKind } from "../user"

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
  "barbell",
  "dumbbell",
  "kettlebell",
  "cable",
  "machine",
  "smithMachine",
  "trapBar",
  "ezBar",
  "pullUpBar",
  "dipStation",
  "band",
  "bench",
  "box",
  "medicineBall",
  "abWheel",
  "foamRoller",
  "cardioMachine",
  "landmine",
  "plate",
  "suspensionTrainer",
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

/** Catalog implement → the profile's coarser `EquipmentKind` (used by the profile equipment filter). */
const EQUIPMENT_KIND = {
  barbell: "barbell",
  dumbbell: "dumbbells",
  kettlebell: "kettlebell",
  cable: "cableMachine",
  machine: "machines",
  smithMachine: "smithMachine",
  trapBar: "trapBar",
  ezBar: "ezBar",
  pullUpBar: "pullUpBar",
  dipStation: "dipStation",
  band: "resistanceBands",
  bench: "bench",
  box: "other",
  medicineBall: "other",
  abWheel: "other",
  foamRoller: "other",
  cardioMachine: "cardioMachine",
  landmine: "barbell",
  plate: "other",
  suspensionTrainer: "other",
} as const satisfies { readonly [E in CatalogEquipment]: EquipmentKind }

export const equipmentKindFor = (equipment: CatalogEquipment): EquipmentKind =>
  EQUIPMENT_KIND[equipment]
