#!/usr/bin/env node
// Review-gallery manifest (GAL-2). Reads the gallery HTML, writes <screensDir>/gallery.json and prints
// (a) the Artifact `files` map for every referenced shot, (b) shots missing on disk, (c) duplicate badges.
// Exit code 1 when (b) or (c) is non-empty.
// Usage: node docs/design/gallery.mjs [gallery.html] [screensDir]
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const defaultHtml =
  "/private/tmp/claude-501/-Users-lukas-Documents-Personal-tanren/2f72436e-0cd5-4397-8737-fd4699a2ee88/scratchpad/tanren-screens.html"
const argv = process.argv.slice(2)
const publish = argv.includes("--publish")
const positional = argv.filter((a) => a !== "--publish")
const htmlPath = positional[0] ?? defaultHtml
const screensArg = positional[1] ?? "docs/design/screens"
const screensDir = resolve(repoRoot, screensArg)

const html = readFileSync(htmlPath, "utf8")
const strip = (text) =>
  text
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
const unique = (items) => [...new Set(items)]

// Everything between one `<section id="…">` and the next (or the end of the page).
const chunks = html.split(/<section\s+id="/).slice(1)
const sections = chunks.map((chunk) => {
  const id = chunk.slice(0, chunk.indexOf('"'))
  const body = chunk.split("</section>")[0] ?? chunk
  const title = strip(/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(body)?.[1] ?? "")
  const badges = [...body.matchAll(/<span class="badge"[^>]*>([\s\S]*?)<\/span>/g)].map((m) =>
    strip(m[1] ?? ""),
  )
  const shots = unique(
    [...body.matchAll(/<img[^>]*\ssrc="shots\/([^"]+)"/g)].map((m) => m[1] ?? ""),
  )
  return { badges, id, shots, title }
})

// No timestamp: the manifest only changes when the HTML does.
writeFileSync(join(screensDir, "gallery.json"), `${JSON.stringify({ sections }, null, 2)}\n`)

const allShots = unique(sections.flatMap((s) => s.shots)).sort()
const files = Object.fromEntries(allShots.map((f) => [`shots/${f}`, `${screensArg}/${f}`]))
const missing = allShots.filter((f) => !existsSync(join(screensDir, f)))

const seen = new Map()
for (const s of sections) {
  for (const b of s.badges) {
    seen.set(b, [...(seen.get(b) ?? []), s.id])
  }
}
const duplicates = [...seen.entries()].filter(([, where]) => where.length > 1)

if (publish) {
  // Only the map on stdout (pipe-able); shots that live only in the published artifact are kept
  // there by the publish (files left out are kept), so missing ones are a warning, not a failure.
  const present = Object.fromEntries(
    Object.entries(files).filter(([, path]) => existsSync(resolve(repoRoot, path))),
  )
  console.log(JSON.stringify(present, null, 2))
  if (missing.length > 0) {
    console.error(`warning: ${missing.length} referenced shots not on disk (kept from earlier publish)`)
    for (const f of missing) console.error(`  ${f}`)
  }
  for (const [badge, where] of duplicates) {
    console.error(`duplicate badge ${badge}: ${where.join(", ")}`)
  }
  process.exit(duplicates.length > 0 ? 1 : 0)
}

console.log("== files map ==")
console.log(JSON.stringify(files, null, 2))
console.log(`\n== sections: ${sections.length}, badges: ${[...seen.values()].flat().length}, shots: ${allShots.length} ==`)
console.log(`\n== missing files (${missing.length}) ==`)
for (const f of missing) console.log(`  ${f}`)
console.log(`\n== duplicate badges (${duplicates.length}) ==`)
for (const [badge, where] of duplicates) console.log(`  ${badge}: ${where.join(", ")}`)

process.exitCode = missing.length > 0 || duplicates.length > 0 ? 1 : 0
