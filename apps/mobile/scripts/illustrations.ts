/**
 * `illustrations:build` / `illustrations:check` (v2-catalog.md §5). A thin IO shell over the pure
 * functions in `src/illustrations/build.ts` and `validate.ts`; node:fs is acceptable here because
 * this is a dev-time Node script, never bundled into the app.
 *
 * Runs on plain Node 24 (type stripping). `@tanren/shared` and our sources use extensionless
 * relative imports (`moduleResolution: bundler`), which Node's ESM resolver rejects, so a sync
 * resolve hook retries `<specifier>.ts` and `<specifier>/index.ts` before anything is imported.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { Array as Arr, Order } from "effect"
import type { Scene } from "../src/illustrations/compose"

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
const build = await import("../src/illustrations/build")
const validate = await import("../src/illustrations/validate")

const scenesDir = at("src/illustrations/scenes")
const batchNames = Arr.sort(
  readdirSync(scenesDir)
    .filter(build.isBatchFile)
    .map((file) => file.replace(/\.ts$/, "")),
  Order.String,
)

const batches = await Promise.all(
  batchNames.map(async (name) => {
    // A batch module's contract (v2-catalog.md §5); the import is dynamic, so it is typed here.
    const module: { readonly scenes: ReadonlyArray<Scene> } = await import(
      pathToFileURL(join(scenesDir, `${name}.ts`)).href
    )
    return { name, scenes: module.scenes }
  }),
)

const rendered = build.renderBatches(batches, CATALOG)
const outputs = build.buildOutputs(batches, CATALOG)

const listDir = (dir: string, pattern: RegExp): ReadonlyArray<string> =>
  existsSync(at(dir))
    ? readdirSync(at(dir))
        .filter((file) => pattern.test(file))
        .map((file) => `${dir}/${file}`)
    : []

const mode = process.argv[2]

if (mode === "build") {
  mkdirSync(at(build.SVG_DIR), { recursive: true })
  mkdirSync(at(build.GENERATED_DIR), { recursive: true })
  outputs.forEach((file) => {
    writeFileSync(at(file.path), file.content)
  })
  writeFileSync(at(build.CONTACT_SHEET), build.contactSheet(rendered))
  console.log(
    `illustrations:build wrote ${rendered.length} SVGs from ${batches.length} batches (${batchNames.join(", ")}) + ${build.CONTACT_SHEET}`,
  )
} else if (mode === "check") {
  const committedPaths = [
    ...listDir(build.SVG_DIR, /^[a-z0-9-]+\.svg$/),
    ...listDir(build.GENERATED_DIR, /\.ts$/),
  ]
  const committed = new Map(committedPaths.map((path) => [path, readFileSync(at(path), "utf8")]))
  const summary = validate.checkAll({
    svgs: rendered.map((r) => ({ id: r.id, svg: r.svg })),
    expected: outputs,
    committed,
    catalogIds: CATALOG.map((entry) => entry.illustrationId),
  })
  summary.failures.forEach((f) => {
    console.error(`  x [${f.rule}] ${f.subject}: ${f.message}`)
  })
  console.log(validate.formatSummary(summary))
  process.exit(summary.failures.length === 0 ? 0 : 1)
} else {
  console.error("usage: node scripts/illustrations.ts build|check")
  process.exit(2)
}
