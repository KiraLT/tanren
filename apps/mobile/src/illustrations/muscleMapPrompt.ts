/**
 * Pure half of (scripts/generateMuscleMap.ts): flags, catalog selection and the prompt for one
 * generated per-exercise muscle map. One square image holds a front and a back figure side by side,
 * so muscles hidden from one view (glutes, hamstrings) still show; the body is neutral mid grey
 * (one file for both themes, ui-direction-final §7), primary muscles in the accent, secondary in a
 * lighter tint, and every unlisted muscle is named as "stays grey" so neighbours do not bleed.
 * Dev-time only (IMG-5).
 */
import { MuscleGroup } from "@tanren/shared"
import { Array as Arr, Option, Result } from "effect"

export type BodyView = "front" | "back"

/** What one map needs from a catalog entry; a `CatalogExercise` fits structurally. */
export interface MuscleMapInput {
  /** File stem in the out dir. */
  readonly catalogId: string
  readonly primaryMuscles: ReadonlyArray<MuscleGroup>
  readonly secondaryMuscles: ReadonlyArray<MuscleGroup>
}

export interface MuscleAnatomy {
  /** Plain anatomy the image model understands. */
  readonly name: string
  /** The figures it is visible on. */
  readonly views: ReadonlyArray<BodyView>
}

const at = (name: string, ...views: ReadonlyArray<BodyView>) => Option.some({ name, views })

/**
 * Each catalog muscle on the front/back chart. `fullBody` and `cardio` are not drawable regions
 * (None): `fullBody` expands to every drawable muscle, `cardio` is dropped. A new MuscleGroup is a
 * compile error here.
 */
export const MUSCLE_ANATOMY: Readonly<Record<MuscleGroup, Option.Option<MuscleAnatomy>>> = {
  chest: at("chest (pectorals)", "front"),
  lats: at(
    "latissimus dorsi (the wide wing-shaped muscles on the sides of the mid back, below the armpits)",
    "back",
  ),
  upperBack: at("rhomboids and middle trapezius (between the shoulder blades)", "back"),
  lowerBack: at("lower back (erector spinae, either side of the lower spine)", "back"),
  traps: at("upper trapezius (the slope from the neck to the top of the shoulders)", "back"),
  shoulders: at("deltoids (the rounded caps of the shoulders)", "front", "back"),
  biceps: at("biceps (front of the upper arms)", "front"),
  triceps: at("triceps (back of the upper arms)", "back"),
  forearms: at("forearms", "front", "back"),
  core: at("abdominals and obliques", "front"),
  quads: at("quadriceps (front of the thighs)", "front"),
  hamstrings: at("hamstrings (back of the thighs)", "back"),
  glutes: at("glutes (buttocks)", "back"),
  adductors: at("adductors (inner thighs)", "front"),
  calves: at("calves (back of the lower legs)", "back"),
  fullBody: Option.none(),
  cardio: Option.none(),
}

/** Drawable muscles in chart order. */
export const DRAWABLE_MUSCLES: ReadonlyArray<MuscleGroup> = MuscleGroup.literals.filter((m) =>
  Option.isSome(MUSCLE_ANATOMY[m]),
)

const expand = (muscles: ReadonlyArray<MuscleGroup>): ReadonlyArray<MuscleGroup> =>
  muscles.includes("fullBody")
    ? DRAWABLE_MUSCLES
    : muscles.filter((m) => Option.isSome(MUSCLE_ANATOMY[m]))

export interface MuscleTiers {
  readonly primary: ReadonlyArray<MuscleGroup>
  readonly secondary: ReadonlyArray<MuscleGroup>
  readonly grey: ReadonlyArray<MuscleGroup>
}

/** Drawable primary, secondary (minus primary) and the rest, which must stay grey. */
export const muscleTiers = (input: MuscleMapInput): MuscleTiers => {
  const primary = expand(input.primaryMuscles)
  const secondary = expand(input.secondaryMuscles).filter((m) => !primary.includes(m))
  const grey = DRAWABLE_MUSCLES.filter((m) => !primary.includes(m) && !secondary.includes(m))
  return { primary, secondary, grey }
}

/** Anatomy names of the muscles visible on one figure. */
const names = (muscles: ReadonlyArray<MuscleGroup>, view: BodyView): ReadonlyArray<string> =>
  muscles.flatMap((m) =>
    Option.toArray(MUSCLE_ANATOMY[m]).flatMap((a) => (a.views.includes(view) ? [a.name] : [])),
  )

/** "<colour> on a; b." or, for an empty tier, an explicit "no <tier> muscles" (never "on nothing"). */
const tier = (colour: string, label: string, muscles: ReadonlyArray<string>): string =>
  muscles.length === 0
    ? `No ${label} muscles on this figure.`
    : `${colour} on ${muscles.join("; ")}.`

export const PRIMARY_HEX = "#C2410C"
export const SECONDARY_HEX = "#FDBA74"
export const BODY_HEX = "#8A919B"

/** One figure's colouring, spelled out tier by tier: the model follows per-figure lists best. */
const figure = (tiers: MuscleTiers, view: BodyView, label: string): string =>
  [
    `${label}:`,
    tier(`Solid ember ${PRIMARY_HEX}`, "primary", names(tiers.primary, view)),
    tier(`Pale peach ${SECONDARY_HEX}`, "secondary", names(tiers.secondary, view)),
    `Neutral grey, NOT coloured: ${[...names(tiers.grey, view), "hands, feet, knees, shins and head"].join("; ")}.`,
  ].join(" ")

const TRUNK_MUSCLES: ReadonlyArray<MuscleGroup> = ["core", "lowerBack", "upperBack", "lats"]
const LEG_MUSCLES: ReadonlyArray<MuscleGroup> = [
  "quads",
  "hamstrings",
  "glutes",
  "adductors",
  "calves",
]

/**
 * Extra "stays grey" sentences for the two regions the image model paints by habit (IMG-5d):
 * the chest when a core or back muscle is primary and the chest is unlisted, and the legs when
 * an upper-body move lists no leg muscle.
 */
export const neutralRules = (tiers: MuscleTiers): ReadonlyArray<string> => {
  const listed = [...tiers.primary, ...tiers.secondary]
  return [
    ...(tiers.primary.some((m) => TRUNK_MUSCLES.includes(m)) && !listed.includes("chest")
      ? ["The chest and pectorals stay neutral grey: do not colour any part of the chest."]
      : []),
    ...(listed.some((m) => LEG_MUSCLES.includes(m))
      ? []
      : [
          "Thighs, knees, lower legs, glutes and feet stay neutral grey: do not colour any part of the legs.",
        ]),
  ]
}

/** The fixed layout and style, then each figure's three tiers and the "only these" rule. */
export const muscleMapPrompt = (input: MuscleMapInput): string => {
  const tiers = muscleTiers(input)
  return [
    "Minimal flat vector anatomical muscle chart for a fitness app, in one square image.",
    "Two figures of the same gender-neutral adult with an athletic build stand side by side at the same size: the LEFT figure is the FRONT view (facing the viewer), the RIGHT figure is the BACK view (seen from behind). Both show the whole body from head to feet, standing upright, arms slightly away from the sides, perfectly symmetrical, with a small gap between them and about 8 percent empty margin around.",
    "Style: clean flat shapes, each muscle drawn as its own simplified anatomical shape separated by thin gaps, like a modern workout-app muscle map. No shading, gradients, skin texture, face details, hair, clothing or photorealism.",
    `Colours: the whole body and every muscle is flat neutral mid grey (${BODY_HEX}) with slightly darker grey (#6B7280) separation lines. Exactly two highlight colours: primary muscles are solid ember red-orange (${PRIMARY_HEX}, not brown, not bright orange); secondary muscles are pale peach (${SECONDARY_HEX}), clearly lighter than the primary. No other colours.`,
    figure(tiers, "front", "LEFT figure (front view)"),
    figure(tiers, "back", "RIGHT figure (back view)"),
    "Only these muscles are coloured. Every other muscle stays the neutral grey; do not colour neighbouring muscles. Keep each colour strictly inside its own muscle's shape.",
    ...neutralRules(tiers),
    "Background: fully transparent, no backdrop, no floor, no shadow, no frame.",
    "Strictly no text, labels, letters, numbers, arrows, logos or watermarks.",
    "Final check: the image has no text, no title, no labels and no captions anywhere, only the two figures.",
  ].join("\n")
}

/** IMG-5a samples: legs, pull, push, rear delts, core. Must be catalog ids. */
export const SAMPLE_IDS: ReadonlyArray<string> = [
  "barbell-back-squat",
  "lat-pulldown",
  "barbell-bench-press",
  "face-pull",
  "plank",
]

export type MuscleSelection =
  | { readonly _tag: "Samples" }
  | { readonly _tag: "Ids"; readonly ids: ReadonlyArray<string> }
  | { readonly _tag: "All" }

export interface MuscleArgs {
  readonly out: string
  readonly selection: MuscleSelection
}

export const MUSCLE_USAGE =
  "usage: generateMuscleMap.ts --out <dir> [--catalog <id,…> | --catalog --all]  (no --catalog: the 5 samples)"

interface Flags {
  readonly out: Option.Option<string>
  readonly ids: Option.Option<ReadonlyArray<string>>
  readonly catalog: boolean
  readonly all: boolean
}

const isValue = (value: string | undefined): value is string =>
  value !== undefined && value.length > 0 && !value.startsWith("--")

const readFlags = (args: ReadonlyArray<string>, flags: Flags): Result.Result<Flags, string> => {
  const [flag, value, ...rest] = args
  if (flag === undefined) return Result.succeed(flags)
  if (flag === "--out") {
    return isValue(value)
      ? readFlags(rest, { ...flags, out: Option.some(value) })
      : Result.fail("--out needs a directory")
  }
  if (flag === "--catalog") {
    return isValue(value)
      ? readFlags(rest, {
          ...flags,
          catalog: true,
          ids: Option.some(
            value
              .split(",")
              .map((id) => id.trim())
              .filter((id) => id.length > 0),
          ),
        })
      : readFlags(args.slice(1), { ...flags, catalog: true })
  }
  if (flag === "--all") return readFlags(args.slice(1), { ...flags, all: true })
  return Result.fail(`unknown argument ${flag}`)
}

/** `--out <dir>` is required (maps never land in assets by accident); see MUSCLE_USAGE. */
export const parseMuscleArgs = (argv: ReadonlyArray<string>): Result.Result<MuscleArgs, string> =>
  Result.flatMap(
    readFlags(
      argv.filter((a) => a !== "--"),
      { out: Option.none(), ids: Option.none(), catalog: false, all: false },
    ),
    (flags): Result.Result<MuscleArgs, string> => {
      if (Option.isNone(flags.out)) return Result.fail("--out <dir> is required")
      const out = flags.out.value
      if (flags.all && Option.isSome(flags.ids)) return Result.fail("--all takes no id list")
      if (flags.all) {
        return flags.catalog
          ? Result.succeed({ out, selection: { _tag: "All" } })
          : Result.fail("--all needs --catalog")
      }
      if (Option.isSome(flags.ids)) {
        return flags.ids.value.length === 0
          ? Result.fail("--catalog needs at least one id")
          : Result.succeed({ out, selection: { _tag: "Ids", ids: flags.ids.value } })
      }
      return flags.catalog
        ? Result.fail("--catalog needs <id,…> or --all")
        : Result.succeed({ out, selection: { _tag: "Samples" } })
    },
  )

/** The catalog entries a selection names, in selection order; unknown ids fail. */
export const selectMaps = <A extends MuscleMapInput>(
  selection: MuscleSelection,
  catalog: ReadonlyArray<A>,
): Result.Result<ReadonlyArray<A>, string> => {
  if (selection._tag === "All") return Result.succeed(catalog)
  const ids = selection._tag === "Ids" ? selection.ids : SAMPLE_IDS
  const found = ids.map((id) => Arr.findFirst(catalog, (entry) => entry.catalogId === id))
  const unknown = ids.filter((_, i) => Option.isNone(found[i] ?? Option.none()))
  return unknown.length > 0
    ? Result.fail(`unknown catalog id ${unknown.join(", ")}`)
    : Result.succeed(found.flatMap(Option.toArray))
}

/**
 * Catalog ids with no generated map: after two regenerations (IMG-5d, IMG-5e) the model still
 * painted the chest or the legs against the catalog muscles, so `MuscleMapImage` shows the SVG
 * map for them. Do not regenerate into these without checking the result on a sheet.
 */
export const MISSING_MUSCLE_MAPS: ReadonlyArray<string> = [
  "barbell-wrist-curl",
  "bird-dog",
  "crunch",
  "dumbbell-overhead-triceps-extension",
  "hollow-hold",
  "kettlebell-halo",
  "plank",
  "push-up",
  "standing-cable-crunch",
]

/** Where the shrunk per-exercise maps live (committed assets). */
export const MUSCLE_MAP_DIR = "assets/musclemaps"
/** The generated require map the UI imports (`scripts/muscleMapIndex.ts`). */
export const MUSCLE_MAP_FILE = "src/illustrations/muscleMapImages.ts"

/**
 * Source of MUSCLE_MAP_FILE: one literal `require` per webp (Metro only bundles assets it sees as
 * `require("<literal>")`). Same shape as `images.ts`; the script runs Biome on the result.
 */
export const muscleMapImagesSource = (ids: ReadonlyArray<string>): string => {
  const entries = ids
    .map((id) => `  "${id}": require("../../${MUSCLE_MAP_DIR}/${id}.webp"),`)
    .join("\n")
  return `// Generated by \`node --import ./scripts/resolveTs.ts scripts/muscleMapIndex.ts\` from ${MUSCLE_MAP_DIR}/*.webp. Do not edit.
import type { ImageSourcePropType } from "react-native"

/** Per-exercise muscle map (gpt-image-1 webp, front + back figure) by catalog id; an id without a file is absent. */
export const MUSCLE_MAP_IMAGES: Readonly<Record<string, ImageSourcePropType>> = {
${entries}
}
`
}
