/**
 * Post-export step (PWA-1): writes `<dist>/sw.js` from `src/pwa/sw.template.js` with the export's
 * precache list (`src/pwa/precache.ts`, generated from the files in `<dist>`, never hand-kept) and a
 * version = sha256 over the precached files' paths and bytes, so any changed file installs a new
 * worker. Run after `expo export --platform web`:
 *   node --import ./scripts/resolveTs.ts scripts/serviceWorker.ts [dist]   (default `dist`)
 */
import { createHash } from "node:crypto"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { precacheUrls, renderServiceWorker } from "../src/pwa/precache"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const dist = resolve(root, process.argv[2] ?? "dist")

const files = readdirSync(dist, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => relative(dist, join(entry.parentPath, entry.name)).split(sep).join("/"))

const urls = precacheUrls(files)
const hash = urls.reduce(
  (acc, url) =>
    acc.update(url).update(readFileSync(join(dist, url === "/" ? "index.html" : url.slice(1)))),
  createHash("sha256"),
)
const version = hash.digest("hex").slice(0, 16)
const result = renderServiceWorker(
  readFileSync(join(root, "src/pwa/sw.template.js"), "utf8"),
  urls,
  version,
)

if (result._tag === "Rendered") {
  writeFileSync(join(dist, "sw.js"), result.source)
  console.log(`sw.js ${version}: ${urls.length} precached URLs`)
} else {
  console.error(`sw.template.js lost its placeholder ${result.placeholder}`)
  process.exit(1)
}
