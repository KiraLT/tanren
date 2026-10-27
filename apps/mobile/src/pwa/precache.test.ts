import { describe, expect, it } from "vitest"
import {
  PRECACHE_PLACEHOLDER,
  precacheUrls,
  renderServiceWorker,
  VERSION_PLACEHOLDER,
} from "./precache"

const exportFiles = [
  "_headers",
  "metadata.json",
  "robots.txt",
  "og.png",
  "sw.js",
  "index.html",
  "manifest.json",
  "icons/icon-192.png",
  "icons/apple-touch-180.png",
  "_expo/static/js/web/entry-5ea457b7.js",
  "_expo/static/js/web/[id]-18a6a2df.js",
  "assets/assets/fonts/BarlowCondensed-Bold.f599739e.ttf",
  "assets/assets/sounds/beep.3925237b.wav",
  "assets/__node_modules/.pnpm/expo-sqlite@58.0.14_x/node_modules/expo-sqlite/web/wa-sqlite/wa-sqlite.5e61fe84.wasm",
  "assets/assets/illustrations/ab-wheel-rollout.be5f4075.webp",
  "assets/assets/musclemaps/chest.1234abcd.webp",
]

describe("precacheUrls", () => {
  it("lists the shell, every bundle, font, wasm, sound, icon and the manifest", () => {
    expect(precacheUrls(exportFiles)).toEqual([
      "/",
      "/_expo/static/js/web/[id]-18a6a2df.js",
      "/_expo/static/js/web/entry-5ea457b7.js",
      "/assets/__node_modules/.pnpm/expo-sqlite@58.0.14_x/node_modules/expo-sqlite/web/wa-sqlite/wa-sqlite.5e61fe84.wasm",
      "/assets/assets/fonts/BarlowCondensed-Bold.f599739e.ttf",
      "/assets/assets/sounds/beep.3925237b.wav",
      "/icons/apple-touch-180.png",
      "/icons/icon-192.png",
      "/manifest.json",
    ])
  })

  it("leaves illustrations and muscle maps to the runtime cache", () => {
    const urls = precacheUrls(exportFiles)
    expect(urls.some((url) => url.includes("/illustrations/"))).toBe(false)
    expect(urls.some((url) => url.includes("/musclemaps/"))).toBe(false)
  })

  it("never precaches the worker itself, the headers file or dotfiles", () => {
    expect(precacheUrls(["sw.js", "_headers", ".DS_Store", "icons/.DS_Store"])).toEqual([
      "/icons/.DS_Store",
    ])
  })
})

describe("renderServiceWorker", () => {
  const template = `const VERSION = ${VERSION_PLACEHOLDER}\nconst PRECACHE = ${PRECACHE_PLACEHOLDER}\n`

  it("writes the version and the list as JSON literals", () => {
    expect(renderServiceWorker(template, ["/", "/manifest.json"], "abc123")).toEqual({
      _tag: "Rendered",
      source: 'const VERSION = "abc123"\nconst PRECACHE = ["/","/manifest.json"]\n',
    })
  })

  it("reports a template without the precache placeholder", () => {
    expect(renderServiceWorker(`const VERSION = ${VERSION_PLACEHOLDER}`, ["/"], "v")).toEqual({
      _tag: "MissingPlaceholder",
      placeholder: PRECACHE_PLACEHOLDER,
    })
  })

  it("reports a template without the version placeholder", () => {
    expect(renderServiceWorker(`const PRECACHE = ${PRECACHE_PLACEHOLDER}`, ["/"], "v")).toEqual({
      _tag: "MissingPlaceholder",
      placeholder: VERSION_PLACEHOLDER,
    })
  })
})
