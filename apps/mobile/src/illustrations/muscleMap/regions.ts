import type { MuscleGroup } from "@tanren/shared"
import { Array as Arr } from "effect"

/**
 * Drawable muscle regions of the front/back body map (`body.ts`). Finer than the shared
 * `MuscleGroup` taxonomy where the drawing needs it (one taxonomy `shoulders` → three deltoid
 * heads; `core` → abs + obliques; `traps`, `forearms`, `calves` are seen on both panels).
 */
export const REGION_IDS = [
  // front panel
  "trapsFront",
  "chest",
  "frontDelts",
  "sideDelts",
  "biceps",
  "forearmsFront",
  "abs",
  "obliques",
  "quads",
  "adductors",
  "calvesFront",
  "heart",
  // back panel
  "traps",
  "rearDelts",
  "upperBack",
  "lats",
  "lowerBack",
  "triceps",
  "forearmsBack",
  "glutes",
  "hamstrings",
  "calves",
] as const
export type RegionId = (typeof REGION_IDS)[number]

/** Regions that are muscles (everything but the `heart` marker `cardio` lights up). */
const MUSCLE_REGIONS: ReadonlyArray<RegionId> = REGION_IDS.filter((id) => id !== "heart")

/** Taxonomy literal → the regions it lights up; every literal has at least one. */
export const MUSCLE_REGION_MAP = {
  chest: ["chest"],
  lats: ["lats"],
  upperBack: ["upperBack"],
  lowerBack: ["lowerBack"],
  traps: ["traps", "trapsFront"],
  shoulders: ["frontDelts", "sideDelts", "rearDelts"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearms: ["forearmsFront", "forearmsBack"],
  core: ["abs", "obliques"],
  quads: ["quads"],
  hamstrings: ["hamstrings"],
  glutes: ["glutes"],
  adductors: ["adductors"],
  calves: ["calves", "calvesFront"],
  fullBody: MUSCLE_REGIONS,
  cardio: ["heart"],
} as const satisfies { readonly [M in MuscleGroup]: ReadonlyArray<RegionId> }

/** The regions a list of muscles lights up, deduplicated, in taxonomy order of the input. */
export const regionsFor = (muscles: ReadonlyArray<MuscleGroup>): ReadonlyArray<RegionId> =>
  Arr.dedupe(muscles.flatMap((muscle): ReadonlyArray<RegionId> => MUSCLE_REGION_MAP[muscle]))

export type RegionTone = "primary" | "secondary" | "idle"

/** How each region is painted: primary wins over secondary when a region is in both. */
export const regionTone = (
  primary: ReadonlyArray<MuscleGroup>,
  secondary: ReadonlyArray<MuscleGroup>,
): ((id: RegionId) => RegionTone) => {
  const primaryRegions = regionsFor(primary)
  const secondaryRegions = regionsFor(secondary)
  return (id) =>
    primaryRegions.includes(id) ? "primary" : secondaryRegions.includes(id) ? "secondary" : "idle"
}

export const MUSCLE_LABEL = {
  chest: "chest",
  lats: "lats",
  upperBack: "upper back",
  lowerBack: "lower back",
  traps: "traps",
  shoulders: "shoulders",
  biceps: "biceps",
  triceps: "triceps",
  forearms: "forearms",
  core: "core",
  quads: "quads",
  hamstrings: "hamstrings",
  glutes: "glutes",
  adductors: "adductors",
  calves: "calves",
  fullBody: "full body",
  cardio: "cardio",
} as const satisfies { readonly [M in MuscleGroup]: string }

const listOf = (muscles: ReadonlyArray<MuscleGroup>): string =>
  muscles.map((muscle) => MUSCLE_LABEL[muscle]).join(", ")

/** Screen-reader label: "Muscle map. Primary: quads, glutes. Secondary: hamstrings." */
export const muscleMapLabel = (
  primary: ReadonlyArray<MuscleGroup>,
  secondary: ReadonlyArray<MuscleGroup>,
): string => {
  const parts = [
    ...(primary.length > 0 ? [`Primary: ${listOf(primary)}.`] : []),
    ...(secondary.length > 0 ? [`Secondary: ${listOf(secondary)}.`] : []),
  ]
  return parts.length > 0 ? `Muscle map. ${parts.join(" ")}` : "Muscle map, no muscles highlighted."
}
