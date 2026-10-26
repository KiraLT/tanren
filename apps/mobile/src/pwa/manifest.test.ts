import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { darkColors, lightColors } from "../ui/colors"

/** The LOGO-2 icon background (`assets/brand/icon.png`), also the splash and adaptive-icon colour. */
const BRAND_GRAPHITE = "#16181D"
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public")
const readPublic = (file: string): string => readFileSync(join(publicDir, file), "utf8")

const ManifestIcon = Schema.Struct({
  src: Schema.String,
  sizes: Schema.String,
  type: Schema.String,
  purpose: Schema.optionalKey(Schema.String),
})
const Manifest = Schema.Struct({
  name: Schema.String,
  short_name: Schema.String,
  id: Schema.String,
  start_url: Schema.String,
  scope: Schema.String,
  display: Schema.String,
  background_color: Schema.String,
  theme_color: Schema.String,
  icons: Schema.Array(ManifestIcon),
})

const manifest = Schema.decodeUnknownSync(Manifest)(JSON.parse(readPublic("manifest.json")))

describe("public/manifest.json", () => {
  it("has the install fields", () => {
    expect(manifest).toMatchObject({
      name: "Tanren",
      short_name: "Tanren",
      id: "/",
      start_url: "/today",
      scope: "/",
      display: "standalone",
    })
  })

  it("uses the brand graphite (the icon background) for its colours", () => {
    expect(manifest.theme_color).toBe(BRAND_GRAPHITE)
    expect(manifest.background_color).toBe(BRAND_GRAPHITE)
  })

  it("lists the 192, 512, maskable and apple touch icons", () => {
    const by = (src: string) => manifest.icons.find((icon) => icon.src === src)
    expect(by("icons/icon-192.png")).toMatchObject({ sizes: "192x192", type: "image/png" })
    expect(by("icons/icon-512.png")).toMatchObject({ sizes: "512x512", type: "image/png" })
    expect(by("icons/maskable-512.png")).toMatchObject({
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    })
    expect(by("icons/apple-touch-180.png")).toMatchObject({ sizes: "180x180", type: "image/png" })
  })

  it("points every icon at a file that exists", () => {
    const files = manifest.icons.map((icon) => icon.src)
    const missing = files.filter((file) => !existsSync(join(publicDir, file)))
    expect(missing).toEqual([])
  })
})

describe("public/index.html", () => {
  const html = readPublic("index.html")

  it("links the manifest and icons", () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.json" />')
    expect(html).toContain('<link rel="icon" href="/icons/icon-192.png" type="image/png" />')
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-180.png" />')
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />')
  })

  it("sets theme-color to the manifest theme_color", () => {
    expect(html).toContain(`<meta name="theme-color" content="${manifest.theme_color}" />`)
  })

  it("adds a dark-scheme theme-color and page background equal to the Forge dark bg", () => {
    expect(html).toContain(
      `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${darkColors.bg}" />`,
    )
    expect(html).toContain(`background: ${darkColors.bg.toLowerCase()};`)
    expect(html).toContain(`background: ${lightColors.bg.toLowerCase()};`)
  })
})
