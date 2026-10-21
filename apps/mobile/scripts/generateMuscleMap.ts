/**
 * `node --env-file-if-exists=.env.images scripts/generateMuscleMap.ts --out <dir>` (from apps/mobile;
 * no package.json script yet, IMG-3 is a sample): the IMG-3 sample muscle maps (`SAMPLE_MAPS`, 3 images) from
 * OpenAI `gpt-image-1` (`POST /v1/images/generations`, plain fetch, transparent webp), written to
 * `<dir>/<name>.webp`. Existing files are skipped. Cost: 3 medium 1024² images per run (about
 * $0.13). Pure logic: src/illustrations/muscleMapPrompt.ts.
 *
 * The key comes from `node --env-file-if-exists=.env.images`; this script never prints it, and API
 * error text goes through `redactSecrets`.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Console, Data, Effect, Option, Result, Schema } from "effect"

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

const P = await import("../src/illustrations/imagePrompt")
const M = await import("../src/illustrations/muscleMapPrompt")

const outDir = resolve(
  Result.getOrElse(M.parseMuscleArgs(process.argv.slice(2)), (message): never => {
    console.error(`images:muscle: ${message}`)
    console.error(M.MUSCLE_USAGE)
    return process.exit(2)
  }),
)
mkdirSync(outDir, { recursive: true })

/** Internal: one image request failed; reported per map. */
class MapFailed extends Data.TaggedError("MapFailed")<{
  readonly name: string
  readonly reason: string
}> {}

const generate = Effect.fn("generate")(function* (spec: (typeof M.SAMPLE_MAPS)[number]) {
  const file = join(outDir, `${spec.name}.webp`)
  if (existsSync(file)) return yield* Console.log(`  skip ${spec.name} (exists)`)
  const started = performance.now()
  const response = yield* Effect.tryPromise({
    try: (signal) =>
      fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: P.IMAGE_MODEL,
          prompt: M.muscleMapPrompt(spec),
          n: 1,
          size: P.IMAGE_SIZE,
          quality: P.IMAGE_QUALITY,
          output_format: "webp",
          output_compression: P.IMAGE_COMPRESSION,
          ...P.backgroundParams(true),
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]),
      }),
    catch: (cause) => new MapFailed({ name: spec.name, reason: P.redactSecrets(String(cause)) }),
  })
  const body = yield* Effect.tryPromise({
    try: () => response.json(),
    catch: () => new MapFailed({ name: spec.name, reason: `HTTP ${response.status}, not JSON` }),
  })
  if (!response.ok) {
    const message = Option.match(Schema.decodeUnknownOption(P.ApiErrorBody)(body), {
      onNone: () => "no error message",
      onSome: (e) => P.redactSecrets(e.error.message),
    })
    return yield* new MapFailed({ name: spec.name, reason: `HTTP ${response.status}: ${message}` })
  }
  const image = Option.flatMap(Schema.decodeUnknownOption(P.ImagesResponse)(body), (b) =>
    Option.fromNullishOr(b.data[0]),
  )
  if (Option.isNone(image)) {
    return yield* new MapFailed({ name: spec.name, reason: "response has no b64_json image" })
  }
  const bytes = Buffer.from(image.value.b64_json, "base64")
  yield* Effect.try({
    try: () => writeFileSync(file, bytes),
    catch: (cause) => new MapFailed({ name: spec.name, reason: P.redactSecrets(String(cause)) }),
  })
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  yield* Console.log(
    `  wrote ${spec.name}.webp (${Math.round(bytes.length / 1024)} KB, ${seconds} s)`,
  )
})

const program = Effect.gen(function* () {
  yield* Console.log(
    `images:muscle ${P.IMAGE_MODEL} ${P.IMAGE_SIZE} ${P.IMAGE_QUALITY} webp transparent: ${M.SAMPLE_MAPS.length} maps into ${outDir}`,
  )
  const results = yield* Effect.forEach(M.SAMPLE_MAPS, (s) => Effect.result(generate(s)), {
    concurrency: 3,
  })
  const failures = results.flatMap((r) => (Result.isFailure(r) ? [r.failure] : []))
  yield* Effect.forEach(failures, (f) => Console.error(`  x ${f.name}: ${f.reason}`))
  return failures.length
})

const failed = await Effect.runPromise(program)
process.exit(failed === 0 ? 0 : 1)
