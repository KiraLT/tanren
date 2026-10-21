/**
 * Pure half of (scripts/generateMuscleMap.ts): flags and the prompt for one
 * generated muscle map (front or back body, primary muscles in the accent, secondary in a lighter
 * tint), in the palette of `assets/illustrations/style.md`. Dev-time only; IMG-3 sample.
 */
import type { MuscleGroup } from "@tanren/shared"
import { Option, Result } from "effect"

export type BodyView = "front" | "back"

export interface MuscleMapSpec {
  /** File stem in the out dir. */
  readonly name: string
  readonly view: BodyView
  readonly primary: ReadonlyArray<MuscleGroup>
  readonly secondary: ReadonlyArray<MuscleGroup>
}

/**
 * Where each catalog muscle sits on a front/back body chart, in plain anatomy. `fullBody` and
 * `cardio` are not drawable regions (the SVG map lights every region instead), so they are None
 * and dropped. A new MuscleGroup is a compile error here.
 */
export const MUSCLE_ANATOMY: Readonly<Record<MuscleGroup, Option.Option<string>>> = {
  chest: Option.some("chest (pectorals)"),
  lats: Option.some("latissimus dorsi (the wide muscles on the sides of the upper back)"),
  upperBack: Option.some("upper back between the shoulder blades (rhomboids, mid trapezius)"),
  lowerBack: Option.some("lower back along the spine (erector spinae)"),
  traps: Option.some("upper trapezius between the neck and the shoulders"),
  shoulders: Option.some("shoulders (deltoids, front, side and rear heads)"),
  biceps: Option.some("biceps on the front of the upper arms"),
  triceps: Option.some("triceps on the back of the upper arms"),
  forearms: Option.some("forearms"),
  core: Option.some("abdominals and obliques"),
  quads: Option.some("quadriceps on the front of the thighs"),
  hamstrings: Option.some("hamstrings on the back of the thighs"),
  glutes: Option.some("glutes (buttocks)"),
  adductors: Option.some("adductors on the inner thighs"),
  calves: Option.some("calves on the lower legs"),
  fullBody: Option.none(),
  cardio: Option.none(),
}

const list = (muscles: ReadonlyArray<MuscleGroup>): string => {
  const names = muscles.flatMap((m) => Option.toArray(MUSCLE_ANATOMY[m]))
  return names.length === 0 ? "none" : names.join("; ")
}

/** The fixed style, then the view and the two muscle lists. */
export const muscleMapPrompt = (spec: MuscleMapSpec): string =>
  [
    "Minimal flat vector anatomical muscle chart for a fitness app: one gender-neutral adult body with an athletic build, standing upright, arms slightly away from the sides, feet apart.",
    `View: ${spec.view === "front" ? "front view, facing the viewer" : "back view, seen from behind"}, perfectly symmetrical, whole body from head to feet, centred in a square with about 10 percent empty margin on every side.`,
    "Style: clean flat shapes with thin even outlines, each muscle drawn as its own simplified anatomical shape separated by thin gaps, like a modern workout-app muscle map. No shading, gradients, skin texture, face details, hair, clothing or photorealism.",
    "Colours: every muscle that is not listed below is neutral light grey (#CBD5E1) with slate (#334155) outlines. Primary muscles are filled solid burnt orange (#C2410C). Secondary muscles are filled light peach (#FDBA74). No other colours.",
    `Primary muscles (burnt orange): ${list(spec.primary)}.`,
    `Secondary muscles (light peach): ${list(spec.secondary)}.`,
    "Background: fully transparent, no backdrop, no floor, no shadow, no frame.",
    "Strictly no text, labels, letters, numbers, arrows, logos or watermarks.",
  ].join("\n")

/** IMG-3 samples: legs (front), pull (back), push (front). Catalog muscle names only. */
export const SAMPLE_MAPS: ReadonlyArray<MuscleMapSpec> = [
  {
    name: "front-quads-glutes",
    view: "front",
    primary: ["quads", "glutes"],
    secondary: ["hamstrings", "core"],
  },
  { name: "back-lats", view: "back", primary: ["lats"], secondary: ["biceps", "shoulders"] },
  { name: "front-chest", view: "front", primary: ["chest"], secondary: ["triceps", "shoulders"] },
]

export const MUSCLE_USAGE = "usage: generateMuscleMap.ts --out <dir>"

/** `--out <dir>` is required: samples never land in the app's assets. */
export const parseMuscleArgs = (argv: ReadonlyArray<string>): Result.Result<string, string> => {
  const args = argv.filter((a) => a !== "--")
  const [flag, value, ...rest] = args
  if (flag !== "--out" || value === undefined || value.startsWith("--") || value.length === 0) {
    return Result.fail("--out <dir> is required")
  }
  return rest.length > 0 ? Result.fail(`unknown argument ${rest.join(" ")}`) : Result.succeed(value)
}
