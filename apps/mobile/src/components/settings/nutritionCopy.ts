import {
  type ActivityLevel,
  formatInt,
  type LocalDate,
  type NutritionGoal,
  type NutritionProfile,
  nutritionTargets,
  type Sex,
} from "@tanren/shared"
import { Option } from "effect"

/** Settings → Nutrition copy (nutrition.md §6); the goal labels are pinned. */
export const NUTRITION_TITLE = "Nutrition & goals"

export const GOAL_LABELS: { readonly [G in NutritionGoal]: string } = {
  gain_muscle: "Gain muscle",
  lose_weight: "Lose weight",
  maintain: "Maintain",
}

export const GOAL_ORDER: ReadonlyArray<NutritionGoal> = ["gain_muscle", "lose_weight", "maintain"]

/** Five levels as radio rows: a 5-way segmented control truncates at 390. */
export const ACTIVITY_LABELS: {
  readonly [A in ActivityLevel]: { readonly title: string; readonly subtitle: string }
} = {
  sedentary: { title: "Sedentary", subtitle: "Desk job, little exercise" },
  light: { title: "Light", subtitle: "Exercise 1–3 days a week" },
  moderate: { title: "Moderate", subtitle: "Exercise 3–5 days a week" },
  active: { title: "Active", subtitle: "Exercise 6–7 days a week" },
  extra: { title: "Very active", subtitle: "Hard daily training or a physical job" },
}

export const ACTIVITY_ORDER: ReadonlyArray<ActivityLevel> = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "extra",
]

/** `skip` is the segmented control's third option: sex stays `None`. */
export const SEX_LABELS: { readonly [S in Sex | "skip"]: string } = {
  male: "Male",
  female: "Female",
  skip: "Skip",
}

export const EAT_BACK_TITLE = "Add exercise calories to the budget"
export const EAT_BACK_SUBTITLE =
  "Off: the budget stays at your daily target. On: calories Garmin records as active are added to today's budget. Trackers overestimate, so off is the safer default."
export const TARGETS_HINT =
  "Derived from your goal, weight and activity; add height, birth year and sex for a closer estimate."

/** The "add height, birth year and sex" hint shows while any of the three is unset. */
export const showTargetsHint = (
  draft: Pick<NutritionProfile, "heightCm" | "birthYear" | "sex">,
): boolean =>
  Option.isNone(draft.heightCm) || Option.isNone(draft.birthYear) || Option.isNone(draft.sex)

/** The birth-year stepper's caption unit: "age 36" in the year of `today`. */
export const ageLabel = (birthYear: number, today: LocalDate): string =>
  `age ${Number(today.slice(0, 4)) - birthYear}`

/** "3,070 kcal · 155 g": targets for `today` (overrides win inside `nutritionTargets`). */
export const targetsLabel = (profile: NutritionProfile, today: LocalDate): string => {
  const { kcal, proteinG } = nutritionTargets(profile, today)
  return `${formatInt(kcal)} kcal · ${formatInt(proteinG)} g`
}

/** The Settings row subtitle: "Gain muscle · 3,070 kcal · 155 g", or "Off" when tracking is off. */
export const nutritionSubtitle = (
  nutrition: Option.Option<NutritionProfile>,
  today: LocalDate,
): string =>
  Option.match(nutrition, {
    onNone: () => "Off",
    onSome: (profile) => `${GOAL_LABELS[profile.goal]} · ${targetsLabel(profile, today)}`,
  })
