import type { CatalogExerciseSpec } from "../CatalogExercise"

/**
 * Scope: abdominal and trunk work; must include every `CORE30_CATALOG_IDS` entry (about 28).
 * Id rule: kebab-case canonical name; prefix the implement when a movement exists with several
 * (`barbell-`, `dumbbell-`, `cable-`, `machine-`, `smith-`); bodyweight unprefixed.
 * C1-D fills the rest; the three entries below are the samples the search tests rely on.
 */
export const core: ReadonlyArray<CatalogExerciseSpec> = [
  {
    catalogId: "plank",
    name: "Plank",
    aliases: ["Front plank", "Forearm plank"],
    kind: "timed",
    primaryMuscles: ["core"],
    secondaryMuscles: ["shoulders", "glutes"],
    equipment: [],
    movement: "antiExtension",
    instructions: [
      "Set your forearms under your shoulders and extend your legs behind you.",
      "Brace your abs and squeeze your glutes so your body forms one straight line.",
      "Hold the position without letting your hips sag or rise.",
    ],
  },
  {
    catalogId: "side-plank",
    name: "Side Plank",
    aliases: ["Lateral plank"],
    kind: "timed",
    primaryMuscles: ["core"],
    secondaryMuscles: ["shoulders", "glutes"],
    equipment: [],
    movement: "antiRotation",
    instructions: [
      "Lie on your side with your elbow under your shoulder and your legs stacked.",
      "Lift your hips until your body is straight from head to feet.",
      "Hold, keeping your hips high and your chest facing forward.",
    ],
  },
  {
    catalogId: "dead-bug",
    name: "Dead Bug",
    aliases: ["Dying bug"],
    kind: "timed",
    primaryMuscles: ["core"],
    secondaryMuscles: ["quads"],
    equipment: [],
    movement: "antiExtension",
    instructions: [
      "Lie on your back with your arms up and your knees bent over your hips.",
      "Press your lower back into the floor and lower the opposite arm and leg.",
      "Return to the start and alternate sides without arching your back.",
    ],
  },
]
