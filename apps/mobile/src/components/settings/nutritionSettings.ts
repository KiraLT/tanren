import {
  type NutritionProfile,
  NutritionProfile as NutritionProfileSchema,
  ValidationError,
} from "@tanren/shared"
import { Effect, Option, Result, Schema } from "effect"
import { ProfileRepo } from "../../services/ProfileRepo"

/**
 * The editor's working copy: the profile's own shape, but unchecked (a stepper or a test can push a
 * number out of range; `validateDraft` names the field).
 */
export type NutritionDraft = {
  readonly [K in keyof NutritionProfile]: NutritionProfile[K]
}

/** Inclusive range and step of each stepper (shared `NutritionProfile` checks; nutrition.md §6). */
export const RANGES = {
  bodyWeightKg: { min: 30, max: 300, step: 0.5 },
  heightCm: { min: 120, max: 230, step: 1 },
  birthYear: { min: 1920, max: 2020, step: 1 },
  kcalTarget: { min: 800, max: 8000, step: 50 },
  proteinTargetG: { min: 20, max: 500, step: 5 },
} as const

export type RangedField = keyof typeof RANGES

/** "Add" on an unset optional field starts here. */
export const ADD_DEFAULTS = { heightCm: 175, birthYear: 1990 } as const

/** A fresh profile: what the screen shows when tracking is off. */
export const defaultDraft: NutritionDraft = {
  goal: "maintain",
  bodyWeightKg: 75,
  heightCm: Option.none(),
  birthYear: Option.none(),
  sex: Option.none(),
  activityLevel: "moderate",
  eatBackActive: false,
  kcalTarget: Option.none(),
  proteinTargetG: Option.none(),
}

export const draftOf = (nutrition: Option.Option<NutritionProfile>): NutritionDraft =>
  Option.getOrElse(nutrition, () => defaultDraft)

/**
 * One stepper tap: snaps to the step grid, then clamps to the range, so 3,070 kcal steps down to
 * 3,050 and then 3,000 (the override steppers start from the derived value).
 */
export const stepValue = (field: RangedField, value: number, direction: 1 | -1): number => {
  const { min, max, step } = RANGES[field]
  const snapped = direction === 1 ? Math.floor(value / step) * step : Math.ceil(value / step) * step
  return Math.min(max, Math.max(min, snapped + direction * step))
}

const ProfileType = Schema.toType(NutritionProfileSchema)

/** The draft as a `NutritionProfile`, or a `ValidationError` whose issue path names the field. */
export const validateDraft = (
  draft: NutritionDraft,
): Result.Result<NutritionProfile, ValidationError> =>
  Result.mapError(Schema.decodeUnknownResult(ProfileType)(draft), ValidationError.fromSchemaError)

/** A stable key for "did anything change": `None` and every field, Options as `null`. */
const keyOf = (nutrition: Option.Option<NutritionDraft>): string =>
  Option.match(nutrition, {
    onNone: () => "off",
    onSome: (draft) =>
      JSON.stringify([
        draft.goal,
        draft.bodyWeightKg,
        Option.getOrNull(draft.heightCm),
        Option.getOrNull(draft.birthYear),
        Option.getOrNull(draft.sex),
        draft.activityLevel,
        draft.eatBackActive,
        Option.getOrNull(draft.kcalTarget),
        Option.getOrNull(draft.proteinTargetG),
      ]),
  })

/** Save is enabled when the draft is valid and differs from what is stored. */
export const canSave = (draft: NutritionDraft, saved: Option.Option<NutritionProfile>): boolean =>
  Result.isSuccess(validateDraft(draft)) && keyOf(Option.some(draft)) !== keyOf(saved)

/**
 * Writes `profile.nutrition` through the local ProfileRepo (dirty, so sync pushes it): `Some` turns
 * tracking on or updates it, `None` turns it off. Creates the profile row when none exists yet.
 */
export const saveNutrition = Effect.fn("saveNutrition")(function* (
  next: Option.Option<NutritionProfile>,
) {
  const repo = yield* ProfileRepo
  return yield* repo.save({ nutrition: next })
})
