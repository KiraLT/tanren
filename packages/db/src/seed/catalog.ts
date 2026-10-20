/** Static content of the seeded month: exercises and the upper/lower session templates. */
import type { MuscleGroup } from "@tanren/shared"

export type ExerciseKey =
  | "squat"
  | "bench"
  | "deadlift"
  | "ohp"
  | "row"
  | "rdl"
  | "pullUp"
  | "inclinePress"
  | "curl"
  | "lateralRaise"
  | "splitSquat"
  | "hipThrust"
  | "calfRaise"
  | "legRaise"

export interface ExerciseSpec {
  readonly key: ExerciseKey
  readonly name: string
  readonly aliases: ReadonlyArray<string>
  readonly muscleGroups: ReadonlyArray<MuscleGroup>
  readonly notes: string | undefined
  /** Week-0 load of the lead set in kg; `0` for bodyweight movements. */
  readonly baseKg: number
  /** Weekly progression: 2.5 for compounds, 0 for accessories. */
  readonly weeklyKg: number
}

export const EXERCISES: ReadonlyArray<ExerciseSpec> = [
  {
    key: "squat",
    name: "Back Squat",
    aliases: ["squat", "bs"],
    muscleGroups: ["quads", "glutes", "core"],
    notes: "High bar, belt on the top sets.",
    baseKg: 100,
    weeklyKg: 2.5,
  },
  {
    key: "bench",
    name: "Bench Press",
    aliases: ["bench", "bp"],
    muscleGroups: ["chest", "triceps", "shoulders"],
    notes: "Feet planted, shoulder blades pinned.",
    baseKg: 80,
    weeklyKg: 2.5,
  },
  {
    key: "deadlift",
    name: "Conventional Deadlift",
    aliases: ["deadlift", "dl"],
    muscleGroups: ["hamstrings", "glutes", "lowerBack", "traps"],
    notes: undefined,
    baseKg: 130,
    weeklyKg: 2.5,
  },
  {
    key: "ohp",
    name: "Overhead Press",
    aliases: ["ohp", "press"],
    muscleGroups: ["shoulders", "triceps"],
    notes: undefined,
    baseKg: 50,
    weeklyKg: 2.5,
  },
  {
    key: "row",
    name: "Barbell Row",
    aliases: ["bb row", "bent over row"],
    muscleGroups: ["lats", "upperBack", "biceps"],
    notes: "Torso about 30 degrees above parallel.",
    baseKg: 70,
    weeklyKg: 2.5,
  },
  {
    key: "rdl",
    name: "Romanian Deadlift",
    aliases: ["rdl"],
    muscleGroups: ["hamstrings", "glutes", "lowerBack"],
    notes: undefined,
    baseKg: 90,
    weeklyKg: 2.5,
  },
  {
    key: "pullUp",
    name: "Pull-Up",
    aliases: ["pullup", "chin-up"],
    muscleGroups: ["lats", "biceps", "upperBack"],
    notes: "Bodyweight; add a belt when 4x10 is easy.",
    baseKg: 0,
    weeklyKg: 0,
  },
  {
    key: "inclinePress",
    name: "Incline Dumbbell Press",
    aliases: ["incline db press"],
    muscleGroups: ["chest", "shoulders", "triceps"],
    notes: "Bench at 30 degrees. Load is per dumbbell.",
    baseKg: 28,
    weeklyKg: 0,
  },
  {
    key: "curl",
    name: "Dumbbell Curl",
    aliases: ["db curl"],
    muscleGroups: ["biceps", "forearms"],
    notes: undefined,
    baseKg: 14,
    weeklyKg: 0,
  },
  {
    key: "lateralRaise",
    name: "Lateral Raise",
    aliases: ["side raise"],
    muscleGroups: ["shoulders"],
    notes: undefined,
    baseKg: 8,
    weeklyKg: 0,
  },
  {
    key: "splitSquat",
    name: "Bulgarian Split Squat",
    aliases: ["bss", "split squat"],
    muscleGroups: ["quads", "glutes"],
    notes: "Rear foot on the bench. Load is per dumbbell.",
    baseKg: 20,
    weeklyKg: 0,
  },
  {
    key: "hipThrust",
    name: "Hip Thrust",
    aliases: ["barbell hip thrust"],
    muscleGroups: ["glutes", "hamstrings"],
    notes: undefined,
    baseKg: 100,
    weeklyKg: 2.5,
  },
  {
    key: "calfRaise",
    name: "Standing Calf Raise",
    aliases: ["calf raise"],
    muscleGroups: ["calves"],
    notes: "Dumbbell in one hand, free hand on the rack.",
    baseKg: 30,
    weeklyKg: 0,
  },
  {
    key: "legRaise",
    name: "Hanging Leg Raise",
    aliases: ["leg raise"],
    muscleGroups: ["core"],
    notes: undefined,
    baseKg: 0,
    weeklyKg: 0,
  },
]

export type RepSpec =
  | { readonly _tag: "Exact"; readonly reps: number }
  | { readonly _tag: "Range"; readonly min: number; readonly max: number }

export interface PlannedExerciseSpec {
  readonly key: ExerciseKey
  /** 3 to 5. */
  readonly sets: number
  readonly reps: RepSpec
  /** Fraction of the exercise's progressed lead-set load (a second slot for the same lift is lighter). */
  readonly intensity: number
  readonly restSeconds: number
  readonly note: string | undefined
}

export interface SessionTemplate {
  readonly name: string
  /** Days after the Monday of the plan week. */
  readonly dayOffset: number
  readonly exercises: ReadonlyArray<PlannedExerciseSpec>
}

const exact = (reps: number): RepSpec => ({ _tag: "Exact", reps })
const range = (min: number, max: number): RepSpec => ({ _tag: "Range", min, max })

/** Mon / Wed / Fri / Sat: upper, lower, upper, lower. */
export const SESSION_TEMPLATES: ReadonlyArray<SessionTemplate> = [
  {
    name: "Upper A",
    dayOffset: 0,
    exercises: [
      {
        key: "bench",
        sets: 4,
        reps: range(5, 8),
        intensity: 1,
        restSeconds: 180,
        note: "Pause the last rep on the top set.",
      },
      { key: "row", sets: 4, reps: range(6, 8), intensity: 1, restSeconds: 150, note: undefined },
      { key: "ohp", sets: 3, reps: exact(6), intensity: 0.9, restSeconds: 150, note: undefined },
      {
        key: "pullUp",
        sets: 3,
        reps: range(6, 10),
        intensity: 1,
        restSeconds: 120,
        note: undefined,
      },
      { key: "curl", sets: 3, reps: range(10, 12), intensity: 1, restSeconds: 90, note: undefined },
    ],
  },
  {
    name: "Lower A",
    dayOffset: 2,
    exercises: [
      { key: "squat", sets: 5, reps: exact(5), intensity: 1, restSeconds: 180, note: undefined },
      { key: "rdl", sets: 3, reps: range(8, 10), intensity: 1, restSeconds: 150, note: undefined },
      {
        key: "splitSquat",
        sets: 3,
        reps: range(8, 10),
        intensity: 1,
        restSeconds: 120,
        note: undefined,
      },
      {
        key: "calfRaise",
        sets: 4,
        reps: range(12, 15),
        intensity: 1,
        restSeconds: 90,
        note: undefined,
      },
      {
        key: "legRaise",
        sets: 3,
        reps: range(8, 12),
        intensity: 1,
        restSeconds: 90,
        note: undefined,
      },
    ],
  },
  {
    name: "Upper B",
    dayOffset: 4,
    exercises: [
      { key: "ohp", sets: 4, reps: exact(5), intensity: 1, restSeconds: 180, note: undefined },
      {
        key: "inclinePress",
        sets: 4,
        reps: range(8, 12),
        intensity: 1,
        restSeconds: 120,
        note: undefined,
      },
      {
        key: "pullUp",
        sets: 4,
        reps: range(6, 10),
        intensity: 1,
        restSeconds: 120,
        note: undefined,
      },
      {
        key: "row",
        sets: 3,
        reps: range(8, 10),
        intensity: 0.85,
        restSeconds: 120,
        note: undefined,
      },
      {
        key: "lateralRaise",
        sets: 4,
        reps: range(12, 15),
        intensity: 1,
        restSeconds: 90,
        note: undefined,
      },
    ],
  },
  {
    name: "Lower B",
    dayOffset: 5,
    exercises: [
      {
        key: "deadlift",
        sets: 3,
        reps: exact(5),
        intensity: 1,
        restSeconds: 180,
        note: "Reset every rep.",
      },
      {
        key: "squat",
        sets: 3,
        reps: range(6, 8),
        intensity: 0.85,
        restSeconds: 150,
        note: undefined,
      },
      {
        key: "hipThrust",
        sets: 4,
        reps: range(8, 12),
        intensity: 1,
        restSeconds: 120,
        note: undefined,
      },
      {
        key: "calfRaise",
        sets: 4,
        reps: range(12, 15),
        intensity: 1,
        restSeconds: 90,
        note: undefined,
      },
      {
        key: "legRaise",
        sets: 3,
        reps: range(8, 12),
        intensity: 1,
        restSeconds: 90,
        note: undefined,
      },
    ],
  },
]

/** Notes drawn at random for sessions and sets. */
export const SESSION_NOTES = [
  "Felt strong today.",
  "Slept badly, kept the volume as planned.",
  "Gym was crowded, rest times ran long.",
  "Left shoulder a bit tight in the warm-up.",
  "Good session, all reps clean.",
] as const

export const SET_NOTES = [
  "Grindy last rep.",
  "Form broke down on the last rep.",
  "Easy, could have done more.",
  "Dropped the weight after the warm-up set.",
] as const

export const PLAN_WEEK_INTENTS = {
  build: "Progressive overload: add 2.5 kg to the compound lifts.",
  deload: "Deload: 85% of last week's loads, stop two reps short of failure.",
} as const

/** Index of the deload week in the 5-week plan. */
export const DELOAD_WEEK = 3
export const PLAN_WEEKS = 5
