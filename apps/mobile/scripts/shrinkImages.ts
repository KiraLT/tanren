/**
 * `pnpm images:shrink`: re-encodes every `assets/illustrations/*.webp` to 512×512 (the app shows them
 * at 240 px, so 2x is enough). Idempotent: a file at most 520 px wide is left alone, so new 1024 px
 * output of `images:generate` is shrunk on the next run and shrunk files are never re-encoded.
 * Uses `sharp` (devDependency); plain Node 24 with type stripping.
 */
import { readdirSync, statSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Array as Arr, Console, Data, Effect } from "effect"
import sharp from "sharp"

const TARGET = 512
/** Files at or below this width count as already shrunk. */
const SKIP_AT_OR_BELOW = 520
const QUALITY = 75
/** Transparent output: the alpha plane is lossless by default and costs ~half the bytes; 80 is invisible on soft edges. */
const ALPHA_QUALITY = 80

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "illustrations")

/** Internal: one image could not be read or re-encoded; reported per file. */
class ShrinkFailed extends Data.TaggedError("ShrinkFailed")<{
  readonly file: string
  readonly cause: unknown
}> {}

type Outcome = "shrunk" | "skipped"

const shrink = (file: string): Effect.Effect<Outcome, ShrinkFailed> =>
  Effect.tryPromise({
    try: async (): Promise<Outcome> => {
      const path = join(dir, file)
      const { width = 0 } = await sharp(path).metadata()
      if (width <= SKIP_AT_OR_BELOW) return "skipped"
      const output = await sharp(path)
        .resize(TARGET, TARGET, { fit: "cover" })
        .webp({ quality: QUALITY, alphaQuality: ALPHA_QUALITY })
        .toBuffer()
      await writeFile(path, output)
      return "shrunk"
    },
    catch: (cause) => new ShrinkFailed({ file, cause }),
  })

const totalBytes = (files: ReadonlyArray<string>): number =>
  Arr.reduce(files, 0, (sum, file) => sum + statSync(join(dir, file)).size)

const program = Effect.gen(function* () {
  const files = readdirSync(dir).filter((file) => file.endsWith(".webp"))
  const before = totalBytes(files)
  const outcomes = yield* Effect.forEach(files, shrink, { concurrency: 8 })
  const shrunk = outcomes.filter((outcome) => outcome === "shrunk").length
  const mb = (bytes: number) => (bytes / 1_048_576).toFixed(2)
  yield* Console.log(
    `images:shrink ${shrunk} shrunk, ${files.length - shrunk} skipped; ${mb(before)} MB -> ${mb(totalBytes(files))} MB`,
  )
}).pipe(
  Effect.catchTag("ShrinkFailed", (error) =>
    Console.error(`images:shrink failed on ${error.file}: ${String(error.cause)}`).pipe(
      Effect.andThen(Effect.sync(() => process.exit(1))),
    ),
  ),
)

await Effect.runPromise(program)
