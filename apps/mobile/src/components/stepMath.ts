/** Pure stepper arithmetic and direct-entry parsing for the weight, reps and seconds controls. */

import type { CatalogEquipment, CatalogId } from "@tanren/shared"
import { findCatalogExercise } from "@tanren/shared"
import { Array as Arr, Option } from "effect"

const WEIGHT_STEP_KG = 2.5
const REPS_STEP = 1

export type StepDirection = 1 | -1

/** Rounds to two decimals so repeated 2.5 steps never accumulate float noise. */
const roundHundredths = (value: number): number => Math.round(value * 100) / 100

/** One weight step (default 2.5 kg) up or down, never below 0. */
export const stepWeight = (
  current: number,
  direction: StepDirection,
  stepKg: number = WEIGHT_STEP_KG,
): number => Math.max(0, roundHundredths(current + direction * stepKg))

/** One rep up or down, always a whole number, never below 0. */
export const stepReps = (current: number, direction: StepDirection): number =>
  Math.max(0, Math.round(current + direction * REPS_STEP))

/** "80", "82.5": no trailing zeros. */
export const formatKg = (kg: number): string => String(roundHundredths(kg))

/**
 * The ± step per equipment (weight-entry.md §2): the first row that holds any of the exercise's
 * equipment wins. Every `LOADED_EQUIPMENT` literal is in exactly one row (`stepMath.test.ts`).
 */
export const STEP_RULES: ReadonlyArray<{
  readonly stepKg: number
  readonly equipment: ReadonlyArray<CatalogEquipment>
}> = [
  { stepKg: 2.5, equipment: ["barbell", "smithMachine", "trapBar", "ezBar", "landmine"] },
  { stepKg: 2, equipment: ["dumbbell"] },
  { stepKg: 4, equipment: ["kettlebell"] },
  { stepKg: 2, equipment: ["plate", "medicineBall"] },
  { stepKg: 5, equipment: ["legPress", "hackSquat"] },
  {
    stepKg: 5,
    equipment: [
      "legExtension",
      "legCurl",
      "chestPressMachine",
      "pecDeck",
      "shoulderPressMachine",
      "hipAbductorMachine",
      "calfRaiseMachine",
      "abCrunchMachine",
      "latPulldown",
      "seatedRowMachine",
      "cable",
      "assistedPullUpMachine",
    ],
  },
]

/** The step choices of the Step chip row (§2). */
export const STEP_OPTIONS_KG: ReadonlyArray<number> = [1, 1.25, 2, 2.5, 5, 10]

/** The equipment default step; a list with no loaded equipment (or none at all) keeps 2.5. */
export const stepKgFor = (equipment: ReadonlyArray<CatalogEquipment>): number =>
  Option.getOrElse(
    Option.map(
      Arr.findFirst(STEP_RULES, (rule) => rule.equipment.some((item) => equipment.includes(item))),
      (rule) => rule.stepKg,
    ),
    () => WEIGHT_STEP_KG,
  )

/** The device override wins over the equipment default. */
export const effectiveStep = (
  override: Option.Option<number>,
  equipment: ReadonlyArray<CatalogEquipment>,
): number => Option.getOrElse(override, () => stepKgFor(equipment))

/** The catalog entry's equipment; `[]` when the exercise has no catalog link. */
export const equipmentOf = (catalogId: Option.Option<CatalogId>): ReadonlyArray<CatalogEquipment> =>
  Option.getOrElse(
    Option.map(Option.flatMap(catalogId, findCatalogExercise), (entry) => entry.equipment),
    () => [],
  )

interface EntrySpec {
  readonly min: number
  readonly max: number
  readonly snap: number
}

const WEIGHT_ENTRY: EntrySpec = { min: 0, max: 500, snap: 0.25 }
const REPS_ENTRY: EntrySpec = { min: 1, max: 100, snap: 1 }

/** The typed number (`,` accepted as the decimal point), None when empty or not a finite number. */
const typedNumber = (raw: string): Option.Option<number> => {
  const text = raw.trim().replace(",", ".")
  const value = Number(text)
  return text.length === 0 || !Number.isFinite(value) ? Option.none() : Option.some(value)
}

const fitTo = (spec: EntrySpec, value: number): number =>
  roundHundredths(Math.round(Math.min(spec.max, Math.max(spec.min, value)) / spec.snap) * spec.snap)

const parseWith =
  (spec: EntrySpec) =>
  (raw: string, previous: number): number =>
    Option.match(typedNumber(raw), {
      onNone: () => previous,
      onSome: (value) => fitTo(spec, value),
    })

const exactWith =
  (spec: EntrySpec) =>
  (raw: string): boolean =>
    Option.exists(typedNumber(raw), (value) => fitTo(spec, value) === value)

/** Direct entry, kg: clamp 0–500, snap to 0.25; empty or not a number keeps `previous`. */
export const parseWeight = parseWith(WEIGHT_ENTRY)
/** Direct entry, reps: clamp 1–100, whole number; empty or not a number keeps `previous`. */
export const parseReps = parseWith(REPS_ENTRY)

/** True when the draft commits as typed (no clamp, snap or fallback): §4 "Invalid draft" is its negation. */
export const isExactWeight = exactWith(WEIGHT_ENTRY)
export const isExactReps = exactWith(REPS_ENTRY)
