/**
 * `pnpm images:generate [--samples | --only <id,…>] [--limit N] [--all]`: one exercise illustration
 * per catalog entry from OpenAI `gpt-image-1` (`POST /v1/images/generations`, plain fetch, no SDK),
 * written to `assets/illustrations/<catalogId>.webp`, then `_contact-sheet.html`. Existing files are
 * skipped; a run is capped at RUN_CAP images unless `--all`. Pure logic: src/illustrations/imagePrompt.ts.
 *
 * The key comes from `node --env-file-if-exists=.env.images` (package.json). This script never prints
 * it: logs carry the model, size and file names only, and API error text is redacted.
 * Runs on plain Node 24 (type stripping), with the same resolve hook as scripts/resolveTs.ts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Console, Data, Effect, Option, Result, Schedule, Schema } from "effect"

const apiKey = process.env.OPENAI_API_KEY ?? ""
if (apiKey.length === 0) {
  console.error("images:generate: OPENAI_API_KEY is not set. Put it in apps/mobile/.env.images.")
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

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const at = (path: string) => join(root, path)

const { CATALOG } = await import("@tanren/shared")
const P = await import("../src/illustrations/imagePrompt")
const { writeContactSheet } = await import("./contactSheet")

const fail = (message: string): never => {
  console.error(`images:generate: ${message}`)
  console.error(P.USAGE)
  return process.exit(2)
}

const args = Result.getOrElse(P.parseImageArgs(process.argv.slice(2)), fail)
const guide = Option.getOrElse(P.parseStyleGuide(readFileSync(at(P.STYLE_FILE), "utf8")), () =>
  fail(`${P.STYLE_FILE} needs a non-empty \`\`\`style and \`\`\`template block`),
)
const selection = Result.getOrElse(
  P.selectIds(
    args,
    CATALOG.map((entry) => entry.catalogId),
    (id) => existsSync(at(`${P.IMAGE_DIR}/${P.imageFile(id)}`)),
  ),
  fail,
)

/** Internal: one image request failed; reported per id, never crosses a schema boundary. */
class ImageFailed extends Data.TaggedError("ImageFailed")<{
  readonly id: string
  readonly reason: string
  /** Network errors, timeouts, 429 and 5xx are retried; other 4xx (policy, bad request) are not. */
  readonly retryable: boolean
}> {}

/** Per image: up to 3 retries 10 s, 20 s, 40 s apart; then the id is reported and the run goes on. */
const RETRIES = 3

const describe = (cause: unknown): string => P.redactSecrets(String(cause))

const generate = Effect.fn("generate")(function* (id: string) {
  const entry = yield* Effect.fromOption(
    Option.fromNullishOr(CATALOG.find((e) => e.catalogId === id)),
  ).pipe(
    Effect.mapError(() => new ImageFailed({ id, reason: "not in the catalog", retryable: false })),
  )
  const response = yield* Effect.tryPromise({
    try: (signal) =>
      fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: P.IMAGE_MODEL,
          prompt: P.exercisePrompt(guide, entry),
          n: 1,
          size: P.IMAGE_SIZE,
          quality: P.IMAGE_QUALITY,
          output_format: "webp",
          output_compression: P.IMAGE_COMPRESSION,
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]),
      }),
    catch: (cause) => new ImageFailed({ id, reason: describe(cause), retryable: true }),
  })
  const body = yield* Effect.tryPromise({
    try: () => response.json(),
    catch: () =>
      new ImageFailed({
        id,
        reason: `HTTP ${response.status}, body is not JSON`,
        retryable: true,
      }),
  })
  if (!response.ok) {
    const message = Option.match(Schema.decodeUnknownOption(P.ApiErrorBody)(body), {
      onNone: () => "no error message",
      onSome: (e) => describe(e.error.message),
    })
    return yield* new ImageFailed({
      id,
      reason: `HTTP ${response.status}: ${message}`,
      retryable: response.status === 429 || response.status >= 500,
    })
  }
  const image = Option.flatMap(Schema.decodeUnknownOption(P.ImagesResponse)(body), (b) =>
    Option.fromNullishOr(b.data[0]),
  )
  if (Option.isNone(image)) {
    return yield* new ImageFailed({ id, reason: "response has no b64_json image", retryable: true })
  }
  const file = `${P.IMAGE_DIR}/${P.imageFile(id)}`
  const bytes = Buffer.from(image.value.b64_json, "base64")
  yield* Effect.try({
    try: () => writeFileSync(at(file), bytes),
    catch: (cause) => new ImageFailed({ id, reason: describe(cause), retryable: false }),
  })
  yield* Console.log(`  wrote ${file} (${Math.round(bytes.length / 1024)} KB)`)
})

const program = Effect.gen(function* () {
  yield* Console.log(
    `images:generate ${P.IMAGE_MODEL} ${P.IMAGE_SIZE} ${P.IMAGE_QUALITY} webp: ${selection.ids.length} to generate, ${selection.existing} already exist${selection.deferred > 0 ? `, ${selection.deferred} deferred by the ${P.RUN_CAP}-image cap (pass --all)` : ""}`,
  )
  const attempt = (id: string) =>
    generate(id).pipe(
      Effect.tapError((e) =>
        e.retryable ? Console.error(`  retrying ${e.id}: ${e.reason}`) : Effect.void,
      ),
      Effect.retry({
        times: RETRIES,
        schedule: Schedule.exponential("10 seconds"),
        while: (e) => e.retryable,
      }),
      Effect.result,
    )
  const results = yield* Effect.forEach(selection.ids, attempt, { concurrency: 4 })
  const failures = results.flatMap((r) => (Result.isFailure(r) ? [r.failure] : []))
  yield* Effect.forEach(failures, (f) => Console.error(`  x ${f.id}: ${f.reason}`))
  const onSheet = writeContactSheet(root)
  yield* Console.log(
    `images:generate wrote ${results.length - failures.length} images, ${failures.length} failed; ${P.IMAGE_SHEET} lists ${onSheet}`,
  )
  return failures.length
})

const failed = await Effect.runPromise(program)
process.exit(failed === 0 ? 0 : 1)
