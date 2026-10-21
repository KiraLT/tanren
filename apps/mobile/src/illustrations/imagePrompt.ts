/**
 * Pure half of `pnpm images:generate` (scripts/generateIllustrations.ts): flags, which catalog ids
 * to generate, the prompt per exercise from `assets/illustrations/style.md`, the OpenAI Images
 * response shapes and the contact sheet. Dev-time only; nothing here is bundled into the app.
 */
import type { CatalogExercise } from "@tanren/shared"
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
  "name" | "equipment" | "instructions" | "primaryMuscles"
>

const sentence = (line: string): string => (/[.!?]$/.test(line) ? line : `${line}.`)

/** Style block, a blank line, then the template filled with the exercise's facts. */
export const exercisePrompt = (guide: StyleGuide, facts: PromptFacts): string => {
  const equipment =
    facts.equipment.length === 0
      ? "bodyweight, no equipment"
      : facts.equipment.map(humanize).join(" and ")
  const filled = guide.template
    .replaceAll("{{name}}", facts.name)
    .replaceAll("{{equipment}}", equipment)
    .replaceAll("{{instructions}}", Arr.take(facts.instructions, 2).map(sentence).join(" "))
    .replaceAll("{{primary}}", facts.primaryMuscles.map(humanize).join(" and "))
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
