/**
 * `node scripts/shrinkMuscleMaps.ts <srcDir>`: re-encodes every `<srcDir>/*.webp` (1024 px output of
 * `generateMuscleMap.ts`) to 384×384 webp q70 (alphaQuality 80, transparent) into
 * `assets/musclemaps/<same name>`. The source is left untouched; an existing target is overwritten,
 * so the step is idempotent. Uses `sharp` (devDependency); plain Node 24 with type stripping.
 */
import { mkdirSync, readdirSync, statSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Array as Arr, Console, Data, Effect } from "effect"
import sharp from "sharp"

const TARGET = 384
const QUALITY = 70
const ALPHA_QUALITY = 80

const source = process.argv[2]
if (source === undefined) {
  console.error("usage: node scripts/shrinkMuscleMaps.ts <srcDir>")
  process.exit(2)
}
const srcDir = resolve(source)
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "musclemaps")
mkdirSync(outDir, { recursive: true })

/** Internal: one image could not be read or re-encoded; reported per file. */
class ShrinkFailed extends Data.TaggedError("ShrinkFailed")<{
  readonly file: string
  readonly cause: unknown
}> {}

const shrink = (file: string) =>
  Effect.tryPromise({
    try: async () => {
      const output = await sharp(join(srcDir, file))
        .resize(TARGET, TARGET, { fit: "cover" })
        .webp({ quality: QUALITY, alphaQuality: ALPHA_QUALITY })
        .toBuffer()
      await writeFile(join(outDir, file), output)
    },
    catch: (cause) => new ShrinkFailed({ file, cause }),
  })

const totalBytes = (dir: string, files: ReadonlyArray<string>): number =>
  Arr.reduce(files, 0, (sum, file) => sum + statSync(join(dir, file)).size)

const program = Effect.gen(function* () {
  const files = readdirSync(srcDir).filter((file) => /^[a-z0-9-]+\.webp$/.test(file))
  yield* Effect.forEach(files, shrink, { concurrency: 8 })
  const mb = (bytes: number) => (bytes / 1_048_576).toFixed(2)
  yield* Console.log(
    `muscleMaps:shrink ${files.length} files, ${mb(totalBytes(srcDir, files))} MB -> ${mb(totalBytes(outDir, files))} MB in ${outDir}`,
  )
})

// A ShrinkFailed rejects the run: Node prints it and exits non-zero.
await Effect.runPromise(program)
