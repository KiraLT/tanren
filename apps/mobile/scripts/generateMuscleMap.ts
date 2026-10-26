/**
 * `node --env-file-if-exists=.env.images scripts/generateMuscleMap.ts --out <dir> [--catalog <id,…> |
 * --catalog --all]` (from apps/mobile; no package.json script yet): one per-exercise muscle map (front +
 * back figure in one square, catalog primary/secondary muscles) from OpenAI `gpt-image-1`
 * (`POST /v1/images/generations`, plain fetch, transparent webp), written to `<dir>/<catalogId>.webp`.
 * No `--catalog`: the 5 `SAMPLE_IDS`. Existing files are skipped, so a re-run retries only failures.
 * `--reference <catalogId|auto>` (IMG-6): `POST /v1/images/edits` with that good map
 * (`assets/musclemaps/<id>.webp`) as the input image and a recolour-only prompt; `auto` picks the
 * good map whose muscles overlap most. Same size, quality and transparency as the text mode.
 * Cost: about $0.04 per medium 1024² image (5 samples ≈ $0.21; `--all`, 291 ids ≈ $12).
 * Pure logic: src/illustrations/muscleMapPrompt.ts.
 *
 * The key comes from `node --env-file-if-exists=.env.images`; this script never prints it, and API
 * error text goes through `redactSecrets`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Console, Data, Effect, Option, Result, Schedule, Schema } from "effect"

const apiKey = process.env.OPENAI_API_KEY ?? ""
if (apiKey.length === 0) {
  console.error("images:muscle: OPENAI_API_KEY is not set. Put it in apps/mobile/.env.images.")
  process.exit(1)
}

registerHooks({
  resolve: (specifier, context, nextResolve) => {
    const parent = context.parentURL
    const candidate =
      parent !== undefined && specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)
        ? [`${specifier}.ts`, `${specifier}/index.ts`].find((s) =>
            existsSync(fileURLToPath(new URL(s, parent))),
          )
        : undefined
    return nextResolve(candidate ?? specifier, context)
  },
})

const { CATALOG } = await import("@tanren/shared")
const P = await import("../src/illustrations/imagePrompt")
const M = await import("../src/illustrations/muscleMapPrompt")

const usageExit = (message: string): never => {
  console.error(`images:muscle: ${message}`)
  console.error(M.MUSCLE_USAGE)
  return process.exit(2)
}
const args = Result.getOrElse(M.parseMuscleArgs(process.argv.slice(2)), usageExit)
const maps = Result.getOrElse(M.selectMaps(args.selection, CATALOG), usageExit)
const outDir = resolve(args.out)
mkdirSync(outDir, { recursive: true })

/** Internal: one image request failed; reported per map. */
class MapFailed extends Data.TaggedError("MapFailed")<{
  readonly name: string
  readonly reason: string
  /** Network error, 429 or 5xx: worth another attempt. A refusal (400) or a write error is not. */
  readonly retryable: boolean
}> {}

/** Committed good maps: the reference-edit inputs (`--reference`). */
const mapsDir = join(dirname(fileURLToPath(import.meta.url)), "..", M.MUSCLE_MAP_DIR)

/** Edits model; `MUSCLE_EDIT_MODEL` overrides it (the account may not offer `gpt-image-1` there). */
const EDIT_MODEL = process.env.MUSCLE_EDIT_MODEL ?? P.IMAGE_MODEL

/** Reference catalog id for one map: the `--reference` id, or (auto) the best-overlapping good map. */
const referenceFor = (entry: (typeof maps)[number]): Option.Option<string> =>
  Option.flatMap(args.reference, (ref) =>
    ref === "auto"
      ? Option.map(
          M.pickReference(entry, CATALOG, [
            ...M.MISSING_MUSCLE_MAPS,
            ...CATALOG.map((c) => c.catalogId).filter(
              (id) => !existsSync(join(mapsDir, `${id}.webp`)),
            ),
          ]),
          (picked) => picked.catalogId,
        )
      : existsSync(join(mapsDir, `${ref}.webp`))
        ? Option.some(ref)
        : Option.none(),
  )

/**
 * `POST /v1/images/edits` (multipart/form-data; `image` + `prompt` required, `model`, `n`, `size`,
 * `quality`, `background`, `output_format`, `output_compression` optional; checked against the OpenAI
 * OpenAPI spec via context7, IMG-6). The reference webp is the input image.
 */
const editRequest = (entry: (typeof maps)[number], referenceId: string, signal: AbortSignal) => {
  const form = new FormData()
  form.append("model", EDIT_MODEL)
  form.append("prompt", M.muscleMapEditPrompt(entry))
  form.append("n", "1")
  form.append("size", P.IMAGE_SIZE)
  form.append("quality", P.IMAGE_QUALITY)
  form.append("output_format", "webp")
  form.append("output_compression", String(P.IMAGE_COMPRESSION))
  form.append("background", "transparent")
  form.append(
    "image",
    new Blob([readFileSync(join(mapsDir, `${referenceId}.webp`))], { type: "image/webp" }),
    `${referenceId}.webp`,
  )
  return fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]),
  })
}

/** Extra attempts per map after the first, with exponential back-off from 10 s. */
const RETRIES = 3

const generate = Effect.fn("generate")(function* (entry: (typeof maps)[number]) {
  const spec = { name: entry.catalogId }
  const file = join(outDir, `${spec.name}.webp`)
  if (existsSync(file)) return yield* Console.log(`  skip ${spec.name} (exists)`)
  const started = performance.now()
  const reference = Option.isSome(args.reference) ? Option.some(referenceFor(entry)) : Option.none()
  if (Option.isSome(reference) && Option.isNone(reference.value)) {
    return yield* new MapFailed({
      name: spec.name,
      reason: "no reference map found (auto) or the reference id has no file",
      retryable: false,
    })
  }
  const response = yield* Effect.tryPromise({
    try: (signal) =>
      Option.isSome(reference) && Option.isSome(reference.value)
        ? editRequest(entry, reference.value.value, signal)
        : fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: P.IMAGE_MODEL,
              prompt: M.muscleMapPrompt(entry),
              n: 1,
              size: P.IMAGE_SIZE,
              quality: P.IMAGE_QUALITY,
              output_format: "webp",
              output_compression: P.IMAGE_COMPRESSION,
              ...P.backgroundParams(true),
            }),
            signal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]),
          }),
    catch: (cause) =>
      new MapFailed({ name: spec.name, reason: P.redactSecrets(String(cause)), retryable: true }),
  })
  if (Option.isSome(reference) && Option.isSome(reference.value)) {
    yield* Console.log(`  edit ${spec.name} from reference ${reference.value.value}`)
  }
  const body = yield* Effect.tryPromise({
    try: () => response.json(),
    catch: () =>
      new MapFailed({
        name: spec.name,
        reason: `HTTP ${response.status}, not JSON`,
        retryable: true,
      }),
  })
  if (!response.ok) {
    const message = Option.match(Schema.decodeUnknownOption(P.ApiErrorBody)(body), {
      onNone: () => "no error message",
      onSome: (e) => P.redactSecrets(e.error.message),
    })
    return yield* new MapFailed({
      name: spec.name,
      reason: `HTTP ${response.status}: ${message}`,
      retryable: response.status === 429 || response.status >= 500,
    })
  }
  const image = Option.flatMap(Schema.decodeUnknownOption(P.ImagesResponse)(body), (b) =>
    Option.fromNullishOr(b.data[0]),
  )
  if (Option.isNone(image)) {
    return yield* new MapFailed({
      name: spec.name,
      reason: "response has no b64_json image",
      retryable: true,
    })
  }
  const bytes = Buffer.from(image.value.b64_json, "base64")
  yield* Effect.try({
    try: () => writeFileSync(file, bytes),
    catch: (cause) =>
      new MapFailed({ name: spec.name, reason: P.redactSecrets(String(cause)), retryable: false }),
  })
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  yield* Console.log(
    `  wrote ${spec.name}.webp (${Math.round(bytes.length / 1024)} KB, ${seconds} s)`,
  )
})

const program = Effect.gen(function* () {
  yield* Console.log(
    `images:muscle ${P.IMAGE_MODEL} ${P.IMAGE_SIZE} ${P.IMAGE_QUALITY} webp transparent: ${maps.length} maps into ${outDir}`,
  )
  const attempt = (entry: (typeof maps)[number]) =>
    generate(entry).pipe(
      Effect.tapError((e) =>
        e.retryable ? Console.error(`  retrying ${e.name}: ${e.reason}`) : Effect.void,
      ),
      Effect.retry({
        times: RETRIES,
        schedule: Schedule.exponential("10 seconds"),
        while: (e) => e.retryable,
      }),
      Effect.result,
    )
  const results = yield* Effect.forEach(maps, attempt, { concurrency: 3 })
  const failures = results.flatMap((r) => (Result.isFailure(r) ? [r.failure] : []))
  yield* Effect.forEach(failures, (f) => Console.error(`  x ${f.name}: ${f.reason}`))
  return failures.length
})

const failed = await Effect.runPromise(program)
process.exit(failed === 0 ? 0 : 1)
