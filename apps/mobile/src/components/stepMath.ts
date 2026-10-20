/** Pure stepper arithmetic for the weight and reps controls on the Today screen. */

export const WEIGHT_STEP_KG = 2.5
export const REPS_STEP = 1

export type StepDirection = 1 | -1

/** Rounds to two decimals so repeated 2.5 steps never accumulate float noise. */
const roundHundredths = (value: number): number => Math.round(value * 100) / 100

/** One weight step (2.5 kg) up or down, never below 0. */
export const stepWeight = (current: number, direction: StepDirection): number =>
  Math.max(0, roundHundredths(current + direction * WEIGHT_STEP_KG))

/** One rep up or down, always a whole number, never below 0. */
export const stepReps = (current: number, direction: StepDirection): number =>
  Math.max(0, Math.round(current + direction * REPS_STEP))

/** "80", "82.5": no trailing zeros. */
export const formatKg = (kg: number): string => String(roundHundredths(kg))
