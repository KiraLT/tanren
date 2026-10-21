/**
 * Pure half of `pnpm images:generate` (scripts/generateIllustrations.ts): flags, which catalog ids
 * to generate, the prompt per exercise from `assets/illustrations/style.md`, the OpenAI Images
 * response shapes and the contact sheet. Dev-time only; nothing here is bundled into the app.
 */
import type { CatalogExercise, MuscleGroup } from "@tanren/shared"
import { Array as Arr, Option, pipe, Result, Schema } from "effect"

export const IMAGE_DIR = "assets/illustrations"
export const STYLE_FILE = `${IMAGE_DIR}/style.md`
export const IMAGE_SHEET = `${IMAGE_DIR}/_contact-sheet.html`
export const IMAGE_MODEL = "gpt-image-1"
export const IMAGE_SIZE = "1024x1024"
export const IMAGE_QUALITY = "medium"
/**
 * webp `output_compression` (API default 100 = ~900 KB per flat 1024² image). cwebp -q 80 on a
 * sample gave 16 KB with no visible loss, so 235 images stay a few MB in the app bundle.
 */
export const IMAGE_COMPRESSION = 80
/** Cost guard: at most this many images per run unless `--all` is passed. */
export const RUN_CAP = 8

/** `--samples`: one exercise per equipment family, to approve the style before a full run. */
export const SAMPLE_IDS: ReadonlyArray<string> = [
  "barbell-back-squat",
  "one-arm-dumbbell-row",
  "plank",
  "lat-pulldown",
  "kettlebell-swing",
  "treadmill-run",
]

export const imageFile = (id: string): string => `${id}.webp`

export interface ImageArgs {
  readonly samples: boolean
  readonly all: boolean
  readonly limit: Option.Option<number>
  readonly only: Option.Option<ReadonlyArray<string>>
}

const NO_ARGS: ImageArgs = { samples: false, all: false, limit: Option.none(), only: Option.none() }

export const USAGE = "usage: images:generate [--samples | --only <id,…>] [--limit N] [--all]"

const parseFrom = (
  rest: ReadonlyArray<string>,
  acc: ImageArgs,
): Result.Result<ImageArgs, string> => {
  const [flag, value] = rest
  if (flag === undefined) {
    return acc.samples && Option.isSome(acc.only)
      ? Result.fail("--samples and --only cannot be combined")
      : Result.succeed(acc)
  }
  if (flag === "--") return parseFrom(rest.slice(1), acc)
  if (flag === "--samples") return parseFrom(rest.slice(1), { ...acc, samples: true })
  if (flag === "--all") return parseFrom(rest.slice(1), { ...acc, all: true })
  if (flag === "--limit") {
    const n = Number(value)
    return value === undefined || !Number.isInteger(n) || n < 1
      ? Result.fail("--limit needs a positive integer")
      : parseFrom(rest.slice(2), { ...acc, limit: Option.some(n) })
  }
  if (flag === "--only") {
    const ids = (value ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0 && !id.startsWith("--"))
    return ids.length === 0
      ? Result.fail("--only needs a comma-separated list of catalog ids")
      : parseFrom(rest.slice(2), { ...acc, only: Option.some(ids) })
  }
  return Result.fail(`unknown argument ${flag}`)
}

export const parseImageArgs = (argv: ReadonlyArray<string>): Result.Result<ImageArgs, string> =>
  parseFrom(argv, NO_ARGS)

export interface Selection {
  /** Ids to generate this run, in request order. */
  readonly ids: ReadonlyArray<string>
  /** Requested ids whose file already exists (idempotency). */
  readonly existing: number
  /** Missing ids left for a later run by the cost cap. */
  readonly deferred: number
}

/**
 * Requested ids are `--samples`, else `--only`, else the whole catalog (in catalog order). Ids with
 * a file are skipped, then `--limit` applies, then the cap unless `--all`.
 */
export const selectIds = (
  args: ImageArgs,
  catalogIds: ReadonlyArray<string>,
  exists: (id: string) => boolean,
): Result.Result<Selection, string> => {
  const requested = Arr.dedupe(
    args.samples ? SAMPLE_IDS : Option.getOrElse(args.only, () => catalogIds),
  )
  const unknown = requested.filter((id) => !catalogIds.includes(id))
  if (unknown.length > 0) return Result.fail(`unknown catalog ids: ${unknown.join(", ")}`)
  const missing = requested.filter((id) => !exists(id))
  const limited = Option.match(args.limit, {
    onNone: () => missing,
    onSome: (n) => Arr.take(missing, n),
  })
  const ids = args.all ? limited : Arr.take(limited, RUN_CAP)
  return Result.succeed({
    ids,
    existing: requested.length - missing.length,
    deferred: missing.length - ids.length,
  })
}

export interface StyleGuide {
  readonly style: string
  readonly template: string
}

const fencedBlock = (markdown: string, info: string): Option.Option<string> =>
  pipe(
    Option.fromNullishOr(markdown.match(new RegExp(`\`\`\`${info}\\n([\\s\\S]*?)\\n\`\`\``))),
    Option.flatMap((match) => Option.fromNullishOr(match[1])),
    Option.map((block) => block.trim()),
    Option.filter((block) => block.length > 0),
  )

/** The ```style and ```template fenced blocks of style.md; None if either is missing or empty. */
export const parseStyleGuide = (markdown: string): Option.Option<StyleGuide> =>
  Option.all({ style: fencedBlock(markdown, "style"), template: fencedBlock(markdown, "template") })

/** `upperBack` → `upper back`, `smithMachine` → `smith machine`. */
export const humanize = (word: string): string =>
  word.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()

export type PromptFacts = Pick<
  CatalogExercise,
  "catalogId" | "name" | "equipment" | "instructions" | "primaryMuscles" | "secondaryMuscles"
>

const sentence = (line: string): string => (/[.!?]$/.test(line) ? line : `${line}.`)

/**
 * Where the orange accent goes for each primary muscle, in plain anatomy the image model places
 * reliably (IMG-1: "core" alone landed on the chest). `fullBody` and `cardio` name no muscle, so
 * their accent goes on the equipment (`accentTarget`). A new MuscleGroup is a compile error here.
 */
export const MUSCLE_ACCENT: Readonly<Record<MuscleGroup, Option.Option<string>>> = {
  chest: Option.some("the chest muscles (pectorals)"),
  lats: Option.some(
    "the latissimus dorsi, the wide muscles on the sides of the upper back below the armpits",
  ),
  upperBack: Option.some(
    "the upper back muscles between the shoulder blades (rhomboids and mid trapezius)",
  ),
  lowerBack: Option.some("the lower back muscles along the spine (erector spinae)"),
  traps: Option.some("the upper trapezius between the neck and the shoulders"),
  shoulders: Option.some("the shoulder muscles (deltoids)"),
  biceps: Option.some("the biceps on the front of the upper arms"),
  triceps: Option.some("the triceps on the back of the upper arms"),
  forearms: Option.some("the forearm muscles"),
  core: Option.some(
    "the abdominal muscles on the front of the torso, between the ribs and the hips",
  ),
  quads: Option.some("the quadriceps on the front of the thighs"),
  hamstrings: Option.some("the hamstrings on the back of the thighs"),
  glutes: Option.some("the glutes (buttocks)"),
  adductors: Option.some("the adductors on the inner thighs"),
  calves: Option.some("the calf muscles on the back of the lower legs"),
  fullBody: Option.none(),
  cardio: Option.none(),
}

const anatomy = (muscles: ReadonlyArray<MuscleGroup>): ReadonlyArray<string> =>
  Arr.take(Arr.getSomes(muscles.map((muscle) => MUSCLE_ACCENT[muscle])), 2)

/**
 * The primary muscles as anatomy; for an all-`fullBody`/`cardio` primary list the first two
 * secondary muscles, else the equipment, else the legs.
 */
export const accentTarget = (
  facts: Pick<PromptFacts, "equipment" | "primaryMuscles" | "secondaryMuscles">,
): string => {
  const primary = anatomy(facts.primaryMuscles)
  if (primary.length > 0) return primary.join(" and ")
  const secondary = anatomy(facts.secondaryMuscles)
  if (secondary.length > 0) return secondary.join(" and ")
  return facts.equipment.length > 0
    ? `the ${facts.equipment.map(humanize).join(" and ")}`
    : "the working leg muscles"
}

/**
 * Image-only instruction wording for entries whose catalog text the OpenAI safety system rejected
 * (IMG-2 full run, HTTP 400): frog-pump ("sexual") and cable-crunch ("rope beside your head":
 * "self-harm"). The catalog text stays as it is for the app. Both were still rejected with this
 * wording (IMG-2); `NAME_OVERRIDES` also neutralises the name line.
 */
export const PROMPT_INSTRUCTIONS: Readonly<Record<string, ReadonlyArray<string>>> = {
  "frog-pump": [
    "A glute bridge variation on a gym mat, lying face up with the soles of the feet together",
    "The hips are lifted off the mat at the top of the bridge",
  ],
  "cable-crunch": [
    "Kneeling in front of a high cable pulley, both hands holding the cable handle at forehead height",
    "The torso is bent forward and down, elbows moving toward the thighs",
  ],
}

/**
 * Image-only neutral name for the two entries the safety system rejected with a reworded
 * instruction (IMG-2). Still rejected with this too (frog-pump: sexual; cable-crunch: violence,
 * self-harm), so both show the placeholder. The catalog name stays for the app.
 */
export const NAME_OVERRIDES: Readonly<Record<string, string>> = {
  "frog-pump": "hip bridge, lying on the back, knees bent, soles together",
  "cable-crunch": "kneeling cable abdominal curl",
}

/** Style block, a blank line, then the template filled with the exercise's facts. */
export const exercisePrompt = (guide: StyleGuide, facts: PromptFacts): string => {
  const instructions = PROMPT_INSTRUCTIONS[facts.catalogId] ?? facts.instructions
  const name = NAME_OVERRIDES[facts.catalogId] ?? facts.name
  const equipment =
    facts.equipment.length === 0
      ? "bodyweight, no equipment"
      : facts.equipment.map(humanize).join(" and ")
  const filled = guide.template
    .replaceAll("{{name}}", name)
    .replaceAll("{{equipment}}", equipment)
    .replaceAll("{{instructions}}", Arr.take(instructions, 2).map(sentence).join(" "))
    .replaceAll("{{primary}}", facts.primaryMuscles.map(humanize).join(" and "))
    .replaceAll("{{accent}}", accentTarget(facts))
  return `${guide.style}\n\n${filled}`
}

/** `POST /v1/images/generations` 200 body: GPT image models always return `b64_json`. */
export const ImagesResponse = Schema.Struct({
  data: Schema.Array(Schema.Struct({ b64_json: Schema.String })),
})

/** OpenAI error body. */
export const ApiErrorBody = Schema.Struct({
  error: Schema.Struct({ message: Schema.String }),
})

/** Error text may echo a masked key (`sk-ab***yz`); never print any part of it. */
export const redactSecrets = (text: string): string =>
  text.replace(/sk-[A-Za-z0-9_*.-]+/g, "sk-[redacted]")

/** The generated static map the app imports (`pnpm images:map`). */
export const IMAGE_MAP_FILE = "src/illustrations/images.ts"

/**
 * Source of IMAGE_MAP_FILE: one literal `require` per webp, because Metro only bundles assets it
 * sees as `require("<literal>")`. Ids are sorted; the script runs Biome on the result.
 */
export const imageMapSource = (ids: ReadonlyArray<string>): string => {
  const entries = ids
    .map((id) => `  "${id}": require("../../${IMAGE_DIR}/${imageFile(id)}"),`)
    .join("\n")
  return `// Generated by \`pnpm -F @tanren/mobile images:map\` from ${IMAGE_DIR}/*.webp. Do not edit.
import type { ImageSourcePropType } from "react-native"

/** Exercise illustration (gpt-image-1 webp) by catalog id; an id without a file is absent. */
export const IMAGES: Readonly<Record<string, ImageSourcePropType>> = {
${entries}
}
`
}

const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")

/** A static page next to the images (`<id>.webp` relative src): open it in a browser to review. */
export const imageContactSheet = (ids: ReadonlyArray<string>): string => {
  const cards = ids
    .map((id) => {
      const safe = escapeHtml(id)
      return `<figure><img src="${safe}.webp" alt="${safe}" loading="lazy"><figcaption>${safe}</figcaption></figure>`
    })
    .join("\n")
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Exercise images</title>
<style>
body { margin: 0; padding: 16px; font: 14px/1.4 system-ui, sans-serif; background: #fff; color: #0f172a; }
h1 { font-size: 18px; margin: 0 0 16px; }
main { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
figure { margin: 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; }
figcaption { padding: 8px; font-family: ui-monospace, monospace; font-size: 12px; }
</style>
</head>
<body>
<h1>Exercise images (${ids.length}) · ${IMAGE_MODEL} ${IMAGE_SIZE} ${IMAGE_QUALITY}</h1>
<main>
${cards}
</main>
</body>
</html>
`
}
