/**
 * Pure half of the web service worker build (PWA-1): which files of an `expo export --platform web`
 * output the service worker precaches, and how the precache list is written into the worker
 * template (`src/pwa/sw.template.js`). The CLI is `scripts/serviceWorker.ts`.
 */
import { Array as Arr, Order } from "effect"

/** Placeholders in `sw.template.js`, replaced with JSON literals. */
export const VERSION_PLACEHOLDER = '"__TANREN_SW_VERSION__"'
export const PRECACHE_PLACEHOLDER = '["__TANREN_SW_PRECACHE__"]'

/** Files the export writes that the browser never fetches, or the worker itself. */
const SKIPPED_FILES: ReadonlyArray<string> = [
  "_headers",
  "metadata.json",
  "robots.txt",
  "og.png",
  "sw.js",
]

/**
 * Exercise illustrations and muscle maps: ~10 MB, opened one screen at a time. The worker caches
 * each on first view (`tanren-media`) instead of downloading all of them on install.
 */
const RUNTIME_ONLY_PREFIXES: ReadonlyArray<string> = [
  "assets/assets/illustrations/",
  "assets/assets/musclemaps/",
]

const isPrecached = (file: string): boolean =>
  !SKIPPED_FILES.includes(file) &&
  !file.startsWith(".") &&
  !RUNTIME_ONLY_PREFIXES.some((prefix) => file.startsWith(prefix))

/**
 * Precache URLs for the export's files (paths relative to `dist/`, `/`-separated): every bundle,
 * font, wasm, sound, icon and the manifest, with `index.html` as `/` (the static host answers `/`
 * with the shell and redirects `/index.html`, and a redirected response cannot answer a
 * navigation). Paths are not percent-encoded: the browser requests `[id]-<hash>.js` with raw
 * brackets, and the cache key must match that URL.
 */
export const precacheUrls = (files: ReadonlyArray<string>): ReadonlyArray<string> =>
  Arr.sort(
    Arr.map(Arr.filter(files, isPrecached), (file) => (file === "index.html" ? "/" : `/${file}`)),
    Order.String,
  )

export type RenderResult =
  | { readonly _tag: "Rendered"; readonly source: string }
  | { readonly _tag: "MissingPlaceholder"; readonly placeholder: string }

/** Writes the version and the precache list into the template; both placeholders must be present. */
export const renderServiceWorker = (
  template: string,
  urls: ReadonlyArray<string>,
  version: string,
): RenderResult => {
  const missing = [VERSION_PLACEHOLDER, PRECACHE_PLACEHOLDER].find(
    (placeholder) => !template.includes(placeholder),
  )
  return missing === undefined
    ? {
        _tag: "Rendered",
        source: template
          .replace(VERSION_PLACEHOLDER, JSON.stringify(version))
          .replace(PRECACHE_PLACEHOLDER, JSON.stringify(urls)),
      }
    : { _tag: "MissingPlaceholder", placeholder: missing }
}
